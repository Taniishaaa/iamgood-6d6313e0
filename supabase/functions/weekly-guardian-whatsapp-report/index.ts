/**
 * weekly-guardian-whatsapp-report
 * ─────────────────────────────────────────────────────────────────────────
 * Every Sunday at 03:30 UTC (09:00 IST):
 *   1. Builds the same stats as the weekly email report
 *   2. Generates a branded PDF with jsPDF
 *   3. Uploads it to the private `weekly-reports` bucket (7-day signed URL)
 *   4. Sends the MSG91 template `weekly_report_guardian` (5 body vars)
 *   5. Sends the PDF as a WhatsApp document message
 *
 * Cron: weekly-guardian-wa-report (30 3 * * 0)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
// @ts-ignore - jsPDF has no Deno types
import { jsPDF } from "npm:jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const INTEGRATED_NUMBER = "917045868482";
const WA_NAMESPACE_V2 = "e67e5302_b6d0_403e_b3cc_8fa6e8accb01";
const WA_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
const BUCKET = "weekly-reports";

// ── IST helpers ────────────────────────────────────────────────────────────
function nowIST(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function prevWeekRangeIST(): { weekStart: Date; weekEnd: Date; label: string } {
  const now = nowIST();
  const dow = now.getDay();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() - dow);
  weekEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
  return { weekStart, weekEnd, label: `${fmt(weekStart)} – ${fmt(weekEnd)}` };
}

// ── Stats (same logic as weekly-guardian-report) ───────────────────────────
async function buildStats(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  weekStart: Date,
  weekEnd: Date,
) {
  const s = weekStart.toISOString();
  const e = weekEnd.toISOString();

  const [
    { data: checkIns },
    { data: medLogs },
    { data: sosEvents },
    { data: wellness },
  ] = await Promise.all([
    supabase.from("check_ins").select("status, scheduled_at").eq("user_id", userId).gte("scheduled_at", s).lte("scheduled_at", e),
    supabase.from("medication_logs").select("status, scheduled_at").eq("user_id", userId).gte("scheduled_at", s).lte("scheduled_at", e),
    supabase.from("sos_events").select("triggered_at").eq("user_id", userId).gte("triggered_at", s).lte("triggered_at", e),
    supabase.from("wellness_logs").select("heart_rate, spo2, log_date").eq("user_id", userId).gte("log_date", s.slice(0, 10)).lte("log_date", e.slice(0, 10)),
  ]);

  const ci = checkIns || [];
  const ml = medLogs || [];
  const sos = sosEvents || [];
  const wl = wellness || [];

  const totalCheckIns = ci.length;
  const respondedCheckIns = ci.filter((r: any) => r.status === "responded").length;
  const missedCheckIns = ci.filter((r: any) => r.status === "missed").length;
  const totalMeds = ml.length;
  const takenMeds = ml.filter((r: any) => r.status === "taken" || r.status === "taken_late").length;
  const missedMeds = ml.filter((r: any) => r.status === "missed").length;
  const lateMeds = ml.filter((r: any) => r.status === "taken_late").length;
  const totalSOS = sos.length;

  const adherencePct = totalCheckIns > 0 ? Math.round((respondedCheckIns / totalCheckIns) * 100) : 0;
  const medAdherencePct = totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) : 0;
  const healthScore = Math.round(adherencePct * 0.5 + medAdherencePct * 0.4 + (totalSOS === 0 ? 10 : 0));

  const hrVals = wl.filter((w: any) => w.heart_rate > 0).map((w: any) => w.heart_rate);
  const spo2Vals = wl.filter((w: any) => w.spo2 > 0).map((w: any) => w.spo2);
  const avgHR = hrVals.length > 0 ? Math.round(hrVals.reduce((a: number, b: number) => a + b, 0) / hrVals.length) : null;
  const avgSpO2 = spo2Vals.length > 0 ? Math.round(spo2Vals.reduce((a: number, b: number) => a + b, 0) / spo2Vals.length) : null;

  const missedCheckInDetails = ci
    .filter((r: any) => r.status === "missed")
    .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .map((r: any) =>
      new Date(r.scheduled_at).toLocaleDateString("en-IN", {
        weekday: "short", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
      }),
    )
    .slice(0, 5);

  return {
    healthScore, adherencePct, medAdherencePct,
    totalCheckIns, respondedCheckIns, missedCheckIns,
    totalMeds, takenMeds, missedMeds, lateMeds,
    totalSOS, avgHR, avgSpO2, missedCheckInDetails,
  };
}

type Stats = Awaited<ReturnType<typeof buildStats>>;

// ── PDF ────────────────────────────────────────────────────────────────────
function generatePDF(opts: {
  guardianName: string;
  wardName: string;
  weekLabel: string;
  relation: string;
  stats: Stats;
}): Uint8Array {
  const { guardianName, wardName, weekLabel, relation, stats } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;

  const scoreColor = (s: number): [number, number, number] =>
    s >= 80 ? [46, 204, 138] : s >= 60 ? [245, 166, 35] : [229, 83, 83];
  const scoreLabel = (s: number) =>
    s >= 80 ? "Excellent" : s >= 60 ? "Needs Attention" : "Please Call Them";

  let y = 0;

  // Header
  doc.setFillColor(15, 30, 53);
  doc.rect(0, 0, W, 40, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(240, 244, 255);
  doc.text("CHECK-", 14, 17);
  doc.setTextColor(46, 204, 138);
  doc.text("iN", 14 + doc.getTextWidth("CHECK-"), 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(155, 186, 196);
  doc.text("Personal Safety Network", 14, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(240, 244, 255);
  doc.text("Weekly Report Card", W - 14, 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(155, 186, 196);
  doc.text(weekLabel, W - 14, 22, { align: "right" });
  doc.text(
    `Generated: ${nowIST().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
    W - 14, 28, { align: "right" },
  );
  doc.setFillColor(46, 204, 138);
  doc.rect(0, 38, W, 2.5, "F");
  y = 50;

  // Greeting
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(26, 26, 26);
  doc.text(`Hi ${guardianName},`, 14, y); y += 7;
  doc.setFontSize(9.5);
  doc.setTextColor(94, 116, 153);
  doc.text(`Here is how your ${relation.toLowerCase()}, ${wardName}, did last week.`, 14, y); y += 12;

  // Health score banner
  const [sr, sg, sb] = scoreColor(stats.healthScore);
  doc.setFillColor(242, 244, 247);
  doc.roundedRect(14, y, W - 28, 30, 4, 4, "F");
  doc.setFillColor(sr, sg, sb);
  doc.roundedRect(14, y, 4, 30, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(sr, sg, sb);
  const scoreStr = String(stats.healthScore);
  doc.text(scoreStr, 30, y + 18);
  const scoreW = doc.getTextWidth(scoreStr);
  doc.setFontSize(10);
  doc.text("/100", 30 + scoreW + 1.5, y + 18);
  doc.setFontSize(13);
  doc.setTextColor(15, 30, 53);
  doc.text(`Health Score: ${scoreLabel(stats.healthScore)}`, 72, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(94, 116, 153);
  const msg = stats.healthScore >= 80
    ? `Great week! ${wardName} checked in regularly and took medications on time.`
    : stats.healthScore >= 60
    ? `Reasonable week - a few missed check-ins or medications. Consider reaching out.`
    : `Difficult week with multiple misses. We recommend calling ${wardName} directly.`;
  doc.text(doc.splitTextToSize(msg, W - 88), 72, y + 20);
  y += 40;

  // Stat cards
  const cardW = (W - 28 - 12) / 4;
  [
    { label: "Check-ins", val: `${stats.respondedCheckIns}/${stats.totalCheckIns}`, sub: `${stats.adherencePct}% on time`, color: scoreColor(stats.adherencePct) },
    { label: "Medications", val: `${stats.takenMeds}/${stats.totalMeds}`, sub: `${stats.medAdherencePct}% taken`, color: scoreColor(stats.medAdherencePct) },
    { label: "SOS Alerts", val: String(stats.totalSOS), sub: stats.totalSOS === 0 ? "None this week" : "Triggered", color: (stats.totalSOS === 0 ? [46, 204, 138] : [229, 83, 83]) as [number, number, number] },
    { label: "Missed", val: String(stats.missedCheckIns), sub: "check-ins", color: (stats.missedCheckIns === 0 ? [46, 204, 138] : [245, 166, 35]) as [number, number, number] },
  ].forEach((card, i) => {
    const cx = 14 + i * (cardW + 4);
    doc.setFillColor(242, 244, 247);
    doc.roundedRect(cx, y, cardW, 26, 3, 3, "F");
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.roundedRect(cx, y, cardW, 2.5, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(94, 116, 153);
    doc.text(card.label, cx + cardW / 2, y + 9, { align: "center" });
    doc.setFontSize(15); doc.setTextColor(card.color[0], card.color[1], card.color[2]);
    doc.text(card.val, cx + cardW / 2, y + 18, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(94, 116, 153);
    doc.text(card.sub, cx + cardW / 2, y + 23, { align: "center" });
  });
  y += 36;

  // Vitals
  if (stats.avgHR !== null || stats.avgSpO2 !== null) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(15, 30, 53);
    doc.text("Vitals - Weekly Average", 14, y); y += 6;
    const vW = (W - 28 - 4) / 2;
    [
      { label: "Avg Heart Rate", val: stats.avgHR !== null ? `${stats.avgHR} bpm` : "No data", ok: stats.avgHR !== null && stats.avgHR >= 60 && stats.avgHR <= 100 },
      { label: "Avg SpO2", val: stats.avgSpO2 !== null ? `${stats.avgSpO2}%` : "No data", ok: stats.avgSpO2 !== null && stats.avgSpO2 >= 95 },
    ].forEach((v, i) => {
      const vx = 14 + i * (vW + 4);
      doc.setFillColor(242, 244, 247); doc.roundedRect(vx, y, vW, 16, 3, 3, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(94, 116, 153);
      doc.text(v.label, vx + 5, y + 6);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      const c: [number, number, number] = v.ok ? [46, 204, 138] : [245, 166, 35];
      doc.setTextColor(c[0], c[1], c[2]); doc.text(v.val, vx + 5, y + 13);
    });
    y += 24;
  }

  // Missed check-ins
  if (stats.missedCheckInDetails.length > 0) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(15, 30, 53);
    doc.text("Missed Check-ins", 14, y); y += 5;
    stats.missedCheckInDetails.forEach((dt: string) => {
      doc.setFillColor(253, 242, 242); doc.roundedRect(14, y, W - 28, 7.5, 2, 2, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.setTextColor(229, 83, 83); doc.circle(19, y + 3.7, 1, "F");
      doc.setTextColor(26, 26, 26); doc.text(dt, 24, y + 5);
      y += 9;
    });
    y += 3;
  }

  // Medication notes
  if (stats.lateMeds > 0 || stats.missedMeds > 0) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(15, 30, 53);
    doc.text("Medication Notes", 14, y); y += 5;
    doc.setFillColor(242, 244, 247); doc.roundedRect(14, y, W - 28, 16, 3, 3, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const onTime = stats.takenMeds - stats.lateMeds;
    if (onTime > 0) { doc.setTextColor(46, 204, 138); doc.text(`Taken on time: ${onTime}`, 18, y + 6); }
    if (stats.lateMeds > 0) { doc.setTextColor(245, 166, 35); doc.text(`Taken late: ${stats.lateMeds}`, 18, y + 12); }
    if (stats.missedMeds > 0) { doc.setTextColor(229, 83, 83); doc.text(`Missed: ${stats.missedMeds}`, W / 2, y + 6); }
    y += 24;
  }

  // Footer
  const pH = 297;
  doc.setFillColor(15, 30, 53); doc.rect(0, pH - 15, W, 15, "F");
  doc.setFillColor(46, 204, 138); doc.rect(0, pH - 15, W, 1.5, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(155, 186, 196);
  doc.text("Check-iN by Future Wave Technologies Pvt. Ltd.  ·  futurewave.in", 14, pH - 7);
  doc.text("Automated weekly report. Open Check-iN app for real-time details.", W - 14, pH - 7, { align: "right" });

  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Upload PDF ─────────────────────────────────────────────────────────────
async function uploadPDF(
  supabase: ReturnType<typeof createClient>,
  pdfBytes: Uint8Array,
  wardName: string,
  guardianId: string,
  weekEnd: Date,
): Promise<string | null> {
  const path = `${weekEnd.toISOString().slice(0, 10)}/${wardName.replace(/[^a-zA-Z0-9]/g, "_")}_${guardianId}.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (error) { console.error("[wa-report] upload failed:", error.message); return null; }

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 7 * 24 * 60 * 60);
  return signed?.signedUrl ?? null;
}

// ── Phone normalisation ────────────────────────────────────────────────────
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  if (!d.startsWith("91") || d.length < 12) return null;
  return d;
}

// ── WhatsApp template (5 body variables) ───────────────────────────────────
async function sendTemplateMsg(
  phone: string,
  v: { v1: string; v2: string; v3: string; v4: string; v5: string },
): Promise<boolean> {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  if (!authKey) { console.error("[wa-report] MSG91_AUTH_KEY missing"); return false; }

  const payload = {
    integrated_number: INTEGRATED_NUMBER,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: "weekly_report_guardian",
        language: { code: "en", policy: "deterministic" },
        namespace: WA_NAMESPACE_V2,
        to_and_components: [{
          to: [phone],
          components: {
            body_1: { type: "text", value: v.v1 },
            body_2: { type: "text", value: v.v2 },
            body_3: { type: "text", value: v.v3 },
            body_4: { type: "text", value: v.v4 },
            body_5: { type: "text", value: v.v5 },
          },
        }],
      },
    },
  };

  try {
    const res = await fetch(WA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: authKey },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`[wa-report] template (${res.status}):`, JSON.stringify(body).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("[wa-report] template threw:", err);
    return false;
  }
}

// ── WhatsApp document (PDF) ────────────────────────────────────────────────
async function sendPDFDoc(phone: string, wardName: string, weekLabel: string, pdfUrl: string): Promise<void> {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  if (!authKey || !pdfUrl) return;

  const payload = {
    integrated_number: INTEGRATED_NUMBER,
    content_type: "document",
    payload: {
      messaging_product: "whatsapp",
      type: "document",
      to: phone,
      document: {
        link: pdfUrl,
        caption: `Weekly Check-iN Report for ${wardName} — ${weekLabel}`,
        filename: `CheckiN_Report_${wardName.replace(/\s+/g, "_")}_${weekLabel.replace(/[^a-zA-Z0-9]/g, "")}.pdf`,
      },
    },
  };

  try {
    const res = await fetch(WA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: authKey },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`[wa-report] PDF doc (${res.status}):`, text.slice(0, 300));
  } catch (err) {
    console.error("[wa-report] PDF doc threw:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const triggeredBy = String(body.triggeredBy || "cron");
    const targetUserId = body.userId ?? null;
    // dryRun: build + upload the PDF but send no WhatsApp messages and write no log row
    const dryRun = body.dryRun === true;

    if (triggeredBy === "cron") {
      const now = nowIST();
      if (now.getDay() !== 0) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "Not Sunday IST", ist: now.toString() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { weekStart, weekEnd, label } = prevWeekRangeIST();

    let q = supabase
      .from("guardians")
      .select("id, guardian_name, guardian_phone, guardian_email, relation, user_id, is_primary")
      .eq("status", "accepted")
      .eq("is_primary", true)
      .not("guardian_phone", "is", null)
      .neq("guardian_phone", "");

    if (targetUserId) q = q.eq("user_id", targetUserId);

    const { data: guardians, error: gErr } = await q;
    if (gErr) throw gErr;

    if (!guardians || guardians.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No primary guardians with phone found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userIds = [...new Set(guardians.map((g: any) => g.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    const profileMap: Record<string, string> = {};
    for (const p of profiles || []) profileMap[p.id as string] = (p.full_name as string) || "Your ward";

    let sentCount = 0;
    const errors: string[] = [];

    for (const g of guardians as any[]) {
      const phone = normalizePhone(g.guardian_phone);
      if (!phone) {
        errors.push(`${g.guardian_name}: cannot normalise phone ${g.guardian_phone}`);
        continue;
      }

      const idempotencyKey = `weekly-wa-report-${g.id}-${weekEnd.toISOString().slice(0, 10)}`;
      const { data: alreadySent } = await supabase
        .from("email_send_log")
        .select("id")
        .eq("template_name", "weekly-wa-report")
        .filter("metadata->>idempotency_key", "eq", idempotencyKey)
        .maybeSingle();

      if (alreadySent) {
        console.log(`[wa-report] already sent for ${g.id} this week — skipping`);
        continue;
      }

      try {
        const wardName = profileMap[g.user_id] || "Your ward";
        const stats = await buildStats(supabase, g.user_id, weekStart, weekEnd);

        const ciMark = stats.adherencePct >= 80 ? "✓" : "⚠";
        const medMark = stats.medAdherencePct >= 80 ? "✓" : "⚠";
        const sosPart = stats.totalSOS === 0
          ? "No SOS events"
          : `${stats.totalSOS} SOS event${stats.totalSOS > 1 ? "s" : ""} triggered`;

        const vars = {
          v1: g.guardian_name,
          v2: wardName,
          v3: label,
          v4: `${stats.healthScore}/100 — ${stats.healthScore >= 80 ? "Excellent" : stats.healthScore >= 60 ? "Needs Attention" : "Please Call Them"}`,
          v5: [
            `Check-ins: ${stats.respondedCheckIns}/${stats.totalCheckIns} ${ciMark}`,
            `Medications: ${stats.takenMeds}/${stats.totalMeds} ${medMark}`,
            sosPart,
          ].join("  |  "),
        };

        console.log(`[wa-report] → ${g.guardian_name} (+${phone}) for ${wardName}${dryRun ? " [dryRun]" : ""}`);
        if (!dryRun) {
          const ok = await sendTemplateMsg(phone, vars);
          if (!ok) throw new Error("Template message failed");
        }

        const pdfBytes = generatePDF({
          guardianName: g.guardian_name,
          wardName,
          weekLabel: label,
          relation: g.relation || "Ward",
          stats,
        });

        const pdfUrl = await uploadPDF(supabase, pdfBytes, wardName, g.id, weekEnd);
        if (!pdfUrl) {
          console.warn(`[wa-report] PDF upload failed for ${g.guardian_name} — skipping document send`);
        } else if (!dryRun) {
          await sendPDFDoc(phone, wardName, label, pdfUrl);
        }

        if (dryRun) {
          sentCount++;
          console.log(`[wa-report] dryRun ok for ${g.guardian_name} — pdf: ${pdfUrl ? "uploaded" : "failed"}`);
          continue;
        }

        await supabase.from("email_send_log").insert({
          template_name: "weekly-wa-report",
          recipient_email: g.guardian_email || g.guardian_phone,
          status: "sent",
          metadata: { idempotency_key: idempotencyKey, guardian_id: g.id, ward_user_id: g.user_id, week_label: label, pdf_url: pdfUrl ?? null },
        });

        sentCount++;
        console.log(`[wa-report] ✓ ${g.guardian_name} for ward ${wardName}`);
      } catch (err: any) {
        const msg = `${g.guardian_name} (${g.guardian_phone}): ${err.message}`;
        console.error("[wa-report]", msg);
        errors.push(msg);
      }
    }

    return new Response(
      JSON.stringify({ sent: sentCount, errors, weekLabel: label }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[wa-report] fatal:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
