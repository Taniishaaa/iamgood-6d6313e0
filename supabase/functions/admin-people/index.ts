import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-step-up",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYNTHETIC_DOMAIN = "admin.checkin.local";
const PLANS = new Set(["basic", "premium", "premium-plus"]);
const CYCLES = new Set(["monthly", "yearly"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const getIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    // Step-up 2FA check
    const stepUpToken = req.headers.get("x-admin-step-up") || "";
    if (!stepUpToken) return json({ error: "Step-up required" }, 403);
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stepUpToken));
    const tokenHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: stepRow } = await adminClient
      .from("admin_step_up_tokens")
      .select("id")
      .eq("token_hash", tokenHash)
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!stepRow) return json({ error: "Invalid or expired step-up token" }, 403);

    const ip = getIp(req);
    const ua = req.headers.get("user-agent") || "";
    const audit = (actionName: string, metadata: Record<string, unknown> = {}) =>
      adminClient.from("admin_audit_log").insert({
        user_id: user.id,
        action: actionName,
        ip,
        user_agent: ua,
        metadata,
      });

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const { action: _omit, ...payload } = body ?? {};

    switch (action) {
      case "list": {
        const [profilesRes, rolesRes, subsRes, linksRes] = await Promise.all([
          adminClient
            .from("profiles")
            .select("id, full_name, phone, created_at, last_active_at, blocked_at, blocked_reason")
            .order("created_at", { ascending: false }),
          adminClient.from("user_roles").select("user_id, role"),
          adminClient
            .from("subscriptions")
            .select("user_id, plan_type, status, starts_at, expires_at, billing_cycle, is_trial, amount_paise")
            .order("created_at", { ascending: false }),
          adminClient
            .from("guardians")
            .select("id, user_id, guardian_user_id, guardian_name, guardian_phone, guardian_email, relation, status, is_primary"),
        ]);
        if (profilesRes.error) throw profilesRes.error;

        // Auth-side metadata (email, last sign-in, ban state) via the admin API.
        const authMap = new Map<string, Record<string, unknown>>();
        for (let page = 1; page <= 20; page++) {
          const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
          if (error) break;
          const users = data?.users ?? [];
          for (const u of users) authMap.set(u.id, u as unknown as Record<string, unknown>);
          if (users.length < 200) break;
        }

        const rolesByUser = new Map<string, string[]>();
        for (const r of rolesRes.data ?? []) {
          const list = rolesByUser.get(r.user_id) ?? [];
          list.push(r.role);
          rolesByUser.set(r.user_id, list);
        }
        const subsByUser = new Map<string, Record<string, unknown>[]>();
        for (const s of subsRes.data ?? []) {
          const list = subsByUser.get(s.user_id) ?? [];
          list.push(s as unknown as Record<string, unknown>);
          subsByUser.set(s.user_id, list);
        }
        const links = linksRes.data ?? [];

        const now = Date.now();
        const people = (profilesRes.data ?? []).map((p) => {
          const roleList = rolesByUser.get(p.id) ?? [];
          const role = roleList.includes("admin")
            ? "admin"
            : roleList.includes("guardian")
              ? "guardian"
              : roleList.includes("user")
                ? "user"
                : (roleList[0] ?? "unknown");

          const activeSub = (subsByUser.get(p.id) ?? []).find(
            (s) =>
              s.status === "active" &&
              s.plan_type !== "vitals-storage" &&
              new Date(String(s.expires_at)).getTime() > now
          );

          const a = authMap.get(p.id);
          return {
            ...p,
            role,
            roles: roleList,
            email: (a?.email as string) ?? null,
            last_sign_in_at: (a?.last_sign_in_at as string) ?? null,
            banned_until: (a?.banned_until as string) ?? null,
            plan: (activeSub?.plan_type as string) ?? null,
            plan_expires_at: (activeSub?.expires_at as string) ?? null,
            plan_status: (activeSub?.status as string) ?? null,
            billing_cycle: (activeSub?.billing_cycle as string) ?? null,
            amount_paise: (activeSub?.amount_paise as number) ?? 0,
            is_trial: Boolean(activeSub?.is_trial),
            guardians: links.filter((l) => l.user_id === p.id),
            wards: links.filter((l) => l.guardian_user_id === p.id),
            ward_count: links.filter((l) => l.user_id === p.id).length,
            guardian_count: links.filter((l) => l.guardian_user_id === p.id).length,
            history: (subsByUser.get(p.id) ?? []).filter((s) => s.plan_type !== "vitals-storage"),
          };
        });

        // Accounts that exist in auth but have no profile row.
        const profileIds = new Set((profilesRes.data ?? []).map((p) => p.id));
        const orphans: Record<string, unknown>[] = [];
        for (const [id, a] of authMap) {
          if (profileIds.has(id)) continue;
          orphans.push({
            id,
            full_name: ((a.user_metadata as Record<string, unknown>)?.full_name as string) ?? null,
            phone: (a.phone as string) ?? null,
            created_at: (a.created_at as string) ?? null,
            last_active_at: null,
            last_sign_in_at: (a.last_sign_in_at as string) ?? null,
            blocked_at: null,
            blocked_reason: null,
            role: "unknown",
            roles: [],
            email: (a.email as string) ?? null,
            banned_until: (a.banned_until as string) ?? null,
            plan: null,
            plan_expires_at: null,
            is_trial: false,
            guardians: [],
            wards: [],
            ward_count: 0,
            guardian_count: 0,
            history: [],
            missing_profile: true,
          });
        }

        return json({ people, orphans });
      }

      case "block": {
        if (!isUuid(payload.user_id)) return json({ error: "user_id required" }, 400);
        const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 200) : "Blocked by administrator";

        const { data: targetRoles } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", payload.user_id);
        if ((targetRoles ?? []).some((r) => r.role === "admin")) {
          return json({ error: "Admin accounts can't be blocked from here." }, 403);
        }

        const { data: updated, error } = await adminClient
          .from("profiles")
          .update({ blocked_at: new Date().toISOString(), blocked_reason: reason })
          .eq("id", payload.user_id)
          .select("id, blocked_at, blocked_reason")
          .maybeSingle();
        if (error) throw error;
        if (!updated) return json({ error: "Account not found" }, 404);

        await adminClient.auth.admin
          .updateUserById(payload.user_id, { ban_duration: "3650d" })
          .catch(() => undefined);

        await audit("admin_people_block", { target_user_id: payload.user_id, reason });
        return json({ success: true, blocked_at: updated.blocked_at });
      }

      case "unblock": {
        if (!isUuid(payload.user_id)) return json({ error: "user_id required" }, 400);
        const { data: updated, error } = await adminClient
          .from("profiles")
          .update({ blocked_at: null, blocked_reason: null })
          .eq("id", payload.user_id)
          .select("id, blocked_at")
          .maybeSingle();
        if (error) throw error;
        if (!updated) return json({ error: "Account not found" }, 404);

        await adminClient.auth.admin
          .updateUserById(payload.user_id, { ban_duration: "" })
          .catch(() => undefined);

        await audit("admin_people_unblock", { target_user_id: payload.user_id });
        return json({ success: true });
      }

      case "set_plan": {
        const { user_id, plan_type, billing_cycle, expires_at, starts_at } = payload;
        if (!isUuid(user_id)) return json({ error: "user_id required" }, 400);
        if (!PLANS.has(plan_type)) return json({ error: "Choose a plan" }, 400);
        if (!CYCLES.has(billing_cycle)) return json({ error: "Choose monthly or yearly" }, 400);
        const expiresMs = Date.parse(String(expires_at));
        if (Number.isNaN(expiresMs)) return json({ error: "Choose an expiry date" }, 400);
        if (expiresMs <= Date.now()) return json({ error: "Expiry date must be in the future" }, 400);
        const startsMs = starts_at ? Date.parse(String(starts_at)) : Date.now();
        if (Number.isNaN(startsMs)) return json({ error: "Check the start date" }, 400);
        const amount = Number.isFinite(Number(payload.amount_paise))
          ? Math.max(0, Math.round(Number(payload.amount_paise)))
          : 0;

        await adminClient
          .from("subscriptions")
          .update({ status: "expired" })
          .eq("user_id", user_id)
          .eq("status", "active")
          .neq("plan_type", "vitals-storage");

        const { data: created, error } = await adminClient
          .from("subscriptions")
          .insert({
            user_id,
            plan_type,
            billing_cycle,
            status: "active",
            starts_at: new Date(startsMs).toISOString(),
            expires_at: new Date(expiresMs).toISOString(),
            amount_paise: amount,
            is_trial: false,
          })
          .select("id, plan_type, expires_at")
          .single();
        if (error) throw error;

        await audit("admin_people_set_plan", {
          target_user_id: user_id,
          plan_type,
          billing_cycle,
          expires_at: new Date(expiresMs).toISOString(),
          amount_paise: amount,
        });
        return json({ success: true, subscription: created });
      }

      case "unlink_guardian": {
        if (!isUuid(payload.link_id)) return json({ error: "link_id required" }, 400);
        const { data: link } = await adminClient
          .from("guardians")
          .select("id, user_id, guardian_user_id, guardian_name, status")
          .eq("id", payload.link_id)
          .maybeSingle();
        if (!link) return json({ error: "That link no longer exists" }, 404);
        if (link.status === "revoked") return json({ error: "Already removed" }, 400);

        const { error } = await adminClient
          .from("guardians")
          .update({ status: "revoked" })
          .eq("id", payload.link_id);
        if (error) throw error;

        await audit("admin_people_unlink_guardian", {
          link_id: payload.link_id,
          ward_user_id: link.user_id,
          guardian_user_id: link.guardian_user_id,
          guardian_name: link.guardian_name,
        });
        return json({ success: true });
      }

      case "send_reset_link": {
        if (!isUuid(payload.user_id)) return json({ error: "user_id required" }, 400);
        const { data: userData, error: userGetErr } = await adminClient.auth.admin.getUserById(payload.user_id);
        if (userGetErr || !userData.user) return json({ error: "Account not found" }, 404);

        const email = userData.user.email;
        if (!email) {
          return json({ error: "This account has no email address — it signs in with a code by phone." }, 400);
        }
        if (email.toLowerCase().endsWith(`@${SYNTHETIC_DOMAIN}`)) {
          return json({ error: "This account uses a placeholder email, so there is nowhere to send a link." }, 400);
        }

        const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
        });
        const resetUrl = linkData?.properties?.action_link;
        if (linkErr || !resetUrl) {
          return json({ error: linkErr?.message || "Could not create the link" }, 500);
        }

        const { error: sendErr } = await adminClient.functions.invoke("send-transactional-email", {
          body: {
            templateName: "password-reset",
            recipientEmail: email,
            idempotencyKey: `pw-reset-${payload.user_id}-${Date.now()}`,
            templateData: {
              name: userData.user.user_metadata?.full_name ?? undefined,
              resetUrl,
            },
          },
        });
        if (sendErr) throw sendErr;

        await audit("admin_people_send_reset_link", { target_user_id: payload.user_id, email });
        return json({ success: true });
      }

      case "delete_account": {
        if (!isUuid(payload.user_id)) return json({ error: "user_id required" }, 400);
        const typed = String(payload.confirm_name ?? "");

        const { data: prof } = await adminClient
          .from("profiles")
          .select("id, full_name")
          .eq("id", payload.user_id)
          .maybeSingle();
        if (!prof) return json({ error: "Account not found" }, 404);

        const expected = (prof.full_name ?? "").trim().toLowerCase();
        if (!typed.trim().toLowerCase() || typed.trim().toLowerCase() !== expected) {
          return json({ error: "The typed name doesn't match the account name." }, 400);
        }

        const { data: targetRoles } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", payload.user_id);
        if ((targetRoles ?? []).some((r) => r.role === "admin")) {
          return json({ error: "Admin accounts can't be deleted from here." }, 403);
        }

        await audit("admin_people_delete", {
          target_user_id: payload.user_id,
          target_name: prof.full_name,
          data_cascaded: true,
        });

        const { error } = await adminClient.auth.admin.deleteUser(payload.user_id);
        if (error) throw error;

        return json({ success: true });
      }

      default:
        return json({ error: "Invalid action" }, 400);
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
