import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppTemplate, normalizeIndianPhone, WA_NAMESPACE_V2 } from "../_shared/msg91Whatsapp.ts";
import { sendSmsFlow } from "../_shared/msg91Sms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Web Push utilities (same as send-medication-push) ──

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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidKeys(publicKeyBase64url: string, privateKeyBase64url: string) {
  const privateKeyBytes = base64urlToBytes(privateKeyBase64url);
  const publicKeyBytes = base64urlToBytes(publicKeyBase64url);

  const privateKey = await crypto.subtle.importKey(
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
  return privateKey;
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

  const body = JSON.stringify(payload);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body,
  });
  return response;
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: accept cron (service-role bearer or shared cron secret) OR a valid user JWT
    const authHeader = req.headers.get("Authorization") || "";
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const isCron =
      authHeader === `Bearer ${serviceRoleKey}` ||
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret);

    if (!isCron) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) {
        console.error("[check-missed-checkins] AUTH REJECTED: no bearer token — scheduled run will not process missed check-ins");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: userData, error: userErr } = await authClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        console.error("[check-missed-checkins] AUTH REJECTED: bearer token is not the service-role key and not a valid user JWT (likely an anon key from a cron job) — no check-ins will be marked missed");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    const supabase = createClient(supabaseUrl, serviceRoleKey);


    const vapidPublicKey = "BJq2e6gs1zTIdmNLo6v4DWL4trzwEedK_ghxuB9wb63nlh_y1ShYf2RS_IKdDdPu59tQJ3pLk5XHed6pGZ141lw";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = "mailto:alerts@check-in.app";

    const now = new Date();
    // 60-minute grace: matches T+60 escalation
    const graceMs = 60 * 60 * 1000;
    const graceCutoff = new Date(now.getTime() - graceMs);
    const veryLateCutoff = new Date(now.getTime() - 60 * 60 * 1000);

    // Compute today's IST boundaries (UTC+5:30) to prevent previous-day spillover
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const istMidnight = new Date(istNow);
    istMidnight.setUTCHours(0, 0, 0, 0);
    const todayStartUTC = new Date(istMidnight.getTime() - istOffsetMs); // IST 00:00 in UTC
    const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000 - 1); // IST 23:59:59.999 in UTC

    // ── Server-side check-in pre-population ──
    // Get all users with 'user' role from both profiles and user_roles
    const [profilesRes, rolesRes, guardianRoleRes, guardianProfileRes] = await Promise.all([
      supabase.from("profiles").select("id, phone").eq("role", "user"),
      supabase.from("user_roles").select("user_id").eq("role", "user"),
      supabase.from("user_roles").select("user_id").eq("role", "guardian"),
      supabase.from("profiles").select("id").eq("role", "guardian"),
    ]);

    // Accounts that hold the guardian role (in either table) are never wards.
    const guardianAccountIds = new Set<string>([
      ...((guardianRoleRes.data || []) as any[]).map((r) => r.user_id),
      ...((guardianProfileRes.data || []) as any[]).map((p) => p.id),
    ]);

    const userIdsSet = new Set<string>();
    if (profilesRes.data) {
      (profilesRes.data as any[]).forEach((p) => userIdsSet.add(p.id));
    }
    if (rolesRes.data) {
      (rolesRes.data as any[]).forEach((r) => userIdsSet.add(r.user_id));
    }

    // A ward with no phone on its profile can never be alerted about — and is
    // almost always a stray/duplicate sign-up. Skip those, and any guardian.
    const phoneById = new Map<string, string | null>();
    ((profilesRes.data || []) as any[]).forEach((p) => phoneById.set(p.id, p.phone));
    const missingPhoneIds = [...userIdsSet].filter((id) => !phoneById.has(id));
    if (missingPhoneIds.length > 0) {
      const { data: extraProfiles } = await supabase
        .from("profiles")
        .select("id, phone")
        .in("id", missingPhoneIds);
      ((extraProfiles || []) as any[]).forEach((p) => phoneById.set(p.id, p.phone));
    }
    for (const id of [...userIdsSet]) {
      const phone = phoneById.get(id);
      if (guardianAccountIds.has(id) || !phone || String(phone).trim() === "") {
        userIdsSet.delete(id);
      }
    }


    if (profilesRes.error) {
      console.error("Error fetching profiles for pre-population:", profilesRes.error);
    }
    if (rolesRes.error) {
      console.error("Error fetching user roles for pre-population:", rolesRes.error);
    }


    if (userIdsSet.size > 0) {
      // Find which slots today have passed the grace period
      const checkInSlotsToVerify = [];
      for (const h of [7, 12, 19]) {
        const slotIST = new Date(istMidnight);
        slotIST.setUTCHours(h, 0, 0, 0);
        const slotUTC = new Date(slotIST.getTime() - istOffsetMs);
        if (slotUTC < graceCutoff) {
          checkInSlotsToVerify.push(slotUTC);
        }
      }

      if (checkInSlotsToVerify.length > 0) {
        const rowsToUpsert = [];
        for (const uId of userIdsSet) {
          for (const slot of checkInSlotsToVerify) {
            rowsToUpsert.push({
              user_id: uId,
              scheduled_at: slot.toISOString(),
              status: "pending",
            });
          }
        }

        if (rowsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from("check_ins")
            .upsert(rowsToUpsert, { onConflict: "user_id,scheduled_at", ignoreDuplicates: true });
          if (upsertError) {
            console.error("Error upserting server-side pending check-ins:", upsertError);
          } else {
            console.log(`Successfully pre-populated ${rowsToUpsert.length} server-side pending check-ins`);
          }
        }
      }
    }

    const { data: pendingCheckIns, error: fetchError } = await supabase
      .from("check_ins")
      .select("id, user_id, scheduled_at")
      .eq("status", "pending")
      .gte("scheduled_at", todayStartUTC.toISOString())
      .lte("scheduled_at", todayEndUTC.toISOString())
      .lt("scheduled_at", graceCutoff.toISOString());

    if (fetchError) {
      console.error("Error fetching pending check-ins:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingCheckIns || pendingCheckIns.length === 0) {
      return new Response(
        JSON.stringify({ message: "No missed check-ins found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Filter out guardian accounts and phone-less accounts — they are not wards ──
    const userIds = [...new Set(pendingCheckIns.map((ci) => ci.user_id))];
    const [guardianRolesRes, wardProfilesRes] = await Promise.all([
      supabase.from("user_roles").select("user_id").in("user_id", userIds).eq("role", "guardian"),
      supabase.from("profiles").select("id, phone, role").in("id", userIds),
    ]);

    const guardianUserIds = new Set((guardianRolesRes.data || []).map((r: any) => r.user_id));
    const profileById = new Map<string, any>();
    ((wardProfilesRes.data || []) as any[]).forEach((p) => profileById.set(p.id, p));
    for (const id of userIds) {
      const p = profileById.get(id);
      if (!p || p.role === "guardian" || !p.phone || String(p.phone).trim() === "") {
        guardianUserIds.add(id);
      }
    }


    // Silently mark guardian check-ins as missed (no alerts)
    const guardianCheckInIds = pendingCheckIns
      .filter((ci) => guardianUserIds.has(ci.user_id))
      .map((ci) => ci.id);
    if (guardianCheckInIds.length > 0) {
      await supabase.from("check_ins").update({ status: "missed" }).in("id", guardianCheckInIds);
      console.log(`Silently dismissed ${guardianCheckInIds.length} guardian-role check-ins`);
    }

    const userCheckIns = pendingCheckIns.filter((ci) => !guardianUserIds.has(ci.user_id));
    if (userCheckIns.length === 0) {
      return new Response(
        JSON.stringify({ message: "No user check-ins to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Filter out users who are Checked-Out or in Sleep mode ──
    const validUserIds = [...new Set(userCheckIns.map((ci) => ci.user_id))];
    const { data: settingsData } = await supabase
      .from("user_settings")
      .select("user_id, settings")
      .in("user_id", validUserIds);

    const pausedUserIds = new Set<string>();
    if (settingsData) {
      const nowMs = now.getTime();
      for (const row of settingsData) {
        const settings = row.settings as any;
        if (settings?.pauseMode && settings.pauseMode !== "active") {
          let isPaused = true;
          // Verify expiration if checked-out
          if (settings.pauseMode === "checked-out" && settings.checkOutConfig) {
            const expiryStr = settings.checkOutConfig.endsAt || settings.checkOutConfig.endDate;
            if (expiryStr) {
              const expiryMs = new Date(expiryStr).getTime();
              if (expiryMs && expiryMs < nowMs) {
                isPaused = false; // Checkout expired
              }
            }
          }
          if (isPaused) {
            pausedUserIds.add(row.user_id);
          }
        }
      }
    }

    const pausedCheckInIds = userCheckIns
      .filter((ci) => pausedUserIds.has(ci.user_id))
      .map((ci) => ci.id);

    if (pausedCheckInIds.length > 0) {
      await supabase.from("check_ins").update({ status: "missed" }).in("id", pausedCheckInIds);
      console.log(`Silently dismissed ${pausedCheckInIds.length} paused user check-ins`);
    }

    const activeUserCheckIns = userCheckIns.filter((ci) => !pausedUserIds.has(ci.user_id));
    if (activeUserCheckIns.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active user check-ins to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate: keep only ONE pending check-in per user+scheduled_hour
    const seen = new Set<string>();
    const uniqueCheckIns: typeof activeUserCheckIns = [];
    const duplicateIds: string[] = [];
    for (const ci of activeUserCheckIns) {
      const scheduledDate = new Date(ci.scheduled_at);
      const key = `${ci.user_id}-${scheduledDate.getUTCFullYear()}-${scheduledDate.getUTCMonth()}-${scheduledDate.getUTCDate()}-${scheduledDate.getUTCHours()}`;
      if (seen.has(key)) {
        duplicateIds.push(ci.id);
      } else {
        seen.add(key);
        uniqueCheckIns.push(ci);
      }
    }

    // Mark duplicates as missed immediately without sending alerts
    if (duplicateIds.length > 0) {
      await supabase.from("check_ins").update({ status: "missed" }).in("id", duplicateIds);
      console.log(`Silently marked ${duplicateIds.length} duplicate check-ins as missed`);
    }

    console.log(`Found ${activeUserCheckIns.length} active user check-ins`);

    let notificationsCreated = 0;
    let emailsSent = 0;
    let pushesSent = 0;

    for (const checkIn of uniqueCheckIns) {
      // ── Safety check: verify no "responded" record exists for this user+slot ──
      const scheduledDate = new Date(checkIn.scheduled_at);
      const slotStart = new Date(scheduledDate);
      slotStart.setMinutes(0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); // +1 hour

      const { data: respondedRecords } = await supabase
        .from("check_ins")
        .select("id")
        .eq("user_id", checkIn.user_id)
        .eq("status", "responded")
        .gte("scheduled_at", slotStart.toISOString())
        .lt("scheduled_at", slotEnd.toISOString())
        .limit(1);

      if (respondedRecords && respondedRecords.length > 0) {
        // User already responded — mark this orphan as responded, skip alerts
        await supabase
          .from("check_ins")
          .update({ status: "responded", response: "ok", responded_at: new Date().toISOString() })
          .eq("id", checkIn.id)
          .eq("status", "pending");
        console.log(`Orphan check-in ${checkIn.id} resolved — user already responded`);
        continue;
      }

      // ── Mark as missed FIRST to prevent duplicate processing by next cron run ──
      const { data: updatedData, error: updateError } = await supabase
        .from("check_ins")
        .update({ status: "missed" })
        .eq("id", checkIn.id)
        .eq("status", "pending")
        .select("id"); // MUST select to verify rows were actually updated

      if (updateError || !updatedData || updatedData.length === 0) {
        console.log(`Skipping check-in ${checkIn.id} (already responded or processed)`);
        continue; // skip — another run likely already processed it or user responded
      }

      const isVeryLate = scheduledDate.getTime() < veryLateCutoff.getTime();
      // We no longer abort notifications based on isVeryLate because we want emails/pushes to still go out,
      // but we will no longer send real-time SMS (MSG91).

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", checkIn.user_id)
        .single();

      const userName = profile?.full_name || "Your ward";

      let { data: guardians } = await supabase
        .from("guardians")
        .select("id, guardian_name, guardian_email, guardian_phone")
        .eq("user_id", checkIn.user_id)
        .eq("status", "accepted");

      if (guardians && guardians.length > 0) {
        // Deduplicate guardians by phone to prevent multiple alerts if the ward added them multiple times
        const uniqueGuardians = [];
        const seenPhones = new Set<string>();
        for (const g of guardians) {
          const normPhone = normalizeIndianPhone(g.guardian_phone);
          if (normPhone && !seenPhones.has(normPhone)) {
            seenPhones.add(normPhone);
            uniqueGuardians.push(g);
          }
        }
        guardians = uniqueGuardians;

        const scheduledTime = new Date(checkIn.scheduled_at);
        // Convert to IST manually (UTC+5:30) for reliable formatting
        const istMs = scheduledTime.getTime() + (5.5 * 60 * 60 * 1000);
        const istDate = new Date(istMs);
        const istHours = istDate.getUTCHours();
        const istMinutes = istDate.getUTCMinutes();
        const period = istHours >= 12 ? "PM" : "AM";
        const displayHour = istHours % 12 || 12;
        const timeStr = `${displayHour}:${String(istMinutes).padStart(2, "0")} ${period}`;

        // Current IST timestamp for the alert
        const alertIstMs = now.getTime() + (5.5 * 60 * 60 * 1000);
        const alertIst = new Date(alertIstMs);
        const alertDay = alertIst.getUTCDate();
        const alertMonths = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const alertMonth = alertMonths[alertIst.getUTCMonth()];
        const alertYear = alertIst.getUTCFullYear();
        const alertH = alertIst.getUTCHours();
        const alertM = alertIst.getUTCMinutes();
        const alertPeriod = alertH >= 12 ? "PM" : "AM";
        const alertDisplayH = alertH % 12 || 12;
        const alertTimestamp = `${alertDay} ${alertMonth} ${alertYear}, ${alertDisplayH}:${String(alertM).padStart(2,"0")} ${alertPeriod}`;

        const message = `[${alertTimestamp}] ${userName} missed their ${timeStr} check-in. Please reach out to make sure they're okay.`;

        // ── Use deduped RPC for in-app notifications ──
        const notifications = guardians.map((g) => ({
          user_id: checkIn.user_id,
          guardian_id: g.id,
          title: "Missed Check-In Alert",
          message,
          type: "missed_checkin",
        }));

        const { error: dedupError } = await supabase.rpc("insert_notifications_deduped", {
          p_notifications: notifications,
        });
        if (dedupError) {
          console.error("Deduped notification error:", dedupError);
        } else {
          notificationsCreated += guardians.length;
        }

        for (const guardian of guardians) {
          // Send email via transactional email queue (idempotency key prevents duplicates)
          if (guardian.guardian_email) {
            try {
              await supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "missed-checkin-alert",
                  recipientEmail: guardian.guardian_email,
                  idempotencyKey: `missed-checkin-${checkIn.id}-${guardian.id}`,
                  templateData: {
                    userName,
                    guardianName: guardian.guardian_name,
                    timeStr,
                    message,
                  },
                },
              });
              emailsSent++;
            } catch (emailErr) {
              console.error("Email queue error:", emailErr);
            }
          }

          // Send push notification to guardian's registered devices
          if (vapidPrivateKey) {
            const { data: guardianProfile } = await supabase
              .from("profiles")
              .select("id")
              .eq("phone", guardian.guardian_phone)
              .maybeSingle();

            if (guardianProfile?.id) {
              const { data: subs } = await supabase
                .from("push_subscriptions")
                .select("endpoint, p256dh, auth")
                .eq("user_id", guardianProfile.id);

              if (subs && subs.length > 0) {
                for (const sub of subs) {
                  try {
                    const res = await sendPushNotification(
                      sub,
                      {
                        title: "⚠️ Missed Check-In Alert",
                        body: message,
                        tag: `missed-checkin-${checkIn.id}`,
                        url: "/guardian",
                      },
                      vapidPublicKey,
                      vapidPrivateKey,
                      vapidSubject
                    );

                    if (res.status === 201 || res.status === 200) {
                      pushesSent++;
                    } else if (res.status === 410 || res.status === 404) {
                      await supabase
                        .from("push_subscriptions")
                        .delete()
                        .eq("endpoint", sub.endpoint);
                    }
                    await res.text();
                  } catch (pushErr) {
                    console.error("Push send error:", pushErr);
                  }
                }
              }
            }
          }
        }

        // ── ONE-SHOT WhatsApp alerts (user + guardians) at T+60min, SMS fallback ──
        try {
          const { data: userProfile } = await supabase
            .from("profiles")
            .select("phone")
            .eq("id", checkIn.user_id)
            .maybeSingle();
          const userPhone = normalizeIndianPhone(userProfile?.phone);
          if (userPhone) {
            await sendWhatsAppTemplate({
              templateName: "user_missed_checkin",
              languageCode: "en_GB",
              recipients: [{ to: [userPhone], components: { body_1: timeStr } }],
            });
          }

          const guardianPhones = Array.from(new Set(
            guardians
              .map((g) => normalizeIndianPhone(g.guardian_phone))
              .filter((p): p is string => !!p),
          ));
          if (guardianPhones.length === 0) {
            console.log(`missed check-in ${checkIn.id}: skipped, no guardian phone`);
            await supabase.from("notification_logs").insert({
              user_id: checkIn.user_id,
              type: "missed_checkin",
              channel: "whatsapp",
              status: "skipped_no_recipient",
              metadata: { check_in_id: checkIn.id },
            });
          } else {
            const wa = await sendWhatsAppTemplate({
              templateName: "ward_missed_check_in",
              languageCode: "en_GB",
              namespace: WA_NAMESPACE_V2,
              recipients: guardianPhones.map((p) => ({
                to: [p],
                components: { body_1: userName, body_2: timeStr },
              })),
            });

            await supabase.from("notification_logs").insert({
              user_id: checkIn.user_id,
              type: "missed_checkin",
              channel: "whatsapp",
              status: wa.ok ? "accepted" : "failed",
              metadata: {
                check_in_id: checkIn.id,
                template: "ward_missed_check_in",
                recipients: guardianPhones,
                request_id: (wa.body as any)?.data?.request_id ?? null,
                response: wa.body,
              },
            });

            // SMS fallback — only when WhatsApp was not accepted, so guardians
            // never get the same alert twice.
            if (!wa.ok) {
              const smsTemplateId = Deno.env.get("MSG91_MISSED_CHECKIN_TEMPLATE_ID");
              if (smsTemplateId) {
                const sms = await sendSmsFlow({
                  templateId: smsTemplateId,
                  recipients: guardianPhones.map((p) => ({
                    mobiles: p,
                    var1: userName,
                    var2: timeStr,
                  })),
                });
                await supabase.from("notification_logs").insert({
                  user_id: checkIn.user_id,
                  type: "missed_checkin",
                  channel: "sms",
                  status: sms.ok ? "accepted" : "failed",
                  metadata: {
                    check_in_id: checkIn.id,
                    template_id: smsTemplateId,
                    recipients: guardianPhones,
                    request_id: sms.requestId ?? null,
                    response: sms.body,
                  },
                });
              } else {
                console.error("MSG91_MISSED_CHECKIN_TEMPLATE_ID not set — no SMS fallback");
              }
            }
          }
        } catch (waErr) {
          console.error("WhatsApp/SMS missed check-in send error:", waErr);
        }

        // Trigger full auto-SOS for the missed check-in
        try {
          console.log(`[check-missed-checkins] Escalating missed check-in to full SOS for user ${checkIn.user_id}`);
          const { error: sosError } = await supabase.from("sos_events").insert({
            user_id: checkIn.user_id,
            trigger_type: "auto",
            status: "active",
          });
          if (sosError) {
            console.error("[check-missed-checkins] Failed to trigger auto-SOS:", sosError);
          }
        } catch (sosErr) {
          console.error("[check-missed-checkins] Exception triggering auto-SOS:", sosErr);
        }

      }
    }

    console.log(`Created ${notificationsCreated} notifications, sent ${emailsSent} emails, ${pushesSent} pushes`);


    return new Response(
      JSON.stringify({
        message: "Processed missed check-ins",
        missed: uniqueCheckIns.length,
        notifications: notificationsCreated,
        emails: emailsSent,
        pushes: pushesSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
