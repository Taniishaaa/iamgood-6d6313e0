import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { pushToUser } from "../_shared/webPush.ts";

// Vitals retention: data from the previous month (and older) is deleted on the
// 7th of each month at 12:00 IST. Warnings: last day of previous month, 5th,
// and 7th at 11:00 IST (one hour before). Users with an active
// "vitals-storage" add-on are skipped entirely.

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function istParts(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), day: ist.getUTCDate() };
}
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const fmt = (s: string) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const auth = req.headers.get("Authorization") || "";
  if (!(auth === `Bearer ${key}` || (cronSecret && req.headers.get("x-cron-secret") === cronSecret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const mode = body?.mode === "purge" ? "purge" : "notify";
  const dryRun = !!body?.dryRun;
  const sb = createClient(url, key);

  const { y, m, day } = istParts();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  // Users who pay for extra storage are exempt.
  const { data: storage } = await sb.from("subscriptions").select("user_id")
    .eq("plan_type", "vitals-storage").eq("status", "active").gte("expires_at", new Date().toISOString());
  const exempt = new Set((storage || []).map((r: any) => r.user_id));

  // Determine purge month & stage
  let stage: string | null = null;
  let purgeY = y, purgeM = m;
  if (mode === "purge") {
    if (day !== 7 && !body?.force) return json({ skipped: "not the 7th" });
    stage = "purge";
  } else if (day === lastDay) {
    stage = "7_days"; purgeM = m + 1;
    if (purgeM > 11) { purgeM = 0; purgeY = y + 1; }
  } else if (day === 5) stage = "2_days";
  else if (day === 7) stage = "1_hour";
  if (!stage) return json({ skipped: "no notice today" });

  const purgeDate = iso(purgeY, purgeM, 7);
  const cutoff = iso(purgeY, purgeM, 1); // everything before this date goes
  const cutoffTs = `${cutoff}T00:00:00+05:30`;

  // Affected users = those holding vitals older than cutoff
  const users = new Set<string>();
  const [a, f, p] = await Promise.all([
    sb.from("activity_logs").select("user_id").lt("log_date", cutoff).limit(10000),
    sb.from("face_scans").select("user_id").lt("scanned_at", cutoffTs).limit(10000),
    sb.from("ppg_sessions").select("user_id").lt("recorded_at", cutoffTs).limit(10000),
  ]);
  for (const r of [...(a.data || []), ...(f.data || []), ...(p.data || [])]) {
    if (!exempt.has((r as any).user_id)) users.add((r as any).user_id);
  }

  if (mode === "purge") {
    let deleted = 0;
    if (!dryRun) {
      for (const uid of users) {
        const r1 = await sb.from("activity_logs").delete({ count: "exact" }).eq("user_id", uid).lt("log_date", cutoff);
        const r2 = await sb.from("face_scans").delete({ count: "exact" }).eq("user_id", uid).lt("scanned_at", cutoffTs);
        const r3 = await sb.from("ppg_sessions").delete({ count: "exact" }).eq("user_id", uid).lt("recorded_at", cutoffTs);
        deleted += (r1.count || 0) + (r2.count || 0) + (r3.count || 0);
      }
    }
    return json({ mode, cutoff, users: users.size, deleted, dryRun });
  }

  const when = stage === "1_hour" ? "in 1 hour (12:00 PM today)" : `on ${fmt(purgeDate)}`;
  const title = stage === "1_hour" ? "Vitals data deleting in 1 hour" : "Vitals data will be deleted soon";
  const message = `Vitals data older than a month (before ${fmt(cutoff)}) will be deleted ${when}. Save a "Your Health Vitals" report to your Vault before it's removed.`;

  let sent = 0, pushes = 0, guardianNotices = 0;
  for (const uid of users) {
    if (dryRun) { sent++; continue; }
    const { error } = await sb.from("vitals_retention_notices").insert({ user_id: uid, purge_date: purgeDate, stage });
    if (error) continue; // already sent this stage (also gates guardian alerts)
    await sb.rpc("insert_notification_deduped", {
      p_user_id: uid, p_title: title, p_message: message, p_type: "vitals_retention", p_guardian_id: null,
    });
    pushes += await pushToUser(sb, uid, {
      title, body: message, tag: `vitals-retention-${purgeDate}-${stage}`,
      url: "/", type: "vitals_retention", user_id: uid,
    });

    // Guardians
    const [{ data: prof }, { data: gs }] = await Promise.all([
      sb.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
      sb.from("guardians").select("id, guardian_user_id").eq("user_id", uid).eq("status", "accepted"),
    ]);
    const name = prof?.full_name || "Your ward";
    const gTitle = stage === "1_hour" ? `${name}'s vitals deleting in 1 hour` : `${name}'s vitals will be deleted soon`;
    const gMsg = `${name}'s vitals older than a month (before ${fmt(cutoff)}) will be deleted ${when}. Ask them to save a "Your Health Vitals" report before it's removed.`;
    for (const g of gs || []) {
      await sb.from("notifications").insert({ user_id: uid, guardian_id: g.id, title: gTitle, message: gMsg, type: "vitals_retention" });
      guardianNotices++;
      if (g.guardian_user_id) {
        pushes += await pushToUser(sb, g.guardian_user_id, {
          title: gTitle, body: gMsg, tag: `vitals-retention-${uid}-${purgeDate}-${stage}`,
          url: "/guardian", type: "vitals_retention",
        });
      }
    }
    sent++;
  }
  return json({ mode, stage, purgeDate, users: users.size, sent, pushes, guardianNotices, dryRun });
});
