import { createClient } from "npm:@supabase/supabase-js@2";

console.log("[send-sos-alert] module loaded");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// MSG91 integrated WhatsApp sender. Recipients matching this number cannot
// receive a message from themselves and will be rejected silently by MSG91.
const MSG91_INTEGRATED_NUMBER = "917045868482";

// --- Web Push utilities ---

const VAPID_PUBLIC_KEY = "BJq2e6gs1zTIdmNLo6v4DWL4trzwEedK_ghxuB9wb63nlh_y1ShYf2RS_IKdDdPu59tQJ3pLk5XHed6pGZ141lw";

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidKeys(publicKeyBase64url: string, privateKeyBase64url: string) {
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
    ["sign"]
  );
}

async function createJWT(vapidPrivateKey: CryptoKey, audience: string, subject: string) {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: subject };
  const headerB64 = bytesToBase64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapidPrivateKey,
    new TextEncoder().encode(unsigned)
  );
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes[0] === 0x30) {
    const rLen = sigBytes[3];
    const rStart = 4;
    r = sigBytes.slice(rStart, rStart + rLen);
    const sLen = sigBytes[rStart + rLen + 1];
    const sStart = rStart + rLen + 2;
    s = sigBytes.slice(sStart, sStart + sLen);
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) { const p = new Uint8Array(32); p.set(r, 32 - r.length); r = p; }
    if (s.length < 32) { const p = new Uint8Array(32); p.set(s, 32 - s.length); s = p; }
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
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
) {
  const privateKey = await importVapidKeys(vapidPublicKey, vapidPrivateKey);
  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const jwt = await createJWT(privateKey, audience, vapidSubject);
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

// --- Phone normalization ---
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return null;
  // India default: prepend 91 if not already country-coded
  const withCc = digits.startsWith("91") ? digits : `91${digits}`;
  if (withCc.length < 11 || withCc.length > 15) return null;
  return withCc;
}

// --- Main handler ---

Deno.serve(async (req) => {
  console.log("[send-sos-alert] request received", { method: req.method, url: req.url });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Detect service-role caller (DB trigger / cron safety-net).
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const isServiceRoleCaller = !!bearer && bearer === serviceKey;

    let activeSosId: string | null = null;

    if (isServiceRoleCaller) {
      if (!sos_event_id) {
        return new Response(JSON.stringify({ error: "sos_event_id required for service-role invocation" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: sosRow, error: sosErr } = await supabase
        .from("sos_events")
        .select("id, user_id, status")
        .eq("id", sos_event_id)
        .maybeSingle();
      if (sosErr || !sosRow) {
        return new Response(JSON.stringify({ error: "sos_event not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { count: existingAttempts } = await supabase
        .from("sos_message_attempts")
        .select("id", { count: "exact", head: true })
        .eq("sos_event_id", sos_event_id);
      if ((existingAttempts ?? 0) > 0) {
        console.log("[send-sos-alert] idempotent skip: attempts exist for", sos_event_id);
        return new Response(JSON.stringify({ skipped: true, reason: "already_dispatched", sos_event_id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user_id = sosRow.user_id;
      activeSosId = sosRow.id;
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", user_id).maybeSingle();
      user_name = user_name || prof?.full_name || "A Check-iN user";
      message = message || `🚨 SOS ALERT from ${user_name} — immediate attention needed.`;
    } else {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const callerId = userData.user.id;
      if (!user_id || !message) {
        return new Response(JSON.stringify({ error: "user_id and message required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (callerId !== user_id) {
        const { data: guardianRow } = await supabase
          .from("guardians")
          .select("id")
          .eq("user_id", user_id)
          .eq("guardian_user_id", callerId)
          .eq("status", "accepted")
          .maybeSingle();
        if (!guardianRow) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      try {
        const { data: sosRow } = await supabase
          .from("sos_events")
          .select("id")
          .eq("user_id", user_id)
          .order("triggered_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        activeSosId = sosRow?.id ?? null;
      } catch (e) {
        console.error("[send-sos-alert] sos_events fetch error:", e);
      }
      if (activeSosId) {
        const { count: existingAttempts } = await supabase
          .from("sos_message_attempts")
          .select("id", { count: "exact", head: true })
          .eq("sos_event_id", activeSosId);
        if ((existingAttempts ?? 0) > 0) {
          console.log("[send-sos-alert] idempotent skip (user path):", activeSosId);
          return new Response(JSON.stringify({ skipped: true, reason: "already_dispatched", sos_event_id: activeSosId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    console.log("[send-sos-alert] START", { user_id, sos_event_id: activeSosId, serviceRole: isServiceRoleCaller });

    // --- Resolve recipients: accepted OR pending guardians ---
    // SOS is life-safety. A guardian the user explicitly nominated should be
    // alerted even if they have not yet clicked the invite link (24h auto-accept).
    const { data: allGuardians, error: guardiansErr } = await supabase
      .from("guardians")
      .select("id, guardian_phone, guardian_email, guardian_name, status")
      .eq("user_id", user_id)
      .in("status", ["accepted", "pending"]);

    if (guardiansErr) {
      console.error("[send-sos-alert] guardians query error:", guardiansErr);
    }

    const acceptedRows = allGuardians ?? [];
    const acceptedPhonesSet = new Set<string>();
    const selfTargetedPhones: string[] = [];
    // phone -> { status, name } so we can stamp delivery attempts with status
    const phoneMeta = new Map<string, { status: string; name: string }>();

    // Per-guardian decision log surfaced to the UI. Built during recipient
    // resolution; channel outcomes are stamped after WA + SMS calls return.
    type RecipientReport = {
      guardian_id: string;
      name: string;
      phone_raw: string;
      phone_normalized: string | null;
      status: "accepted" | "pending";
      included: boolean;
      skip_reason: null | "self_targeted" | "invalid_phone" | "duplicate_phone";
      channels: {
        whatsapp: "accepted" | "rejected" | "not_attempted";
        sms: "accepted" | "rejected" | "not_attempted";
      };
    };
    const recipientsReport: RecipientReport[] = [];

    for (const g of acceptedRows) {
      const n = normalizePhone(g.guardian_phone);
      const status = (g.status === "accepted" ? "accepted" : "pending") as "accepted" | "pending";
      const base = {
        guardian_id: g.id,
        name: g.guardian_name,
        phone_raw: g.guardian_phone,
        phone_normalized: n,
        status,
        channels: {
          whatsapp: "not_attempted" as const,
          sms: "not_attempted" as const,
        },
      };
      if (!n) {
        recipientsReport.push({ ...base, included: false, skip_reason: "invalid_phone" });
        continue;
      }
      if (n === MSG91_INTEGRATED_NUMBER) {
        selfTargetedPhones.push(n);
        recipientsReport.push({ ...base, included: false, skip_reason: "self_targeted" });
        continue;
      }
      if (acceptedPhonesSet.has(n)) {
        recipientsReport.push({ ...base, included: false, skip_reason: "duplicate_phone" });
        continue;
      }
      acceptedPhonesSet.add(n);
      phoneMeta.set(n, { status: g.status, name: g.guardian_name });
      recipientsReport.push({ ...base, included: true, skip_reason: null });
    }

    // Optional: validate caller-provided phones against accepted set; fall back to accepted set
    const callerPhones: string[] = Array.isArray(guardian_phones)
      ? (guardian_phones as string[]).map(normalizePhone).filter((x): x is string => !!x)
      : [];
    const callerInAccepted = callerPhones.filter((p) => acceptedPhonesSet.has(p));
    const finalPhones = Array.from(
      new Set(callerInAccepted.length > 0 ? callerInAccepted : Array.from(acceptedPhonesSet))
    );

    console.log("[send-sos-alert] recipients", {
      sender: MSG91_INTEGRATED_NUMBER,
      acceptedCount: acceptedPhonesSet.size,
      callerCount: callerPhones.length,
      finalCount: finalPhones.length,
      finalPhones,
      selfTargetedPhones,
    });

    // Early exit: no usable recipients → return structured failure reason
    if (finalPhones.length === 0) {
      let recipientsErr: string;
      if (selfTargetedPhones.length > 0) {
        recipientsErr =
          `Guardian phone matches the WhatsApp sender number (${MSG91_INTEGRATED_NUMBER}). ` +
          `MSG91 cannot deliver a message from the sender to itself. ` +
          `Update the guardian's phone in Settings to a different number.`;
      } else if (acceptedPhonesSet.size === 0 && acceptedRows.length === 0) {
        recipientsErr = "No accepted guardians for this user";
      } else {
        recipientsErr = "Accepted guardians have no valid phone numbers";
      }
      console.warn("[send-sos-alert] aborting WA/SMS:", recipientsErr);
      return new Response(
        JSON.stringify({
          sent: 0,
          msg91Sent: 0,
          emailQueued: 0,
          pushSent: 0,
          whatsappAccepted: 0,
          smsAccepted: 0,
          whatsappQueued: 0,
          smsQueued: 0,
          whatsappRequestId: null,
          smsRequestId: null,
          recipientCount: 0,
          deliveryPending: false,
          selfTargetedPhones,
          recipients: recipientsReport,
          errors: {
            invoke: null,
            recipients: recipientsErr,
            whatsapp: null,
            sms: null,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Send emails via transactional queue ---
    const allEmails = [...(guardian_emails || [])];
    if (doctor_email) allEmails.push(doctor_email);
    let emailsQueued = 0;
    for (const email of allEmails) {
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "sos-alert",
            recipientEmail: email,
            idempotencyKey: `sos-${user_id}-${Date.now()}-${email}`,
            templateData: { userName: user_name || "Check-iN User", message },
          },
        });
        emailsQueued++;
      } catch (e) {
        console.error(`Email queue error for ${email}:`, e);
      }
    }

    // --- In-app notifications for guardians ---
    if (acceptedRows.length) {
      const notifRows = acceptedRows.map((g: any) => ({
        user_id,
        guardian_id: g.id,
        title: "🚨 SOS Alert Triggered",
        message: `Emergency SOS alert from ${user_name || "User"}. Check WhatsApp/SMS for details.`,
        type: "sos_alert",
      }));
      await supabase.rpc("insert_notifications_deduped", { p_notifications: notifRows });
    }

    // --- Push notifications ---
    let pushSent = 0;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (vapidPrivateKey && finalPhones.length) {
      const { data: guardianProfiles } = await supabase
        .from("profiles")
        .select("id, phone")
        .in("phone", finalPhones);

      const profileIds = (guardianProfiles ?? []).map((p: any) => p.id);
      if (profileIds.length) {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .in("user_id", profileIds);

        if (subs?.length) {
          const pushPayload = {
            title: "🚨 EMERGENCY SOS",
            body: `Emergency SOS from ${user_name || "a Check-iN user"}! Open app immediately.`,
            tag: "sos-alert",
            url: "/guardian",
          };
          for (const sub of subs) {
            try {
              const res = await sendPushNotification(
                sub, pushPayload, VAPID_PUBLIC_KEY, vapidPrivateKey,
                "mailto:checkin_support@futurewave.in"
              );
              if (res.status === 200 || res.status === 201) pushSent++;
              else if (res.status === 410 || res.status === 404) {
                await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
              } else {
                console.error(`Push failed: ${res.status} ${await res.text()}`);
              }
            } catch (err) {
              console.error("Push error:", err);
            }
          }
        }
      }
    }

    // --- Build common template variables ---
    const istNow = new Date().toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "Asia/Kolkata",
    });
    const istTimestamp = `${istNow} IST`;

    let locationStr = "Location unavailable";
    try {
      const { data: sosRow } = await supabase
        .from("sos_events")
        .select("latitude, longitude")
        .eq("user_id", user_id)
        .order("triggered_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sosRow?.latitude != null && sosRow?.longitude != null) {
        locationStr = `https://maps.google.com/?q=${sosRow.latitude},${sosRow.longitude}`;
      }
    } catch (e) {
      console.error("[send-sos-alert] location fetch error:", e);
    }

    let healthSummary = "See app for details";
    try {
      const { data: hp } = await supabase
        .from("health_profile")
        .select("blood_group, chronic_conditions, allergies")
        .eq("user_id", user_id)
        .maybeSingle();
      if (hp) {
        const parts: string[] = [];
        if (hp.blood_group) parts.push(`Blood: ${hp.blood_group}`);
        if (hp.chronic_conditions?.length) parts.push(`Conditions: ${hp.chronic_conditions.join(", ")}`);
        if (hp.allergies?.length) parts.push(`Allergies: ${hp.allergies.join(", ")}`);
        if (parts.length) healthSummary = parts.join(" | ").slice(0, 200);
      }
    } catch (e) {
      console.error("[send-sos-alert] health_profile fetch error:", e);
    }

    const userNameSafe = (user_name || "A Check-iN user").slice(0, 60);

    // --- WhatsApp via MSG91 ---
    let whatsappAccepted = 0;
    let whatsappRequestId: string | null = null;
    let whatsappError: string | null = null;
    let whatsappRawResponse: any = null;
    const msg91AuthKey = Deno.env.get("MSG91_AUTH_KEY");
    const waTemplateName = "sos_alert_notification";
    const namespace = "e67e5302_b6d0_403e_b3cc_8fa6e8accb01";
    const langCode = "en_US";

    if (msg91AuthKey && finalPhones.length) {
      const to_and_components = finalPhones.map((mobile) => ({
        to: [mobile],
        components: {
          body_1: { type: "text", value: userNameSafe },
          body_2: { type: "text", value: istTimestamp },
          body_3: { type: "text", value: locationStr.slice(0, 200) },
          body_4: { type: "text", value: healthSummary },
        },
      }));

      const payload = {
        integrated_number: MSG91_INTEGRATED_NUMBER,
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: waTemplateName,
            language: { code: langCode, policy: "deterministic" },
            namespace,
            to_and_components,
          },
        },
      };

      console.log("[send-sos-alert] WA request", {
        sender: MSG91_INTEGRATED_NUMBER,
        templateName: waTemplateName,
        namespace,
        recipients: finalPhones.length,
        recipientPhones: finalPhones,
      });
      try {
        const res = await fetch(
          "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", authkey: msg91AuthKey },
            body: JSON.stringify(payload),
          }
        );
        const rawText = await res.text();
        let result: any = rawText;
        try { result = JSON.parse(rawText); whatsappRawResponse = result; } catch { /* ignore */ }
        console.log("[send-sos-alert] WA response", { status: res.status, body: rawText.slice(0, 600) });
        const msgType = result?.type ?? result?.status;
        whatsappRequestId = result?.request_id ?? null;
        const isAccepted = res.ok && (msgType === "success" || (!!whatsappRequestId && msgType !== "error"));
        if (isAccepted) whatsappAccepted = finalPhones.length;
        else whatsappError = `status=${res.status} ${rawText.slice(0, 200)}`;
      } catch (e) {
        console.error("[send-sos-alert] WA send error:", e);
        whatsappError = String(e);
      }
    } else if (!msg91AuthKey) {
      whatsappError = "MSG91_AUTH_KEY not configured";
    }

    // --- SMS via MSG91 Flow API ---
    let smsAccepted = 0;
    let smsRequestId: string | null = null;
    let smsError: string | null = null;
    let smsRawResponse: any = null;
    const smsTemplateId = Deno.env.get("MSG91_SOS_SMS_TEMPLATE_ID");

    if (msg91AuthKey && smsTemplateId && finalPhones.length) {
      const recipients = finalPhones.map((mobile) => ({
        mobiles: mobile,
        user_name: userNameSafe,
        time: istTimestamp,
        location: locationStr.slice(0, 200),
        health: healthSummary,
      }));

      const smsPayload = {
        template_id: smsTemplateId,
        short_url: "0",
        recipients,
      };

      console.log("[send-sos-alert] SMS request", {
        templateId: smsTemplateId,
        recipients: finalPhones.length,
        recipientPhones: finalPhones,
      });
      try {
        const res = await fetch("https://control.msg91.com/api/v5/flow", {
          method: "POST",
          headers: { "Content-Type": "application/json", authkey: msg91AuthKey },
          body: JSON.stringify(smsPayload),
        });
        const rawText = await res.text();
        let result: any = rawText;
        try { result = JSON.parse(rawText); smsRawResponse = result; } catch { /* ignore */ }
        console.log("[send-sos-alert] SMS response", { status: res.status, body: rawText.slice(0, 600) });
        smsRequestId = result?.request_id ?? result?.message ?? null;
        const isAccepted = res.ok && (result?.type === "success" || !!smsRequestId);
        if (isAccepted) smsAccepted = finalPhones.length;
        else smsError = `status=${res.status} ${rawText.slice(0, 200)}`;
      } catch (e) {
        console.error("[send-sos-alert] SMS send error:", e);
        smsError = String(e);
      }
    } else if (!smsTemplateId) {
      smsError = "MSG91_SOS_SMS_TEMPLATE_ID not configured";
    } else if (!msg91AuthKey) {
      smsError = "MSG91_AUTH_KEY not configured";
    }

    // --- Persist per-recipient delivery attempts ---
    if (activeSosId) {
      const attemptRows: any[] = [];
      for (const phone of finalPhones) {
        const meta = phoneMeta.get(phone);
        const guardianStatusNote = meta?.status ? `guardian_status=${meta.status}` : null;
        if (whatsappAccepted > 0 || whatsappError) {
          attemptRows.push({
            sos_event_id: activeSosId,
            user_id,
            channel: "whatsapp",
            recipient_phone: phone,
            provider: "msg91",
            request_id: whatsappRequestId,
            provider_status: whatsappError ? "rejected" : "accepted",
            delivery_status: whatsappError ? "failed" : "pending",
            failure_reason: whatsappError ? `${whatsappError} | ${guardianStatusNote}` : guardianStatusNote,
            failed_at: whatsappError ? new Date().toISOString() : null,
            raw_response: whatsappRawResponse,
          });
        }
        if (smsAccepted > 0 || smsError) {
          attemptRows.push({
            sos_event_id: activeSosId,
            user_id,
            channel: "sms",
            recipient_phone: phone,
            provider: "msg91",
            request_id: smsRequestId,
            provider_status: smsError ? "rejected" : "accepted",
            delivery_status: smsError ? "failed" : "pending",
            failure_reason: smsError ? `${smsError} | ${guardianStatusNote}` : guardianStatusNote,
            failed_at: smsError ? new Date().toISOString() : null,
            raw_response: smsRawResponse,
          });
        }
      }
      if (attemptRows.length) {
        const { error: insertErr } = await supabase.from("sos_message_attempts").insert(attemptRows);
        if (insertErr) console.error("[send-sos-alert] attempt insert error:", insertErr);
      }
    }

    // Stamp per-channel outcomes onto the recipients report (included rows only)
    const waStatus: "accepted" | "rejected" = whatsappError ? "rejected" : (whatsappAccepted > 0 ? "accepted" : "rejected");
    const smsStatus: "accepted" | "rejected" = smsError ? "rejected" : (smsAccepted > 0 ? "accepted" : "rejected");
    for (const r of recipientsReport) {
      if (!r.included) continue;
      r.channels.whatsapp = msg91AuthKey ? waStatus : "not_attempted";
      r.channels.sms = (msg91AuthKey && smsTemplateId) ? smsStatus : "not_attempted";
    }

    return new Response(
      JSON.stringify({
        sent: emailsQueued,
        msg91Sent: whatsappAccepted,
        emailQueued: emailsQueued,
        pushSent,
        whatsappAccepted,
        smsAccepted,
        whatsappQueued: whatsappAccepted,
        smsQueued: smsAccepted,
        whatsappRequestId,
        smsRequestId,
        recipientCount: finalPhones.length,
        deliveryPending: whatsappAccepted > 0 || smsAccepted > 0,
        sender: MSG91_INTEGRATED_NUMBER,
        selfTargetedPhones,
        recipients: recipientsReport,
        errors: { invoke: null, recipients: null, whatsapp: whatsappError, sms: smsError },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-sos-alert] fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
