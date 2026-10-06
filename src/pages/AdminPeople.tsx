import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Ban,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Unlink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AdminLayout from "@/components/AdminLayout";
import {
  PLAN_LABELS,
  PLAN_OPTIONS,
  ROLE_OPTIONS,
  filterPeople,
  matchesNameConfirmation,
  planLabel,
  type Person,
} from "@/lib/adminPeople";

interface LinkRow {
  id: string;
  user_id: string;
  guardian_user_id: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  relation: string | null;
  status: string;
  is_primary: boolean;
}

interface SubRow {
  plan_type: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  billing_cycle: string | null;
  amount_paise: number | null;
  is_trial: boolean | null;
}

interface PersonRow extends Person {
  guardians: LinkRow[];
  wards: LinkRow[];
  history: SubRow[];
  banned_until: string | null;
  missing_profile?: boolean;
}

const fmt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd MMM yyyy");
};

const AdminPeople = () => {
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [plan, setPlan] = useState("all");
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [unlinkId, setUnlinkId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [planType, setPlanType] = useState("basic");
  const [cycle, setCycle] = useState("monthly");
  const [expiry, setExpiry] = useState("");
  const [amountRupees, setAmountRupees] = useState("0");

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const stepUp = sessionStorage.getItem("admin_step_up_token") || "";
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-people`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "x-admin-step-up": stepUp,
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const parsed = await res.json().catch(() => ({}));
      throw new Error(parsed.error || "Request failed");
    }
    return await res.json();
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await invoke({ action: "list" });
      setPeople([...(data.people ?? []), ...(data.orphans ?? [])] as PersonRow[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(
    () => people.find((p) => p.id === selectedId) ?? null,
    [people, selectedId]
  );

  const filtered = useMemo(
    () =>
      filterPeople(people as Person[], { query, role, plan, inactiveOnly }) as PersonRow[],
    [people, query, role, plan, inactiveOnly]
  );

  const counts = useMemo(() => {
    const by = { user: 0, guardian: 0, admin: 0 } as Record<string, number>;
    for (const p of people) by[p.role] = (by[p.role] ?? 0) + 1;
    return by;
  }, [people]);

  const run = async (body: Record<string, unknown>, successMsg: string, close?: () => void) => {
    setBusy(true);
    try {
      await invoke(body);
      toast.success(successMsg);
      close?.();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const savePlan = () => {
    if (!selected) return;
    if (!expiry) {
      toast.error("Choose an expiry date");
      return;
    }
    const expiresAt = new Date(`${expiry}T23:59:59+05:30`);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      toast.error("Expiry date must be in the future");
      return;
    }
    const rupees = Number(amountRupees);
    run(
      {
        action: "set_plan",
        user_id: selected.id,
        plan_type: planType,
        billing_cycle: cycle,
        expires_at: expiresAt.toISOString(),
        amount_paise: Number.isFinite(rupees) ? Math.round(rupees * 100) : 0,
      },
      `${PLAN_LABELS[planType] ?? planType} set for ${selected.full_name ?? "this account"}`
    );
  };

  const deleteAllowed =
    !!selected && matchesNameConfirmation(deleteName, selected.full_name ?? "");

  return (
    <AdminLayout title="People">
      <div className="p-4 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold">People</h1>
            <p className="text-sm text-muted-foreground">
              {people.length} accounts · {counts.user ?? 0} wards · {counts.guardian ?? 0} guardians · {counts.admin ?? 0} admins
              {people.some((p) => p.blocked_at) && ` · ${people.filter((p) => p.blocked_at).length} blocked`}
            </p>
          </div>
          <Button onClick={load} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone or email"
              className="pl-9"
            />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLAN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={inactiveOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setInactiveOnly((v) => !v)}
          >
            Not active in 30 days
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">No accounts match those filters.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedId(p.id);
                      setDeleteName("");
                      setBlockReason("");
                      setExpiry("");
                      setAmountRupees("0");
                      setPlanType(p.plan && PLAN_LABELS[p.plan] ? p.plan : "basic");
                    }}
                  >
                    <TableCell className="font-medium">
                      {p.full_name || "—"}
                      {p.missing_profile && <Badge variant="outline" className="ml-2">No profile</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{p.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.role === "user" ? "Ward" : p.role === "guardian" ? "Guardian" : p.role}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {planLabel(p)}
                      {p.plan_expires_at && (
                        <span className="text-xs text-muted-foreground"> · to {fmt(p.plan_expires_at)}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {fmt(p.last_active_at ?? p.last_sign_in_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.blocked_at ? (
                        <Badge variant="destructive">Blocked</Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.full_name || "Unnamed account"}</DialogTitle>
                <DialogDescription>
                  {selected.phone || "No phone"} {selected.email ? `· ${selected.email}` : ""}
                </DialogDescription>
              </DialogHeader>

              {selected.blocked_at && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <span className="font-semibold">Blocked from signing in</span>
                  <div className="text-muted-foreground">
                    Since {fmt(selected.blocked_at)}
                    {selected.blocked_reason ? ` — ${selected.blocked_reason}` : ""}
                  </div>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Plan</div>
                  <div className="font-medium">{planLabel(selected)}{selected.plan_expires_at ? ` until ${fmt(selected.plan_expires_at)}` : ""}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Links</div>
                  <div className="font-medium">
                    {selected.role === "guardian"
                      ? `${selected.ward_count} ward${selected.ward_count === 1 ? "" : "s"}`
                      : `${selected.guardian_count} guardian${selected.guardian_count === 1 ? "" : "s"}`}
                  </div>
                </div>
              </div>

              {selected.role !== "guardian" && selected.guardians.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">Guardians</div>
                  <div className="space-y-1">
                    {selected.guardians.map((g) => (
                      <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                        <span>
                          {g.guardian_name || "—"}
                          {g.is_primary && <Badge variant="outline" className="ml-2">Primary</Badge>}
                          <span className="text-muted-foreground"> · {g.guardian_phone || "no phone"}</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={g.status === "revoked" || busy}
                          onClick={() => setUnlinkId(g.id)}
                        >
                          <Unlink className="w-4 h-4 mr-1" />
                          {g.status === "revoked" ? "Removed" : "Remove"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.role === "guardian" && selected.wards.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">Wards</div>
                  <div className="space-y-1">
                    {selected.wards.map((w) => (
                      <div key={w.id} className="rounded-md border p-2 text-sm">
                        {w.guardian_name || "—"} · {w.guardian_phone || "no phone"}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.history.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-1">Plan history</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Until</TableHead>
                        <TableHead className="text-right">Charged</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.history.map((h, i) => (
                        <TableRow key={i}>
                          <TableCell>{PLAN_LABELS[h.plan_type] ?? h.plan_type}</TableCell>
                          <TableCell>{h.status}</TableCell>
                          <TableCell>{fmt(h.expires_at)}</TableCell>
                          <TableCell className="text-right">
                            {h.amount_paise ? `₹${(h.amount_paise / 100).toFixed(0)}` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm font-semibold">Change plan</div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Plan</Label>
                    <Select value={planType} onValueChange={setPlanType}>
                      <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="premium">Pro</SelectItem>
                        <SelectItem value="premium-plus">Premium Plus</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Billing</Label>
                    <Select value={cycle} onValueChange={setCycle}>
                      <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Expires on</Label>
                    <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-[160px]" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={amountRupees}
                      onChange={(e) => setAmountRupees(e.target.value)}
                      className="w-[110px]"
                    />
                  </div>
                  <Button size="sm" onClick={savePlan} disabled={busy || !expiry}>Save plan</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Set the amount to 0 for a complimentary plan. The person sees the new plan the next time they open the app.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selected.blocked_at ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run({ action: "unblock", user_id: selected.id }, "Access restored", () => setSelectedId(null))}
                  >
                    <ShieldCheck className="w-4 h-4 mr-1" /> Restore access
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setBlockOpen(true)}>
                    <Ban className="w-4 h-4 mr-1" /> Block sign-in
                  </Button>
                )}

                {selected.email && !selected.email.toLowerCase().endsWith("@admin.checkin.local") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run({ action: "send_reset_link", user_id: selected.id }, "Sign-in link sent")}
                  >
                    <KeyRound className="w-4 h-4 mr-1" /> Send sign-in link
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy || !!selected.blocked_at}
                  onClick={() => { setDeleteName(""); setDeleteOpen(true); }}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Delete permanently
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {selected?.full_name || "this account"} from signing in?</AlertDialogTitle>
            <AlertDialogDescription>
              They will not be able to start a new sign-in. Their health records, vault documents and history stay
              untouched, and you can restore access at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Reason (kept in the audit log)</Label>
            <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="e.g. requested by the family" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (!selected) return;
                run(
                  { action: "block", user_id: selected.id, reason: blockReason.trim() || undefined },
                  "Account blocked",
                  () => { setBlockOpen(false); setSelectedId(null); }
                );
              }}
            >
              Block sign-in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unlinkId} onOpenChange={(o) => !o && setUnlinkId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this guardian?</AlertDialogTitle>
            <AlertDialogDescription>
              The guardian keeps their own account and data, but loses access to this ward. The ward can invite them
              again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (!unlinkId) return;
                run({ action: "unlink_guardian", link_id: unlinkId }, "Guardian removed", () => setUnlinkId(null));
              }}
            >
              Remove guardian
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected?.full_name || "this account"} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases the account and every record attached to it — check-ins, medications, vault documents, SOS
              history. It cannot be undone. Type the person's full name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Full name</Label>
            <Input value={deleteName} onChange={(e) => setDeleteName(e.target.value)} placeholder={selected?.full_name ?? ""} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !deleteAllowed}
              onClick={(e) => {
                e.preventDefault();
                if (!selected) return;
                run(
                  { action: "delete_account", user_id: selected.id, confirm_name: deleteName },
                  "Account deleted",
                  () => { setDeleteOpen(false); setSelectedId(null); }
                );
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminPeople;
