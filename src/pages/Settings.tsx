import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import {
  Settings as SettingsIcon, Bell, BellRing, Volume2, MessageSquare, Vibrate,
  Clock, Moon, Star, AlertTriangle, CalendarClock, Users, Globe, Lock, Shield,
  Plus, Trash2, Phone, Mail, CheckCircle, XCircle, HelpCircle, Loader2, Dumbbell, ShieldCheck, Heart
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import SafeZoneEditor from "@/components/SafeZoneEditor";
import ModeSelector from "@/components/ModeSelector";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PRIVACY_POLICY_PDF_URL } from "@/lib/legal";
import { useNavigate } from "react-router-dom";
import PhoneInput from "@/components/PhoneInput";
import usePushSubscription from "@/hooks/usePushSubscription";
import { formatDistanceToNow } from "date-fns";
import { formatISTDateTime } from "@/lib/istTime";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserSettings } from "@/hooks/useUserSettings";
import VaultNomineeRecoveryDialog from "@/components/vault/VaultNomineeRecoveryDialog";
import { getGuardianLimit } from "@/lib/featureGating";
import { requestMotionPermission } from "@/hooks/useFallDetection";
import { addGuardianWithInvite, resendGuardianInvite, setPrimaryGuardian } from "@/lib/guardianInvite";


type SettingsTab = "alerts" | "checkin" | "appts" | "guardians" | "safety" | "language" | "access" | "privacy";

interface Guardian {
  id: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string | null;
  relation: string | null;
  is_primary: boolean;
  status: string;
  nominated_at: string;
  is_vault_nominee: boolean;
}

const PRIVACY_ACTIONS = [
  { type: "data_access", icon: "📋", title: "Request My Data", desc: "Get a copy of all personal data we hold about you.", ref: "GDPR Art. 15 / DPDP §11", color: "bg-primary/5 border-primary/20" },
  { type: "correction", icon: "✏️", title: "Correct My Data", desc: "Request correction of inaccurate or incomplete personal data.", ref: "GDPR Art. 16 / DPDP §12", color: "bg-warning/5 border-warning/20" },
  { type: "deletion", icon: "🗑️", title: "Delete My Data", desc: "Request erasure of your personal data ('Right to be Forgotten').", ref: "GDPR Art. 17 / DPDP §13", color: "bg-destructive/5 border-destructive/20" },
  { type: "export", icon: "📦", title: "Export My Data", desc: "Receive your data in a portable, machine-readable format.", ref: "GDPR Art. 20 / DPDP §11", color: "bg-success/5 border-success/20" },
  { type: "objection", icon: "🚫", title: "Object to Processing", desc: "Object to how we process your personal data for specific purposes.", ref: "GDPR Art. 21 / DPDP §14", color: "bg-accent/50 border-accent" },
];

const TYPE_LABELS: Record<string, string> = {
  data_access: "Data Access",
  correction: "Data Correction",
  deletion: "Data Deletion",
  export: "Data Export",
  objection: "Processing Objection",
};

const GuardianChecklist = ({
  guardians,
  selectedIds,
  settingKey,
  updateSetting,
}: {
  guardians: Guardian[];
  selectedIds: string[];
  settingKey: "locationSharingGuardianIds" | "liveLocationGuardianIds";
  updateSetting: (key: any, value: any) => void;
}) => {
  // If empty (first time), auto-populate with all guardian IDs (primary first)
  const effectiveIds = selectedIds.length > 0
    ? selectedIds
    : guardians.map((g) => g.id);

  const toggle = (guardianId: string) => {
    const current = effectiveIds;
    const next = current.includes(guardianId)
      ? current.filter((id) => id !== guardianId)
      : [...current, guardianId];
    updateSetting(settingKey, next);
  };

  return (
    <div className="pl-4 pb-2 space-y-1.5">
      <p className="text-xs text-muted-foreground font-medium">Select guardians:</p>
      {guardians.map((g) => (
        <label key={g.id} className="flex items-center gap-2 cursor-pointer py-1">
          <Checkbox
            checked={effectiveIds.includes(g.id)}
            onCheckedChange={() => toggle(g.id)}
          />
          <span className="text-sm">{g.guardian_name}</span>
          {g.is_primary && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Primary</Badge>
          )}
        </label>
      ))}
    </div>
  );
};

const PrivacyTab = ({ session, navigate, guardians: allGuardians }: { session: any; navigate: any; guardians: Guardian[] }) => {
  const queryClient = useQueryClient();
  const { settings, updateSetting, updateSettings } = useUserSettings();

  const acceptedGuardians = useMemo(() => allGuardians.filter(g => g.status === "accepted"), [allGuardians]);
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["privacy_requests", session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("privacy_requests" as any)
        .select("*")
        .eq("user_id", session!.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!session?.user?.id,
  });

  const mutation = useMutation({
    mutationFn: async ({ request_type, legal_basis }: { request_type: string; legal_basis: string }) => {
      const { error } = await supabase
        .from("privacy_requests" as any)
        .insert({ user_id: session!.user.id, request_type, legal_basis } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privacy_requests"] });
      toast.success("Privacy request submitted. We'll process it within 30 days.");
    },
    onError: () => toast.error("Failed to submit request. Please try again."),
  });

  const handleTogglePublicProfile = async (enabled: boolean) => {
    updateSetting("publicEmergencyProfile", enabled);
    if (enabled) {
      // Create or activate token
      const { data: existing } = await supabase
        .from("emergency_share_tokens" as any)
        .select("id")
        .eq("user_id", session!.user.id)
        .maybeSingle();
      if (existing) {
        await supabase.from("emergency_share_tokens" as any).update({ is_active: true, updated_at: new Date().toISOString() } as any).eq("user_id", session!.user.id);
      } else {
        await supabase.from("emergency_share_tokens" as any).insert({ user_id: session!.user.id, is_active: true } as any);
      }
      toast.success("Public emergency profile enabled");
    } else {
      await supabase.from("emergency_share_tokens" as any).update({ is_active: false, updated_at: new Date().toISOString() } as any).eq("user_id", session!.user.id);
      toast.success("Public emergency profile disabled");
    }
    refetchToken();
  };

  const handleRegenerateToken = async () => {
    // Delete old and create new
    await supabase.from("emergency_share_tokens" as any).delete().eq("user_id", session!.user.id);
    await supabase.from("emergency_share_tokens" as any).insert({ user_id: session!.user.id, is_active: true } as any);
    toast.success("Emergency profile link regenerated");
    updateSetting("publicEmergencyProfile", true);
    refetchToken();
  };

  const { data: shareToken, refetch: refetchToken } = useQuery({
    queryKey: ["emergency_token", session?.user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("emergency_share_tokens" as any)
        .select("token, is_active")
        .eq("user_id", session!.user.id)
        .maybeSingle();
      if (!data) return null;
      return data as unknown as { token: string; is_active: boolean };
    },
    enabled: !!session?.user?.id,
  });

  const publicUrl = shareToken?.token ? `${window.location.origin}/e/${shareToken.token}` : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Privacy & Security
          </CardTitle>
          <p className="text-xs text-muted-foreground">Manage your privacy and data settings</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Share Location with Guardians</p>
              <p className="text-xs text-muted-foreground">Include your location in SOS alerts</p>
            </div>
            <Switch checked={settings.shareLocation} onCheckedChange={(v) => updateSetting("shareLocation", v)} />
          </div>
          {settings.shareLocation && acceptedGuardians.length > 0 && (
            <GuardianChecklist
              guardians={acceptedGuardians}
              selectedIds={settings.locationSharingGuardianIds}
              settingKey="locationSharingGuardianIds"
              updateSetting={updateSetting}
            />
          )}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Live Location for Guardians</p>
              <p className="text-xs text-muted-foreground">Allow guardians to see your location anytime (always shared during SOS/Fall)</p>
            </div>
            <Switch checked={(settings as any).shareLocationWithGuardian !== false} onCheckedChange={(v) => updateSetting("shareLocationWithGuardian" as any, v)} />
          </div>
          {(settings as any).shareLocationWithGuardian !== false && acceptedGuardians.length > 0 && (
            <GuardianChecklist
              guardians={acceptedGuardians}
              selectedIds={settings.liveLocationGuardianIds}
              settingKey="liveLocationGuardianIds"
              updateSetting={updateSetting}
            />
          )}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Share Health Data</p>
              <p className="text-xs text-muted-foreground">Include blood type and allergies in SOS alerts</p>
            </div>
            <Switch checked={settings.shareHealthData} onCheckedChange={(v) => updateSetting("shareHealthData", v)} />
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Share Emergency Health Card with Guardians</p>
              <p className="text-xs text-muted-foreground">Allow guardians to view your Emergency Health Card on their dashboard</p>
            </div>
            <Switch checked={settings.shareEmergencyWithGuardians} onCheckedChange={(v) => updateSetting("shareEmergencyWithGuardians", v)} />
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Public Emergency Profile (QR Code)</p>
              <p className="text-xs text-muted-foreground">Allow first responders to access critical health info via QR scan — no login required</p>
            </div>
            <Switch checked={settings.publicEmergencyProfile} onCheckedChange={handleTogglePublicProfile} />
          </div>
          {settings.publicEmergencyProfile && publicUrl && (
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="text-xs text-muted-foreground">Your public emergency profile link:</p>
              <p className="text-xs font-mono break-all text-primary">{publicUrl}</p>
              <Button variant="outline" size="sm" onClick={handleRegenerateToken}>
                🔄 Regenerate Link
              </Button>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" asChild>
              <a href={PRIVACY_POLICY_PDF_URL} target="_blank" rel="noopener noreferrer">View Privacy Policy</a>
            </Button>
            <Button variant="outline" size="sm">Manage Cookie Preferences</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Data & Privacy Controls
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Exercise your rights under GDPR (EU) and India's DPDP Act 2023. All requests are processed within 30 days.
          </p>
          <a href={PRIVACY_POLICY_PDF_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
            View your rights in our Privacy Policy ↗
          </a>
        </CardHeader>
        <CardContent className="space-y-3">
          {PRIVACY_ACTIONS.map((item) => (
            <div key={item.type} className={`flex items-center justify-between p-3 rounded-lg border ${item.color}`}>
              <div className="flex-1">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <span>{item.icon}</span> {item.title}
                </p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.ref}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 ml-3"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ request_type: item.type, legal_basis: item.ref })}
              >
                {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Request"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Your Request History</CardTitle>
          <p className="text-xs text-muted-foreground">Track the status of your privacy requests</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No privacy requests yet.</p>
          ) : (
            requests.map((r: any) => (
              <div key={r.id} className="p-3 rounded-lg bg-muted/50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{TYPE_LABELS[r.request_type] || r.request_type}</p>
                  <p className="text-xs text-muted-foreground">{formatISTDateTime(r.created_at)}</p>
                </div>
                {r.status === "completed" ? (
                  <Badge variant="outline" className="text-xs gap-1 text-success border-success/30">
                    <CheckCircle className="w-3 h-3" /> Completed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs gap-1 text-warning border-warning/30">
                    <HelpCircle className="w-3 h-3" /> Pending
                  </Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Settings = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("alerts");
  const navigate = useNavigate();
  const { session } = useAuth();

  const { settings, updateSetting } = useUserSettings();

  // Active-mode check-in hour helpers
  const formatCheckInHour = (h: number) =>
    h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;

  const saveCheckInHours = (hours: number[]) => {
    const clean = [...new Set(hours.filter((h) => Number.isFinite(h) && h >= 0 && h <= 23))].sort((a, b) => a - b);
    if (clean.length === 0) return;
    // Write both fields in a single patch so they can never diverge
    updateSettings({
      activeCheckInHours: clean,
      checkInTimes: clean.map((h) => `${String(h).padStart(2, "0")}:00`),
    });
  };

  // Guardians state
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRelation, setNewRelation] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const { isSubscribed, supported } = usePushSubscription();

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "alerts", label: "Alerts" },
    { id: "checkin", label: "Check-In" },
    { id: "appts", label: "Appts" },
    { id: "guardians", label: "Guardians" },
    { id: "safety", label: "Safety" },
    { id: "language", label: "Language" },
    { id: "access", label: "Access" },
    { id: "privacy", label: "Privacy" },
  ];

  // Fetch guardians
  useEffect(() => {
    if (!session?.user?.id) return;
    const fetchGuardians = async () => {
      const { data } = await supabase
        .from("guardians")
        .select("id, guardian_name, guardian_phone, guardian_email, relation, is_primary, status, nominated_at, is_vault_nominee, nomination_expires_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });
      if (data) setGuardians(data as unknown as Guardian[]);
    };
    fetchGuardians();
  }, [session?.user?.id, activeTab]);

  const addGuardian = async () => {
    if (!session?.user?.id || !newName || !newPhone) {
      toast.error("Name and phone are required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      toast.error("A valid email is required", {
        description: "It's the backup way to reach your guardian if WhatsApp doesn't go through.",
      });
      return;
    }
    // Dynamic guardian limit based on plan — check subscription table directly
    const { data: subData } = await supabase
      .from("subscriptions")
      .select("plan_type, status")
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const currentPlan = subData?.plan_type || "free";
    const limit = getGuardianLimit(currentPlan);
    if (guardians.length >= limit) {
      toast.error(`Your plan allows ${limit} guardian(s). Upgrade for more.`);
      return;
    }
    // Check if this guardian already monitors 3 users (by phone and email)
    const cleanGPhone = newPhone.replace(/[\s\-\+]/g, "");
    const { data: phoneCount } = await supabase.rpc("guardian_ward_count_by_phone" as any, { _phone: cleanGPhone });
    if (typeof phoneCount === "number" && phoneCount >= 3) {
      toast.error(`${newName} already monitors 3 users (maximum). They cannot be added as your guardian.`);
      return;
    }
    if (newEmail) {
      const { data: countResult } = await supabase.rpc("guardian_ward_count", { _guardian_email: newEmail });
      if (typeof countResult === "number" && countResult >= 3) {
        toast.error(`${newName} already monitors 3 users (maximum). They cannot be added as your guardian.`);
        return;
      }
    }
    const { error } = await addGuardianWithInvite({
      userId: session.user.id,
      guardianName: newName,
      guardianPhone: newPhone,
      guardianEmail: newEmail || null,
      relation: newRelation || null,
      isPrimary: guardians.length === 0,
      userName: session.user.email || "Your ward",
    });
    if (error) {
      toast.error("Failed to add guardian");
    } else {
      toast.success(`${newName} added as Guardian (pending — awaiting acceptance)`);
      setNewName(""); setNewPhone(""); setNewEmail(""); setNewRelation("");
      setShowAddForm(false);
      // Refresh
      const { data: refreshed } = await supabase.from("guardians").select("*").eq("user_id", session.user.id).order("created_at");
      if (refreshed) setGuardians(refreshed as unknown as Guardian[]);
    }
  };


  const removeGuardian = async (id: string) => {
    const { error } = await supabase.from("guardians").delete().eq("id", id);
    if (!error) {
      setGuardians(guardians.filter((g) => g.id !== id));
      toast.success("Guardian removed");
    }
  };

  const [recoveryDialog, setRecoveryDialog] = useState<{ open: boolean; guardianId: string }>({ open: false, guardianId: "" });

  const toggleVaultNominee = async (id: string, current: boolean) => {
    const { error } = await supabase.from("guardians").update({ is_vault_nominee: !current } as any).eq("id", id);
    if (!error) {
      setGuardians(guardians.map((g) => g.id === id ? { ...g, is_vault_nominee: !current } : g));
      // When enabling, open the PIN escrow recovery wizard
      if (!current && session?.user?.id) {
        setRecoveryDialog({ open: true, guardianId: id });
      }
    }
  };

  const getStatusBadge = (g: Guardian) => {
    if (g.status === "rejected") {
      return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
    }
    if (g.status === "expired") {
      return <Badge variant="outline" className="text-xs gap-1 border-warning text-warning"><Clock className="w-3 h-3" /> Expired</Badge>;
    }
    if (g.status === "pending") {
      const nominated = new Date(g.nominated_at);
      const expiresAt = new Date(nominated.getTime() + 72 * 60 * 60 * 1000);
      const hoursLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)));
      return <Badge className="bg-warning text-warning-foreground text-xs gap-1"><Clock className="w-3 h-3" /> Pending ({hoursLeft}h left)</Badge>;
    }
    return <Badge className="bg-success text-success-foreground text-xs gap-1"><CheckCircle className="w-3 h-3" /> Accepted</Badge>;
  };

  return (
    <AppLayout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" />
            Settings
          </h1>
          <button onClick={() => navigate("/help")} className="text-sm text-primary hover:underline">
            Help
          </button>
        </div>

        {/* Tab grid - 2 rows */}
        <nav className="grid grid-cols-4 gap-1 bg-muted rounded-lg p-1">
          {tabs.slice(0, 4).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-2 rounded-md text-sm font-medium transition-colors text-center ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
          {tabs.slice(4).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-2 rounded-md text-sm font-medium transition-colors text-center ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ============ ALERTS TAB ============ */}
        {activeTab === "alerts" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Notification Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {supported && isSubscribed && (
                  <div className="p-3 rounded-lg bg-success/10 mb-3 space-y-1">
                    <p className="text-sm font-medium text-success flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" /> Notifications Ready
                    </p>
                    <p className="text-xs text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Permission: granted</p>
                    <p className="text-xs text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Service Worker: Active</p>
                  </div>
                )}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Audio Alerts</p>
                      <p className="text-xs text-muted-foreground">Play a chime when check-in is due</p>
                    </div>
                  </div>
                  <Switch checked={settings.audioAlerts} onCheckedChange={(v) => updateSetting("audioAlerts", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Wellness Voice Reminders</p>
                      <p className="text-xs text-muted-foreground">Spoken nudges when health tasks are incomplete</p>
                    </div>
                  </div>
                  <Switch checked={settings.voiceReminders} onCheckedChange={(v) => updateSetting("voiceReminders", v)} />
                </div>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Vibrate className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Vibration & Notifications</p>
                      <p className="text-xs text-muted-foreground">Always enabled for check-in reminders</p>
                    </div>
                  </div>
                  <Switch checked={settings.vibration} onCheckedChange={(v) => updateSetting("vibration", v)} />
                </div>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Dumbbell className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Exercise Reminders</p>
                      <p className="text-xs text-muted-foreground">Audio reminders at 8 AM and 6 PM for exercise</p>
                    </div>
                  </div>
                  <Switch checked={settings.exerciseReminder} onCheckedChange={(v) => updateSetting("exerciseReminder", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Guardian Voice Alerts</p>
                      <p className="text-xs text-muted-foreground">Spoken alert when SOS or Fall events are detected</p>
                    </div>
                  </div>
                  <Switch checked={settings.guardianVoiceAlerts} onCheckedChange={(v) => updateSetting("guardianVoiceAlerts", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    <div>
                      <p className="text-sm font-medium">Persistent Missed Check-iN Alarm</p>
                      <p className="text-xs text-muted-foreground">Loud repeating alarm (even on silent) when your ward misses a check-iN past the hour. Tap Dismiss to stop.</p>
                    </div>
                  </div>
                  <Switch checked={settings.guardianPersistentMissedAlarm} onCheckedChange={(v) => updateSetting("guardianPersistentMissedAlarm", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Ward Appointment Alarms</p>
                      <p className="text-xs text-muted-foreground">Loud audio popup at each appointment's alert time for every ward you guard.</p>
                    </div>
                  </div>
                  <Switch checked={settings.guardianAppointmentAlarms} onCheckedChange={(v) => updateSetting("guardianAppointmentAlarms", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    <div>
                      <p className="text-sm font-medium">Safe-Zone Drift Popups (&gt;1 km)</p>
                      <p className="text-xs text-muted-foreground">Pop-up alert when your ward moves more than 1 km beyond a safe zone, and again when they return.</p>
                    </div>
                  </div>
                  <Switch checked={settings.guardianSafeZoneAlerts} onCheckedChange={(v) => updateSetting("guardianSafeZoneAlerts", v)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-primary" />
                  Push Notifications
                </CardTitle>
                <p className="text-xs text-primary">Configure how you receive push notifications</p>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">Check-In Reminders</p>
                    <p className="text-xs text-muted-foreground">Get reminded when it's time to check in</p>
                  </div>
                  <Switch checked={settings.checkInPush} onCheckedChange={(v) => updateSetting("checkInPush", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">Medication Reminders</p>
                    <p className="text-xs text-muted-foreground">Get notified when medications are due</p>
                  </div>
                  <Switch checked={settings.medPush} onCheckedChange={(v) => updateSetting("medPush", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">Guardian Updates</p>
                    <p className="text-xs text-muted-foreground">Receive updates when guardians respond</p>
                  </div>
                  <Switch checked={settings.guardianPush} onCheckedChange={(v) => updateSetting("guardianPush", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">Medication Missed Alerts</p>
                    <p className="text-xs text-muted-foreground">Get notified when your ward misses a medication dose</p>
                  </div>
                  <Switch checked={settings.medicationMissedNotify} onCheckedChange={(v) => updateSetting("medicationMissedNotify", v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">Hydration Reminders</p>
                    <p className="text-xs text-muted-foreground">Gentle nudges when it's hot & humid outside</p>
                  </div>
                  <Switch checked={settings.hydrationNudges} onCheckedChange={(v) => updateSetting("hydrationNudges", v)} />
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">Hydration Advisory to Guardian</p>
                    <p className="text-xs text-muted-foreground">Notify primary guardian on extreme heat & humidity days</p>
                  </div>
                  <Switch checked={settings.hydrationAdvisoryToGuardian} onCheckedChange={(v) => updateSetting("hydrationAdvisoryToGuardian", v)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  Weekly Email Report
                </CardTitle>
                <p className="text-xs text-muted-foreground">Receive a consolidated weekly health summary via email every Sunday at 9 AM</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Enable Weekly Report</p>
                    <p className="text-xs text-muted-foreground">Sends check-in, medication, wellness & activity data to you and your guardians</p>
                  </div>
                  <Switch checked={settings.weeklyReport} onCheckedChange={(v) => updateSetting("weeklyReport", v)} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ CHECK-IN TAB ============ */}
        {activeTab === "checkin" && (
          <div className="space-y-4">
            <ModeSelector />
            {/* Sleep Mode / Check-Out pills */}
            <div className="flex gap-2">
              <Badge
                variant={settings.sleepMode ? "default" : "outline"}
                className="cursor-pointer gap-1.5 px-3 py-1.5"
                onClick={() => updateSetting("sleepMode", true)}
              >
                <Moon className="w-3.5 h-3.5" /> Sleep Mode {settings.sleepMode && <span className="text-xs">(Active)</span>}
              </Badge>
              <Badge
                variant={!settings.sleepMode ? "default" : "outline"}
                className="cursor-pointer gap-1.5 px-3 py-1.5"
                onClick={() => updateSetting("sleepMode", false)}
              >
                <Star className="w-3.5 h-3.5" /> Check-Out
              </Badge>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  Active Check-in Times
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Set the times you want to check-in each day when in Active mode. Minimum 1, maximum 6 times per day.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {(settings.activeCheckInHours ?? [7, 12, 19]).map((hour: number, idx: number) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-sm font-medium">
                        {formatCheckInHour(hour)}
                      </div>
                      <Select
                        value={String(hour)}
                        onValueChange={(val) => {
                          const newHours = [...(settings.activeCheckInHours ?? [7, 12, 19])];
                          newHours[idx] = Number(val);
                          saveCheckInHours([...new Set(newHours)].sort((a, b) => a - b));
                        }}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, h) => (
                            <SelectItem key={h} value={String(h)}>
                              {formatCheckInHour(h)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(settings.activeCheckInHours ?? [7, 12, 19]).length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 shrink-0"
                          onClick={() =>
                            saveCheckInHours(
                              (settings.activeCheckInHours ?? [7, 12, 19]).filter((_: number, i: number) => i !== idx)
                            )
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {(settings.activeCheckInHours ?? [7, 12, 19]).length < 6 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => {
                      const existing = settings.activeCheckInHours ?? [7, 12, 19];
                      const freeHour = [8, 13, 18, 20, 10, 15].find((h) => !existing.includes(h)) ?? 9;
                      saveCheckInHours([...existing, freeHour].sort((a, b) => a - b));
                    }}
                  >
                    <Plus className="w-4 h-4" /> Add Check-in Time
                  </Button>
                )}

                <p className="text-xs text-muted-foreground">
                  Changes take effect from the next scheduled check-in.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="text-xl">💤</span> Auto-Nap Schedule
                </CardTitle>
                <p className="text-xs text-muted-foreground">Automatically pause check-ins during your daily scheduled nap.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable Daily Nap</p>
                    <p className="text-xs text-muted-foreground">Uses the schedule set in the Dashboard Nap button.</p>
                  </div>
                  <Switch checked={settings.autoNapMode} onCheckedChange={(v) => updateSetting("autoNapMode", v)} />
                </div>
                {settings.napSchedule && (
                  <div className="bg-primary/5 rounded-md p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="text-sm">Scheduled daily from <strong>{settings.napSchedule.from}</strong> to <strong>{settings.napSchedule.to}</strong></span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2">
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear nap schedule
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete nap schedule?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Your daily nap window will be removed and Auto-Nap will be turned off. You can set a new schedule anytime from the Dashboard Nap button.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                              updateSetting("napSchedule", null);
                              updateSetting("autoNapMode", false);
                              toast.success("Nap schedule cleared");
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Inactivity Nudge Interval
                </CardTitle>
                <p className="text-xs text-muted-foreground">Choose how frequently you'd like to receive nudges when no activity is detected.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Nudge Frequency</p>
                    <p className="text-xs text-muted-foreground">Alerts will be sent to your guardians if you remain inactive</p>
                  </div>
                  <Select value={settings.nudgeFrequency} onValueChange={(v) => updateSetting("nudgeFrequency", v)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">Every 2 Hours</SelectItem>
                      <SelectItem value="4">Every 4 Hours (Default)</SelectItem>
                      <SelectItem value="6">Every 6 Hours</SelectItem>
                      <SelectItem value="8">Every 8 Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Fall Detection
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Uses your device's motion sensors to detect potential falls. If a fall is detected and you don't respond within 30 seconds, an SOS alert is sent to your guardians.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable Fall Detection</p>
                    <p className="text-xs text-muted-foreground">Monitors accelerometer for sudden falls</p>
                  </div>
                  <Switch checked={settings.fallDetection} onCheckedChange={async (v) => {
                    updateSetting("fallDetection", v);
                    if (v) {
                      await requestMotionPermission();
                    }
                  }} />
                </div>
                {settings.fallDetection && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Detection Sensitivity</p>
                      <p className="text-xs text-muted-foreground">Higher = catches more falls but may have false alarms</p>
                    </div>
                    <Select value={settings.fallSensitivity} onValueChange={(v) => updateSetting("fallSensitivity", v)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-xs text-foreground">
                    <strong>How it works:</strong> The sensor looks for a free-fall pattern followed by a sudden impact and stillness. If detected, you'll have 30 seconds to confirm you're okay before an SOS is triggered.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ APPTS TAB ============ */}
        {activeTab === "appts" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-primary" />
                  Appointment Pre-Alert
                </CardTitle>
                <p className="text-xs text-muted-foreground">Choose how early you want to be reminded before an appointment</p>
              </CardHeader>
              <CardContent>
                <RadioGroup value={settings.preAlert} onValueChange={(v) => updateSetting("preAlert", v)} className="space-y-2">
                  {[
                    { value: "5min", label: "5 minutes before" },
                    { value: "10min", label: "10 minutes before" },
                    { value: "15min", label: "15 minutes before" },
                    { value: "30min", label: "30 minutes before" },
                    { value: "1hour", label: "1 hour before" },
                  ].map((opt) => (
                    <div key={opt.value} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50">
                      <RadioGroupItem value={opt.value} id={`pre-${opt.value}`} />
                      <Label htmlFor={`pre-${opt.value}`} className="text-sm cursor-pointer flex-1">
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ GUARDIANS TAB ============ */}
        {activeTab === "guardians" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Guardians
                </CardTitle>
                <p className="text-xs text-muted-foreground">Guardians receive SOS alerts and can be nominated as Secret Vault nominees</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {guardians.map((g) => (
                  <div key={g.id} className="p-3 rounded-lg border border-border space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{g.guardian_name}</p>
                          {getStatusBadge(g)}
                        </div>
                        {g.guardian_email && <p className="text-xs text-muted-foreground">{g.guardian_email}</p>}
                        <p className="text-xs text-muted-foreground">{g.guardian_phone}</p>
                        {g.relation && <p className="text-xs text-muted-foreground">Relation: {g.relation}</p>}
                      </div>
                      <button onClick={() => removeGuardian(g.id)} className="text-destructive hover:text-destructive/80 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        <Label className="text-xs">Vault Nominee</Label>
                        <Switch
                          checked={g.is_vault_nominee}
                          onCheckedChange={() => toggleVaultNominee(g.id, g.is_vault_nominee)}
                        />
                      </div>
                    <div className="flex gap-2 flex-wrap">
                      {!g.is_primary && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          onClick={async () => {
                            if (!session?.user?.id) return;
                            const ok = await setPrimaryGuardian(session.user.id, g.id);
                            if (ok) {
                              setGuardians(guardians.map((x) => ({ ...x, is_primary: x.id === g.id })));
                            }
                          }}
                        >
                          <ShieldCheck className="w-3 h-3" /> Make Primary
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => resendGuardianInvite(g.id, session?.user?.email || "Your ward")}
                      >
                        <Mail className="w-3 h-3" /> Re-send Invite
                      </Button>
                    </div>

                    </div>
                  </div>
                ))}

                {showAddForm && (
                  <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                    <Input placeholder="Guardian Name *" value={newName} onChange={(e) => setNewName(e.target.value)} className="text-base" />
                    <div>
                      <Label className="text-xs">Phone *</Label>
                      <PhoneInput value={newPhone} onChange={setNewPhone} />
                    </div>
                    <div>
                      <Input type="email" placeholder="Email *" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="text-base" />
                      <p className="text-xs text-muted-foreground mt-1">Required — used to reach your guardian if WhatsApp doesn't go through.</p>
                    </div>
                    <Input placeholder="Relation (optional)" value={newRelation} onChange={(e) => setNewRelation(e.target.value)} className="text-base" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={addGuardian} className="flex-1">Add Guardian</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your guardian will get an invite by WhatsApp and email. They'll need to install Check-iN and verify their phone to accept — this usually takes a few minutes. The invite is valid for 4 days.
                    </p>
                  </div>
                )}

                {guardians.length < 5 && !showAddForm && (
                  <Button variant="outline" className="w-full gap-2" onClick={() => setShowAddForm(true)}>
                    <Plus className="w-4 h-4" /> Add Guardian ({guardians.length}/5)
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ LANGUAGE TAB ============ */}
        {activeTab === "language" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  App Language
                </CardTitle>
                <p className="text-xs text-muted-foreground">Select your preferred language</p>
              </CardHeader>
              <CardContent>
                <RadioGroup defaultValue="en" className="space-y-2">
                  {[
                    { value: "en", label: "English" },
                    { value: "hi", label: "हिन्दी (Hindi)" },
                    { value: "mr", label: "मराठी (Marathi)" },
                    { value: "ta", label: "தமிழ் (Tamil)" },
                    { value: "bn", label: "বাংলা (Bengali)" },
                    { value: "ml", label: "മലയാളം (Malayalam)" },
                    { value: "kn", label: "ಕನ್ನಡ (Kannada)" },
                    { value: "kok", label: "कोंकणी (Konkani)" },
                    { value: "fr", label: "Français (French)" },
                  ].map((lang) => (
                    <div key={lang.value} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50">
                      <RadioGroupItem value={lang.value} id={`lang-${lang.value}`} />
                      <Label htmlFor={`lang-${lang.value}`} className="text-sm cursor-pointer flex-1">{lang.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ ACCESS TAB ============ */}
        {activeTab === "access" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" />
                  Access & Permissions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">Location Access</p>
                    <p className="text-xs text-muted-foreground">Required for SOS alerts and safe zones</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">Large Text Mode</p>
                    <p className="text-xs text-muted-foreground">Increases overall text size for better readability</p>
                  </div>
                  <Switch checked={(settings as any).largeTextMode} onCheckedChange={(v) => updateSetting("largeTextMode" as any, v)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">Camera Access</p>
                    <p className="text-xs text-muted-foreground">Used for Face Scan and document scanning</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">Motion Sensors</p>
                    <p className="text-xs text-muted-foreground">Used for fall detection and activity tracking</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ SAFETY ZONES TAB ============ */}
        {activeTab === "safety" && (
          <div className="space-y-4">
            <SafeZoneEditor />
          </div>
        )}

        {/* ============ PRIVACY TAB ============ */}
        {activeTab === "privacy" && (
          <PrivacyTab session={session} navigate={navigate} guardians={guardians} />
        )}
      </div>
      {session?.user?.id && (
        <VaultNomineeRecoveryDialog
          open={recoveryDialog.open}
          onOpenChange={(open) => setRecoveryDialog((s) => ({ ...s, open }))}
          userId={session.user.id}
          guardianId={recoveryDialog.guardianId}
        />
      )}
    </AppLayout>
  );
};

export default Settings;
