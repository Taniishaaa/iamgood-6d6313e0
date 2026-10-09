import { createClient } from "npm:@supabase/supabase-js@2";

console.log("[send-sos-alert] module loaded");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// -----------------------------------------------------------------------------
// Web Push utilities
// -----------------------------------------------------------------------------

const VAPID_PUBLIC_KEY =
  "BJq2e6gs1zTIdmNLo6v4DWL4trzwEedK_ghxuB9wb63nlh_y1ShYf2RS_IKdDdPu59tQJ3pLk5XHed6pGZ141lw";

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function importVapidKeys(
  publicKeyBase64url: string,
  privateKeyBase64url: string,
) {
  const privateKeyBytes = base64urlToBytes(privateKeyBase64url);
  const publicKeyBytes = base64urlToBytes(publicKeyBase64url);

  return await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64url(publicKeyBytes.slice(1, 33)),
      y: bytesToBase64url(publicKeyBytes.slice(33, 65)),
      d: bytesToBase64url(privateKeyBytes),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function createJWT(
  vapidPrivateKey: CryptoKey,
  audience: string,
  subject: string,
) {
  const header = {
    typ: "JWT",
    alg: "ES256",
  };

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    aud: audience,
    exp: now + 86400,
    sub: subject,
  };

  const headerB64 = bytesToBase64url(
    new TextEncoder().encode(JSON.stringify(header)),
  );

  const payloadB64 = bytesToBase64url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );

  const unsigned = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    vapidPrivateKey,
    new TextEncoder().encode(unsigned),
  );

  const sigBytes = new Uint8Array(signature);

  let r: Uint8Array;
  let s: Uint8Array;

  if (sigBytes[0] === 0x30) {
    const rLen = sigBytes[3];
    const rStart = 4;

    r = sigBytes.slice(rStart, rStart + rLen);

    const sLen = sigBytes[rStart + rLen + 1];
    const sStart = rStart + rLen + 2;

    s = sigBytes.slice(sStart, sStart + sLen);

    if (r.length > 32) {
      r = r.slice(r.length - 32);
    }

    if (s.length > 32) {
      s = s.slice(s.length - 32);
    }

    if (r.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(r, 32 - r.length);
      r = padded;
    }

    if (s.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(s, 32 - s.length);
      s = padded;
    }
  } else {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  }

  const rawSig = new Uint8Array(64);

  rawSig.set(r, 0);
  rawSig.set(s, 32);

  return `${unsigned}.${bytesToBase64url(rawSig)}`;
}

async function sendPushNotification(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
) {
  const privateKey = await importVapidKeys(
    vapidPublicKey,
    vapidPrivateKey,
  );

  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  const jwt = await createJWT(
    privateKey,
    audience,
    vapidSubject,
  );

  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body: JSON.stringify(payload),
  });
}

// -----------------------------------------------------------------------------
// Phone normalization
// -----------------------------------------------------------------------------

function normalizePhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  const digits = String(raw).replace(/\D/g, "");

  if (digits.length < 10) {
    return null;
  }

  // India default:
  // 9876543210 -> 919876543210
  // 919876543210 -> unchanged
  const withCc = digits.startsWith("91")
    ? digits
    : `91${digits}`;

  if (withCc.length < 11 || withCc.length > 15) {
    return null;
  }

  return withCc;
}

// -----------------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  console.log(
    "[send-sos-alert] request received",
    {
      method: req.method,
      url: req.url,
    },
  );

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    let {
      user_id,
      message,
      guardian_emails,
      guardian_phones,
      doctor_email,
      doctor_name,
      user_name,
      sos_event_id,
    } = body as any;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
    );

    // -------------------------------------------------------------------------
    // Authentication
    // -------------------------------------------------------------------------

    const authHeader =
      req.headers.get("Authorization") || "";

    const bearer = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    // DB trigger / cron safety-net calls use service role.
    const isServiceRoleCaller =
      !!bearer && bearer === serviceKey;

    let activeSosId: string | null = null;

    // -------------------------------------------------------------------------
    // Service-role invocation
    // -------------------------------------------------------------------------

    if (isServiceRoleCaller) {
      if (!sos_event_id) {
        return new Response(
          JSON.stringify({
            error:
              "sos_event_id required for service-role invocation",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const { data: sosRow, error: sosErr } =
        await supabase
          .from("sos_events")
          .select("id, user_id, status")
          .eq("id", sos_event_id)
          .maybeSingle();

      if (sosErr || !sosRow) {
        return new Response(
          JSON.stringify({
            error: "sos_event not found",
          }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Idempotency:
      // If this SOS already has a delivery attempt, do not send it again.
      const { count: existingAttempts } =
        await supabase
          .from("sos_message_attempts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("sos_event_id", sos_event_id);

      if ((existingAttempts ?? 0) > 0) {
        console.log(
          "[send-sos-alert] idempotent skip: attempts exist for",
          sos_event_id,
        );

        return new Response(
          JSON.stringify({
            skipped: true,
            reason: "already_dispatched",
            sos_event_id,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      user_id = sosRow.user_id;
      activeSosId = sosRow.id;

      const { data: prof } =
        await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user_id)
          .maybeSingle();

      user_name =
        user_name ||
        prof?.full_name ||
        "A Check-iN user";

      message =
        message ||
        `🚨 SOS ALERT from ${user_name} — immediate attention needed.`;
    }

    // -------------------------------------------------------------------------
    // Normal authenticated user invocation
    // -------------------------------------------------------------------------

    else {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const userClient = createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization: authHeader,
            },
          },
        },
      );

      const { data: userData, error: userErr } =
        await userClient.auth.getUser();

      if (userErr || !userData?.user) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const callerId = userData.user.id;

      if (!user_id || !message) {
        return new Response(
          JSON.stringify({
            error: "user_id and message required",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // User can send SOS for themselves.
      // A linked accepted guardian can also send SOS for the ward.
      if (callerId !== user_id) {
        const { data: guardianRow } =
          await supabase
            .from("guardians")
            .select("id")
            .eq("user_id", user_id)
            .eq("guardian_user_id", callerId)
            .eq("status", "accepted")
            .maybeSingle();

        if (!guardianRow) {
          return new Response(
            JSON.stringify({
              error: "Forbidden",
            }),
            {
              status: 403,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      // Associate this invocation with the latest SOS event.
      try {
        const { data: sosRow } =
          await supabase
            .from("sos_events")
            .select("id")
            .eq("user_id", user_id)
            .order("triggered_at", {
              ascending: false,
            })
            .limit(1)
            .maybeSingle();

        activeSosId = sosRow?.id ?? null;
      } catch (e) {
        console.error(
          "[send-sos-alert] sos_events fetch error:",
          e,
        );
      }

      if (activeSosId) {
        const { count: existingAttempts } =
          await supabase
            .from("sos_message_attempts")
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq("sos_event_id", activeSosId);

        if ((existingAttempts ?? 0) > 0) {
          console.log(
            "[send-sos-alert] idempotent skip (user path):",
            activeSosId,
          );

          return new Response(
            JSON.stringify({
              skipped: true,
              reason: "already_dispatched",
              sos_event_id: activeSosId,
            }),
            {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
      }
    }

    console.log(
      "[send-sos-alert] START",
      {
        user_id,
        sos_event_id: activeSosId,
        serviceRole: isServiceRoleCaller,
      },
    );

    // -------------------------------------------------------------------------
    // Resolve guardians
    // -------------------------------------------------------------------------

    const { data: allGuardians, error: guardiansErr } =
      await supabase
        .from("guardians")
        .select(
          "id, guardian_phone, guardian_email, guardian_name, status",
        )
        .eq("user_id", user_id)
        .in("status", ["accepted", "pending"]);

    if (guardiansErr) {
      console.error(
        "[send-sos-alert] guardians query error:",
        guardiansErr,
      );
    }

    const guardianRows = allGuardians ?? [];

    const acceptedPhonesSet = new Set<string>();

    // phone -> guardian metadata
    const phoneMeta = new Map<
      string,
      {
        status: string;
        name: string;
      }
    >();

    type RecipientReport = {
      guardian_id: string;
      name: string;
      phone_raw: string;
      phone_normalized: string | null;
      status: "accepted" | "pending";
      included: boolean;
      skip_reason:
        | null
        | "invalid_phone"
        | "duplicate_phone";
      channels: {
        oneapi:
          | "accepted"
          | "rejected"
          | "not_attempted";
      };
    };

    const recipientsReport: RecipientReport[] = [];

    for (const guardian of guardianRows) {
      const normalizedPhone =
        normalizePhone(guardian.guardian_phone);

      const status =
        guardian.status === "accepted"
          ? "accepted"
          : "pending";

      const base = {
        guardian_id: guardian.id,
        name: guardian.guardian_name,
        phone_raw: guardian.guardian_phone,
        phone_normalized: normalizedPhone,
        status,
        channels: {
          oneapi: "not_attempted" as const,
        },
      };

      // Invalid phone number
      if (!normalizedPhone) {
        recipientsReport.push({
          ...base,
          included: false,
          skip_reason: "invalid_phone",
        });

        continue;
      }

      // Duplicate normalized phone number
      if (acceptedPhonesSet.has(normalizedPhone)) {
        recipientsReport.push({
          ...base,
          included: false,
          skip_reason: "duplicate_phone",
        });

        continue;
      }

      acceptedPhonesSet.add(normalizedPhone);

      phoneMeta.set(normalizedPhone, {
        status: guardian.status,
        name: guardian.guardian_name,
      });

      recipientsReport.push({
        ...base,
        included: true,
        skip_reason: null,
      });
    }

    // -------------------------------------------------------------------------
    // Optional caller-provided phones
    //
    // These are only accepted if they belong to the resolved guardian set.
    // -------------------------------------------------------------------------

    const callerPhones: string[] =
      Array.isArray(guardian_phones)
        ? (guardian_phones as string[])
            .map(normalizePhone)
            .filter(
              (phone): phone is string => !!phone,
            )
        : [];

    const callerInAccepted =
      callerPhones.filter((phone) =>
        acceptedPhonesSet.has(phone),
      );

    const finalPhones = Array.from(
      new Set(
        callerInAccepted.length > 0
          ? callerInAccepted
          : Array.from(acceptedPhonesSet),
      ),
    );

    console.log(
      "[send-sos-alert] recipients",
      {
        guardianCount: guardianRows.length,
        resolvedCount: acceptedPhonesSet.size,
        callerCount: callerPhones.length,
        finalCount: finalPhones.length,
        finalPhones,
      },
    );

    // -------------------------------------------------------------------------
    // Early exit: no usable recipients
    // -------------------------------------------------------------------------

    if (finalPhones.length === 0) {
      let recipientsErr: string;

      if (
        acceptedPhonesSet.size === 0 &&
        guardianRows.length === 0
      ) {
        recipientsErr =
          "No accepted or pending guardians for this user";
      } else {
        recipientsErr =
          "Guardians have no valid phone numbers";
      }

      console.warn(
        "[send-sos-alert] aborting OneAPI:",
        recipientsErr,
      );

      return new Response(
        JSON.stringify({
          sent: 0,
          msg91Sent: 0,
          oneApiAccepted: 0,
          oneApiRequestId: null,
          emailQueued: 0,
          pushSent: 0,
          recipientCount: 0,
          deliveryPending: false,
          recipients: recipientsReport,
          errors: {
            invoke: null,
            recipients: recipientsErr,
            oneApi: null,
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // -------------------------------------------------------------------------
    // Common template variables
    // -------------------------------------------------------------------------

    const istNow = new Date().toLocaleString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      },
    );

    const istTimestamp = `${istNow} IST`;

    // -------------------------------------------------------------------------
    // Location
    // -------------------------------------------------------------------------

    let locationStr = "Location unavailable";

    try {
      let locationQuery = supabase
        .from("sos_events")
        .select("latitude, longitude")
        .eq("user_id", user_id);

      if (activeSosId) {
        locationQuery = locationQuery.eq(
          "id",
          activeSosId,
        );
      }

      const { data: sosRow } =
        await locationQuery
          .order("triggered_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

      if (
        sosRow?.latitude != null &&
        sosRow?.longitude != null
      ) {
        locationStr =
          `https://maps.google.com/?q=${sosRow.latitude},${sosRow.longitude}`;
      }
    } catch (e) {
      console.error(
        "[send-sos-alert] location fetch error:",
        e,
      );
    }

    // -------------------------------------------------------------------------
    // Health summary
    // -------------------------------------------------------------------------

    let healthSummary = "See app for details";

    // Convert blood-group notation to words because the OneAPI template
    // should receive plain text without punctuation such as colons or pipes.
    function formatBloodGroup(raw: string): string {
      const value = String(raw)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

      const match = value.match(/^(AB|A|B|O|0)([+-])?$/);
      if (!match) {
        return String(raw)
          .replace(/[^a-zA-Z0-9 ]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const group = match[1] === "0" ? "O" : match[1];
      const sign = match[2] === "+"
        ? " positive"
        : match[2] === "-"
          ? " negative"
          : "";

      return `${group}${sign}`;
    }

    function plainTemplateText(value: unknown): string {
      return String(value ?? "")
        .replace(/[;:|,]/g, " ")
        .replace(/[^a-zA-Z0-9 +()./-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    try {
      const { data: hp } =
        await supabase
          .from("health_profile")
          .select(
            "blood_group, chronic_conditions, allergies",
          )
          .eq("user_id", user_id)
          .maybeSingle();

      if (hp) {
        const parts: string[] = [];

        if (hp.blood_group) {
          parts.push(
            `Blood group ${formatBloodGroup(hp.blood_group)}`,
          );
        }

        if (
          Array.isArray(hp.chronic_conditions) &&
          hp.chronic_conditions.length
        ) {
          const conditions = hp.chronic_conditions
            .map((item: unknown) => plainTemplateText(item))
            .filter(Boolean)
            .join(" ");
          if (conditions) {
            parts.push(`Conditions ${conditions}`);
          }
        }

        if (
          Array.isArray(hp.allergies) &&
          hp.allergies.length
        ) {
          const allergies = hp.allergies
            .map((item: unknown) => plainTemplateText(item))
            .filter(Boolean)
            .join(" ");
          if (allergies) {
            parts.push(`Allergies ${allergies}`);
          }
        }

        if (parts.length) {
          healthSummary = plainTemplateText(parts.join(" "))
            .slice(0, 200);
        }
      }
    } catch (e) {
      console.error(
        "[send-sos-alert] health_profile fetch error:",
        e,
      );
    }

    const userNameSafe = (
      user_name || "A Check-iN user"
    ).slice(0, 60);

    // -------------------------------------------------------------------------
    // MSG91 OneAPI
    //
    // OneAPI handles BOTH:
    //   - WhatsApp
    //   - SMS
    //
    // No separate WhatsApp API or SMS Flow API is used here.
    // -------------------------------------------------------------------------

    let oneApiAccepted = 0;
    let oneApiRequestId: string | null = null;
    let oneApiError: string | null = null;
    let oneApiProviderMessage: string | null = null;
    let oneApiRawResponse: any = null;

    const msg91AuthKey =
      Deno.env.get("MSG91_AUTH_KEY");


    const oneApiUrl =
      "https://control.msg91.com/api/v5/oneapi/api/flow/sos-alerts/run";

    if (!msg91AuthKey) {
      oneApiError =
        "MSG91_AUTH_KEY not configured";
    } else if (!finalPhones.length) {
      oneApiError =
        "No valid guardian recipients";
    } else {
      // -----------------------------------------------------------------------
      // Build OneAPI recipient variables
      // -----------------------------------------------------------------------

      const recipientVariables = {
        // WhatsApp variables
        body_var_1: {
          type: "text",
          parameter_name: "var_1",
          value: userNameSafe,
        },

        body_var_2: {
          type: "text",
          parameter_name: "var_2",
          value: istTimestamp,
        },

        body_var_3: {
          type: "text",
          parameter_name: "var_3",
          value: locationStr.slice(0, 200),
        },

        body_var_4: {
          type: "text",
          parameter_name: "var_4",
          value: healthSummary,
        },

        // SMS variables use the same values as the WhatsApp variables.
        var1: {
          value: userNameSafe,
        },

        var2: {
          value: istTimestamp,
        },

        var3: {
          value: locationStr.slice(0, 200),
        },

        var4: {
          value: healthSummary,
        },
      };

      const recipients = finalPhones.map(
        (mobile) => ({
          mobiles: mobile,
          variables: recipientVariables,
        }),
      );

      const payload = {
        data: {
          sendTo: [
            {
              to: recipients,

              // Default/common variables for the flow.
              variables: recipientVariables,
            },
          ],
        },
      };

      console.log(
        "[send-sos-alert] OneAPI request",
        {
          endpoint: oneApiUrl,
          recipients: finalPhones.length,
          recipientPhones: finalPhones,
          flow: "sos-alerts",
        },
      );

      try {
        const res = await fetch(
          oneApiUrl,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
              authkey: msg91AuthKey,
            },

            body: JSON.stringify(payload),
          },
        );

        const rawText = await res.text();

        let result: any = rawText;

        try {
          result = JSON.parse(rawText);
          oneApiRawResponse = result;
        } catch {
          oneApiRawResponse = {
            raw: rawText,
          };
        }

        console.log(
          "[send-sos-alert] OneAPI response",
          {
            status: res.status,
            body: rawText.slice(0, 1000),
          },
        );

        oneApiProviderMessage =
          result?.data?.message ?? result?.message ?? null;

        // MSG91 normally returns a request_id for an accepted request.
        oneApiRequestId =
          result?.data?.request_id ??
          result?.request_id ??
          result?.requestId ??
          result?.message_id ??
          null;

        // MSG91 OneAPI response contract:
        // { status: "success", hasError: false, errors: [], data: { request_id, message } }
        // Treat hasError=true as a provider failure even if HTTP itself is 2xx.
        const responseType = String(
          result?.status ?? result?.type ?? "",
        ).toLowerCase();
        const providerHasError =
          result?.hasError === true ||
          result?.data?.hasError === true ||
          responseType === "error" ||
          responseType === "failed";

        const isAccepted = res.ok && !providerHasError;

        if (isAccepted) {
          oneApiAccepted = finalPhones.length;
          console.log(
            "[send-sos-alert] MSG91 accepted OneAPI request",
            {
              requestId: oneApiRequestId,
              message: result?.data?.message ?? result?.message ?? null,
              hasError: result?.hasError ?? false,
            },
          );
        } else {
          oneApiError =
            `status=${res.status} ${rawText.slice(0, 500)}`;
        }
      } catch (e) {
        console.error(
          "[send-sos-alert] OneAPI send error:",
          e,
        );

        oneApiError = String(e);
      }
    }

    // -------------------------------------------------------------------------
    // Persist OneAPI delivery attempts
    // -------------------------------------------------------------------------

    if (activeSosId) {
      const attemptRows = finalPhones.map(
        (phone) => {
          const meta = phoneMeta.get(phone);

          const guardianStatusNote =
            meta?.status
              ? `guardian_status=${meta.status}`
              : null;

          return {
            sos_event_id: activeSosId,
            user_id,

            // OneAPI is now the single MSG91 channel.
            channel: "oneapi",

            recipient_phone: phone,
            provider: "msg91",

            // One request ID can represent the combined
            // WhatsApp + SMS OneAPI operation.
            request_id: oneApiRequestId,

            provider_status:
              oneApiError
                ? "rejected"
                : "accepted",

            // Actual delivery is still pending until
            // MSG91's delivery webhook confirms it.
            delivery_status:
              oneApiError
                ? "failed"
                : "pending",

            failure_reason:
              oneApiError
                ? [
                    oneApiError,
                    guardianStatusNote,
                  ]
                    .filter(Boolean)
                    .join(" | ")
                : guardianStatusNote,

            failed_at: oneApiError
              ? new Date().toISOString()
              : null,

            raw_response:
              oneApiRawResponse,
          };
        },
      );

      if (attemptRows.length) {
        const { error: insertErr } =
          await supabase
            .from("sos_message_attempts")
            .insert(attemptRows);

        if (insertErr) {
          console.error(
            "[send-sos-alert] OneAPI attempt insert error:",
            insertErr,
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // Stamp OneAPI result onto recipient report
    // -------------------------------------------------------------------------

    const oneApiStatus:
      | "accepted"
      | "rejected"
      | "not_attempted" =
      oneApiError
        ? "rejected"
        : oneApiAccepted > 0
          ? "accepted"
          : "not_attempted";

    for (const recipient of recipientsReport) {
      if (!recipient.included) {
        continue;
      }

      recipient.channels.oneapi =
        msg91AuthKey
          ? oneApiStatus
          : "not_attempted";
    }

    // -------------------------------------------------------------------------
    // Email notifications
    // -------------------------------------------------------------------------

    const allEmails = [
      ...(guardian_emails || []),
    ];

    if (doctor_email) {
      allEmails.push(doctor_email);
    }

    let emailsQueued = 0;

    for (const email of allEmails) {
      try {
        await supabase.functions.invoke(
          "send-transactional-email",
          {
            body: {
              templateName: "sos-alert",

              recipientEmail: email,

              idempotencyKey:
                `sos-${user_id}-${Date.now()}-${email}`,

              templateData: {
                userName:
                  user_name ||
                  "Check-iN User",

                message,
              },
            },
          },
        );

        emailsQueued++;
      } catch (e) {
        console.error(
          `Email queue error for ${email}:`,
          e,
        );
      }
    }

    // -------------------------------------------------------------------------
    // In-app notifications for guardians
    // -------------------------------------------------------------------------

    if (guardianRows.length) {
      const notifRows =
        guardianRows.map((guardian: any) => ({
          user_id,
          guardian_id: guardian.id,

          title:
            "🚨 SOS Alert Triggered",

          message:
            `Emergency SOS alert from ${
              user_name || "User"
            }. Check WhatsApp/SMS for details.`,

          type: "sos_alert",
        }));

      await supabase.rpc(
        "insert_notifications_deduped",
        {
          p_notifications: notifRows,
        },
      );
    }

    // -------------------------------------------------------------------------
    // Push notifications
    // -------------------------------------------------------------------------

    let pushSent = 0;

    const vapidPrivateKey =
      Deno.env.get("VAPID_PRIVATE_KEY");

    if (
      vapidPrivateKey &&
      finalPhones.length
    ) {
      const { data: guardianProfiles } =
        await supabase
          .from("profiles")
          .select("id, phone")
          .in("phone", finalPhones);

      const profileIds =
        (guardianProfiles ?? []).map(
          (profile: any) => profile.id,
        );

      if (profileIds.length) {
        const { data: subs } =
          await supabase
            .from("push_subscriptions")
            .select(
              "endpoint, p256dh, auth",
            )
            .in(
              "user_id",
              profileIds,
            );

        if (subs?.length) {
          const pushPayload = {
            title: "🚨 EMERGENCY SOS",

            body:
              `Emergency SOS from ${
                user_name ||
                "a Check-iN user"
              }! Open app immediately.`,

            tag: "sos-alert",

            url: "/guardian",
          };

          for (const sub of subs) {
            try {
              const res =
                await sendPushNotification(
                  sub,
                  pushPayload,
                  VAPID_PUBLIC_KEY,
                  vapidPrivateKey,
                  "mailto:checkin_support@futurewave.in",
                );

              if (
                res.status === 200 ||
                res.status === 201
              ) {
                pushSent++;
              } else if (
                res.status === 410 ||
                res.status === 404
              ) {
                await supabase
                  .from("push_subscriptions")
                  .delete()
                  .eq(
                    "endpoint",
                    sub.endpoint,
                  );
              } else {
                console.error(
                  `Push failed: ${res.status} ${await res.text()}`,
                );
              }
            } catch (err) {
              console.error(
                "Push error:",
                err,
              );
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Final response
    // -------------------------------------------------------------------------

    return new Response(
      JSON.stringify({
        sent: emailsQueued,

        // Generic MSG91 count.
        // Kept as a compatibility field for existing frontend code.
        msg91Sent: oneApiAccepted,

        emailQueued: emailsQueued,
        pushSent,

        // New unified provider result.
        oneApiAccepted,
        oneApiRequestId,
        oneApiHasError: Boolean(oneApiError),
        providerMessage: oneApiProviderMessage,

        recipientCount:
          finalPhones.length,

        // "Accepted by MSG91" does not mean
        // delivered to the phone yet.
        deliveryPending:
          oneApiAccepted > 0,

        recipients:
          recipientsReport,

        errors: {
          invoke: null,
          recipients: null,
          oneApi: oneApiError,
        },
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  } catch (e) {
    console.error(
      "[send-sos-alert] fatal:",
      e,
    );

    return new Response(
      JSON.stringify({
        error: String(e),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  }
});
