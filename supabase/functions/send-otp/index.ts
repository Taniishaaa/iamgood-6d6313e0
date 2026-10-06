import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendWhatsAppTemplate, WA_NAMESPACE_V2 } from "../_shared/msg91Whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_WINDOW_MIN = 10;
const RATE_LIMIT_MAX = 4;
/** Codes stay valid for 10 minutes — WhatsApp/SMS fallback can be slow. */
const OTP_EXPIRY_MIN = 10;
/** Wrong-code tries allowed against a single code before it is burned. */
const MAX_VERIFY_ATTEMPTS = 5;
/** WhatsApp OTP template (MSG91). */
const WA_OTP_TEMPLATE = "verification_otp";
/** MSG91 SMS Flow template for OTP delivery. */
const SMS_OTP_TEMPLATE_ID = "69ce5c76e1a28470900ffe46";


function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  // Explicit country code wins — never re-prefix an international number.
  if (cleaned.startsWith("+")) return cleaned.slice(1).replace(/[^\d]/g, "");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.startsWith("91") && digits.length >= 12) return digits;
  // Bare 10-digit national number: assume India (legacy default).
  if (digits.length === 10) return `91${digits}`;
  return digits;
}


function generateOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

/** App Store reviewer accounts: fixed OTP, no SMS/WhatsApp dispatch, no rate limit. */
function reviewPhones(): string[] {
  return (Deno.env.get("REVIEW_PHONES") ?? "")
    .split(",")
    .map((p) => normalizePhone(p.trim()))
    .filter((p) => p.length >= 12);
}

function isReviewPhone(phone: string): boolean {
  return reviewPhones().includes(phone);
}

/** Give a reviewer account full premium access for 30 days if they have none active. */
async function ensureReviewAccess(admin: ReturnType<typeof getAdminClient>, userId: string) {
  try {
    const { data: existing } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (existing) return;

    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("subscriptions").insert({
      user_id: userId,
      plan_type: "premium",
      billing_cycle: "monthly",
      status: "active",
      amount_paise: 0,
      coupon_code: "APPSTORE_REVIEW",
      expires_at: expires,
    });
  } catch (e) {
    console.error("[send-otp] ensureReviewAccess failed:", e);
  }
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function isRateLimited(admin: ReturnType<typeof getAdminClient>, phone: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("otp_events")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .in("action", ["send", "resend"])
    .gte("created_at", since);

  if (error) {
    console.error("[send-otp] Rate limit check failed:", error.message);
    return false;
  }
  return (count ?? 0) >= RATE_LIMIT_MAX;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function logOtpEvent(
  admin: ReturnType<typeof getAdminClient>,
  phone: string,
  action: string,
  requestId?: string,
  status = "sent",
  failureReason?: string,
  otpCode?: string,
  expiresAt?: string,
  channel?: string,
) {
  // Store only a SHA-256 hash of the OTP — never the plaintext code.
  const hashed = otpCode ? await sha256Hex(otpCode) : null;
  const { error } = await admin.from("otp_events").insert({
    phone,
    action,
    request_id: requestId || null,
    status,
    failure_reason: failureReason || null,
    otp_hash: hashed,
    expires_at: expiresAt || null,
    channel: channel || null,
  });
  if (error) console.error("[send-otp] Failed to log event:", error.message);
}


function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authKey = Deno.env.get("MSG91_AUTH_KEY");

    if (!authKey) {
      console.error("[send-otp] Missing config — MSG91_AUTH_KEY");
      return jsonResponse({ error: "OTP service not configured" }, 500);
    }


    const body = await req.json();
    const action = body.action || "send";
    const rawPhone = body.phone;
    const otp = body.otp;
    const purpose = body.purpose;

    if (!rawPhone || typeof rawPhone !== "string") {
      return jsonResponse({ error: "phone is required" }, 400);
    }

    const phone = normalizePhone(rawPhone);
    const admin = getAdminClient();

    console.log(`[send-otp] action=${action} phone=${phone} purpose=${purpose || "login"}`);

    // A short-lived, phone-bound status check lets the client distinguish
    // provider acceptance from actual delivery without exposing OTP data.
    if (action === "status") {
      const requestId = typeof body.request_id === "string" ? body.request_id : "";
      if (!requestId || requestId.length > 200) {
        return jsonResponse({ error: "request_id is required" }, 400);
      }
      const { data: event } = await admin
        .from("otp_events")
        .select("delivery_status, failure_reason")
        .eq("phone", phone)
        .eq("request_id", requestId)
        .in("action", ["send", "resend"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return jsonResponse({
        success: true,
        delivery_status: event?.delivery_status ?? "pending",
        failure_reason: event?.failure_reason ?? null,
      });
    }

    // ── APP STORE REVIEW BYPASS ─────────────────────────────
    if (isReviewPhone(phone)) {
      const reviewCode = Deno.env.get("REVIEW_OTP_CODE") ?? "";

      if (action !== "verify") {
        console.log(`[send-otp] review bypass: skipping dispatch for ${phone}`);
        await logOtpEvent(admin, phone, "review_bypass", undefined, "sent");
        return jsonResponse({ success: true, channels: { sms: "skipped", whatsapp: "skipped" } });
      }

      if (!reviewCode || otp !== reviewCode) {
        await logOtpEvent(admin, phone, "review_bypass_fail", undefined, "failed", "Invalid review code");
        return jsonResponse({ success: false, error: "Invalid or expired OTP" }, 400);
      }

      await logOtpEvent(admin, phone, "review_bypass_verify", undefined, "verified");

      if (purpose === "register") {
        return jsonResponse({ success: true, verified: true });
      }

      const phoneWithPlus = `+${phone}`;
      const { data: email, error: rpcError } = await admin.rpc("get_email_by_phone", { _phone: phoneWithPlus });
      if (rpcError || !email) {
        return jsonResponse({ success: true, verified: true, no_account: true });
      }

      const { data: userRow } = await admin
        .from("profiles")
        .select("id")
        .eq("phone", phoneWithPlus)
        .limit(1)
        .maybeSingle();
      if (userRow?.id) await ensureReviewAccess(admin, userRow.id);

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: email as string,
      });
      if (linkError || !linkData) {
        console.error("[send-otp] review magic link failed:", linkError?.message);
        return jsonResponse({ success: true, verified: true, error: "Failed to create session" });
      }

      return jsonResponse({
        success: true,
        verified: true,
        token_hash: linkData.properties?.hashed_token,
        email: email as string,
      });
    }


    // ── VERIFY ──────────────────────────────────────────────
    if (action === "verify") {
      if (!otp || typeof otp !== "string" || otp.length !== 6) {
        return jsonResponse({ error: "Valid 6-digit OTP is required" }, 400);
      }

      // Accept ANY unexpired, unused code for this phone — a resend must not
      // invalidate the code already sitting in the guardian's WhatsApp/SMS.
      const { data: liveRows, error: lookupErr } = await admin
        .from("otp_events")
        .select("id, otp_hash, expires_at, attempts")
        .eq("phone", phone)
        .in("action", ["send", "resend"])
        .eq("status", "sent")
        .not("otp_hash", "is", null)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);

      if (lookupErr) {
        console.error("[send-otp] OTP lookup error:", lookupErr.message);
        return jsonResponse({ success: false, error: "Verification failed" }, 500);
      }

      const rows = liveRows ?? [];
      if (rows.length === 0) {
        await logOtpEvent(admin, phone, "verify_fail", undefined, "failed", "No live OTP");
        return jsonResponse(
          { success: false, code: "expired", error: "This code has expired. Please request a new one." },
          400,
        );
      }

      const usable = rows.filter((r) => (r.attempts ?? 0) < MAX_VERIFY_ATTEMPTS);
      if (usable.length === 0) {
        return jsonResponse(
          { success: false, code: "too_many_attempts", error: "Too many incorrect attempts. Please request a new code." },
          400,
        );
      }

      const submittedHash = await sha256Hex(otp);
      const otpRow = usable.find((r) => r.otp_hash === submittedHash);

      if (!otpRow) {
        // Burn one attempt on every live code so brute force is bounded.
        for (const r of usable) {
          await admin.from("otp_events").update({ attempts: (r.attempts ?? 0) + 1 }).eq("id", r.id);
        }
        await logOtpEvent(admin, phone, "verify_fail", undefined, "failed", "Wrong code");
        return jsonResponse(
          { success: false, code: "wrong_code", error: "That code is not correct. Please re-check the latest message." },
          400,
        );
      }

      // Mark as verified and nullify every live hash for this phone.
      await admin
        .from("otp_events")
        .update({ verified: true, status: "verified", otp_hash: null })
        .in("id", rows.map((r) => r.id));
      await logOtpEvent(admin, phone, "verify", undefined, "verified");


      // Registration: just confirm
      if (purpose === "register") {
        return jsonResponse({ success: true, verified: true });
      }

      // Login: generate session via magic link
      try {
        const phoneWithPlus = `+${phone}`;
        const { data: email, error: rpcError } = await admin.rpc("get_email_by_phone", { _phone: phoneWithPlus });
        console.log(`[send-otp] get_email_by_phone(${phoneWithPlus}):`, email, rpcError?.message);

        if (rpcError || !email) {
          return jsonResponse({ success: true, verified: true, no_account: true });
        }

        // An administrator-blocked account cannot start a new session.
        const { data: accessRow } = await admin
          .from("profiles")
          .select("blocked_at, blocked_reason")
          .eq("phone", phoneWithPlus)
          .limit(1)
          .maybeSingle();
        if (accessRow?.blocked_at) {
          await logOtpEvent(admin, phone, "verify_blocked", undefined, "failed", "Account blocked");
          return jsonResponse({
            success: true,
            verified: true,
            blocked: true,
            error: "This account has been blocked from signing in. Please contact Check-iN support.",
          });
        }

        const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: email as string,
        });

        if (linkError || !linkData) {
          console.error("[send-otp] Magic link generation failed:", linkError?.message);
          return jsonResponse({ success: true, verified: true, error: "Failed to create session" });
        }

        const tokenHash = linkData.properties?.hashed_token;
        console.log(`[send-otp] Session created for ${email}`);

        return jsonResponse({ success: true, verified: true, token_hash: tokenHash, email: email as string });
      } catch (authErr) {
        console.error("[send-otp] Auth error:", authErr);
        return jsonResponse({ success: true, verified: true, error: String(authErr) });
      }
    }

    // ── SEND / RESEND ───────────────────────────────────────
    // Guardian invite path: never dispatch to a number the ward did not invite.
    const nominationToken = typeof body.nomination_token === "string" ? body.nomination_token : null;
    if (nominationToken) {
      const { data: nom } = await admin
        .from("guardians")
        .select("guardian_phone")
        .eq("nomination_token", nominationToken)
        .maybeSingle();
      const invited = nom?.guardian_phone ? normalizePhone(nom.guardian_phone) : null;
      if (invited && invited !== phone) {
        const masked = `+${invited.slice(0, 4)}\u2026${invited.slice(-3)}`;
        console.warn(`[send-otp] nomination phone mismatch: typed=${phone} invited=${invited}`);
        return jsonResponse(
          { error: `This invite was sent to ${masked}. Please use that number, or ask your ward to re-send the invite.` },
          400,
        );
      }
    }

    // Channel choice: the guardian/user picks WhatsApp or SMS on the screen.
    const channel: "sms" | "whatsapp" = body.channel === "sms" ? "sms" : "whatsapp";

    // Reuse a live code on a plain "send" (screen re-entry / auto-request) so we
    // never invalidate a code that is already on its way to the phone.
    if (action === "send") {
      const { data: live } = await admin
        .from("otp_events")
        .select("id, request_id, expires_at, channel")
        .eq("phone", phone)
        .in("action", ["send", "resend"])
        .eq("status", "sent")
        .not("otp_hash", "is", null)
        .gte("expires_at", new Date().toISOString())
        .eq("channel", channel)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (live) {
        const secondsLeft = Math.max(0, Math.floor((new Date(live.expires_at).getTime() - Date.now()) / 1000));
        console.log(`[send-otp] reusing live code for ${phone} (${secondsLeft}s left)`);
        return jsonResponse({
          success: true,
          reused: true,
          channel,
          channels: { [channel]: "reused" },
          request_id: live.request_id ?? null,
          expires_in: secondsLeft,
        });
      }
    }

    if (await isRateLimited(admin, phone)) {
      console.log(`[send-otp] Rate limited: ${phone}`);
      return jsonResponse({ error: "Too many OTP requests. Please wait 10 minutes before trying again.", rate_limited: true }, 429);
    }

    // Generate OTP and expiry
    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000).toISOString();

    let sendSuccess = false;
    let sendErrorMsg: string | undefined;
    let sendRequestId: string | undefined;

    if (channel === "sms") {
      // ── MSG91 SMS FLOW ───────────────────────────────────
      console.log(`[send-otp] Dispatching MSG91 SMS flow for phone=${phone}`);
      try {
        const smsRes = await fetch("https://control.msg91.com/api/v5/flow", {
          method: "POST",
          headers: { "Content-Type": "application/json", authkey: authKey },
          body: JSON.stringify({
            template_id: SMS_OTP_TEMPLATE_ID,
            short_url: "0",
            recipients: [{ mobiles: phone, otp: otpCode, var1: otpCode, OTP: otpCode }],
          }),
        });
        const resBody: any = await smsRes.json().catch(() => ({}));
        console.log(`[send-otp] MSG91 SMS response (${smsRes.status}):`, JSON.stringify(resBody).slice(0, 400));
        sendRequestId = resBody?.request_id || (typeof resBody?.message === "string" ? resBody.message : undefined);
        if (smsRes.ok && resBody?.type !== "error") {
          sendSuccess = true;
        } else {
          sendErrorMsg = JSON.stringify(resBody).slice(0, 300);
        }
      } catch (e) {
        sendErrorMsg = String(e);
        console.error("[send-otp] SMS flow error:", e);
      }
    } else {
      // ── MSG91 WHATSAPP TEMPLATE ──────────────────────────
      console.log(`[send-otp] Dispatching MSG91 WhatsApp template ${WA_OTP_TEMPLATE} for phone=${phone}`);
      try {
        const wa = await sendWhatsAppTemplate({
          templateName: WA_OTP_TEMPLATE,
          languageCode: "en",
          namespace: WA_NAMESPACE_V2,
          recipients: [{ to: [phone], components: { body_1: otpCode, button_1_url: otpCode } }],
        });
        const waBody: any = wa.body;
        sendRequestId =
          waBody?.data?.request_id ||
          waBody?.request_id ||
          (typeof waBody?.message === "string" ? waBody.message : undefined);
        sendSuccess = wa.ok;
        if (!wa.ok) sendErrorMsg = JSON.stringify(waBody).slice(0, 300);
        console.log(`[send-otp] WhatsApp OTP response (${wa.status}):`, JSON.stringify(waBody).slice(0, 400));
      } catch (e) {
        sendErrorMsg = String(e);
        console.error("[send-otp] WhatsApp OTP error:", e);
      }
    }

    await logOtpEvent(
      admin,
      phone,
      action,
      sendRequestId,
      sendSuccess ? "sent" : "failed",
      sendErrorMsg,
      sendSuccess ? otpCode : undefined,
      sendSuccess ? expiresAt : undefined,
      channel,
    );

    const channels = { [channel]: sendSuccess ? "sent" : "failed" };

    if (!sendSuccess) {
      return jsonResponse({ success: false, channel, channels, error: sendErrorMsg || "OTP delivery failed" }, 400);
    }

    return jsonResponse({
      success: true,
      channel,
      channels,
      request_id: sendRequestId ?? null,
      expires_in: OTP_EXPIRY_MIN * 60,
    });


  } catch (err) {
    console.error("[send-otp] Unhandled error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
