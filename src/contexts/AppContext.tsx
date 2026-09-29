import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queueSOS } from "@/lib/offlineQueue";
import { useUserSettings } from "@/hooks/useUserSettings";

export type UserRole = "user" | "guardian";
export type PauseMode = "active" | "sleep" | "nap" | "checked-out";

export type SOSRecipientChannelStatus = "accepted" | "rejected" | "not_attempted";
export type SOSRecipientSkipReason = "self_targeted" | "invalid_phone" | "duplicate_phone";

export interface SOSRecipientReport {
  guardian_id: string;
  name: string;
  phone_raw: string;
  phone_normalized: string | null;
  status: "accepted" | "pending";
  included: boolean;
  skip_reason: SOSRecipientSkipReason | null;
  channels: {
    oneapi: SOSRecipientChannelStatus;
  };
}

export interface SOSDeliveryResult {
  recipientCount: number;

  // "Accepted" = provider (MSG91) took the request; delivery is still pending
  // until the delivery-status webhook updates `sos_message_attempts`.
  oneApiAccepted: number;

  // Legacy aliases are no longer used because WhatsApp/SMS
  // are now handled together through MSG91 OneAPI.
  oneApiQueued: number;

  oneApiRequestId?: string | null;

  emailQueued?: number;
  pushSent?: number;
  deliveryPending?: boolean;

  recipients?: SOSRecipientReport[];

  errors: {
    invoke: string | null;
    recipients: string | null;
    oneApi: string | null;
  };
}

export interface TriggerSOSResult {
  sosId: string | null;
  delivery: SOSDeliveryResult | null;
  invokeError: string | null;
}

export interface TriggerSOSOptions {
  message?: string;
  doctorName?: string | null;
  doctorEmail?: string | null;
  userName?: string;
}

interface AppState {
  role: UserRole;
  setRole: (role: UserRole) => void;
  isLoggedIn: boolean;
  loginInProgress: boolean;
  emergencyMode: boolean;
  activeSosId: string | null;
  triggerSOS: (opts?: TriggerSOSOptions) => Promise<TriggerSOSResult>;
  cancelSOS: () => void;
  userName: string;
  pauseMode: PauseMode;
  setPauseMode: (mode: PauseMode) => void;
}

const AppContext = createContext<AppState | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
};

const getCurrentPosition = (): Promise<{ latitude: number; longitude: number } | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, profile, loginInProgress } = useAuth();
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [roleOverride, setRoleOverride] = useState<UserRole | null>(null);
  const [pauseMode, setPauseMode] = useState<PauseMode>("active");
  const { settings, isLoading: settingsLoading } = useUserSettings();
  const pauseHydratedRef = useRef(false);

  // Hydrate pauseMode from persisted settings on first load (per session).
  // Only restore "checked-out" if endsAt is still in the future.
  useEffect(() => {
    if (pauseHydratedRef.current) return;
    if (!session?.user?.id) return;
    if (settingsLoading) return;

    pauseHydratedRef.current = true;

    if (settings.pauseMode === "checked-out") {
      const endsAt = settings.checkOutConfig?.endsAt;

      if (endsAt && new Date(endsAt).getTime() > Date.now()) {
        setPauseMode("checked-out");
      }
    }

    // sleep mode is re-asserted by useAutoSleepMode based on schedule
  }, [
    session?.user?.id,
    settingsLoading,
    settings.pauseMode,
    settings.checkOutConfig,
  ]);

  const invokedSosIdsRef = React.useRef<Set<string>>(new Set());

  const isLoggedIn = !!session;
  const userName = profile?.full_name || "User";
  const role: UserRole =
    roleOverride ??
    ((profile?.role === "guardian" ? "guardian" : "user") as UserRole);

  const setRole = useCallback((r: UserRole) => setRoleOverride(r), []);

  const invokeSosAlertOnce = useCallback(
    async (
      sosId: string,
      opts?: TriggerSOSOptions
    ): Promise<{
      delivery: SOSDeliveryResult | null;
      invokeError: string | null;
    }> => {
      if (invokedSosIdsRef.current.has(sosId)) {
        console.log("[triggerSOS] skipping duplicate invoke for sosId:", sosId);
        return { delivery: null, invokeError: null };
      }

      invokedSosIdsRef.current.add(sosId);

      if (!session?.user?.id) {
        return { delivery: null, invokeError: "no-session" };
      }

      const currentUserName = opts?.userName || profile?.full_name || "User";

      // Always resolve recipients from accepted guardians only — backend is source of truth
      const { data: guardianRows } = await supabase
        .from("guardians")
        .select("guardian_email, guardian_phone")
        .eq("user_id", session.user.id)
        .eq("status", "accepted");

      const guardian_emails = (guardianRows ?? [])
        .map((g: any) => g.guardian_email)
        .filter(Boolean);

      const guardian_phones = (guardianRows ?? [])
        .map((g: any) => g.guardian_phone)
        .filter(Boolean);

      const messageText =
        opts?.message ||
        `🚨 SOS ALERT from ${currentUserName} — immediate attention needed.`;

      console.log("[triggerSOS] invoking send-sos-alert", {
        sosId,
        acceptedGuardians: guardianRows?.length ?? 0,
        phones: guardian_phones.length,
        emails: guardian_emails.length,
      });

      try {
        const { data, error } = await supabase.functions.invoke(
          "send-sos-alert",
          {
            body: {
              user_id: session.user.id,
              message: messageText,
              guardian_emails,
              guardian_phones,
              doctor_email: opts?.doctorEmail ?? null,
              doctor_name: opts?.doctorName ?? null,
              user_name: currentUserName,
            },
          }
        );

        if (error) {
          // Non-fatal: the DB trigger on sos_events will dispatch server-side.
          console.warn(
            "[triggerSOS] client invoke failed; server trigger will handle dispatch:",
            error
          );

          return {
            delivery: null,
            invokeError: error.message || "invoke failed",
          };
        }

        console.log("[triggerSOS] send-sos-alert response:", data);

        const d = data as any;

        const oneApiAccepted = d?.oneApiAccepted ?? 0;

        const delivery: SOSDeliveryResult = {
          recipientCount: d?.recipientCount ?? 0,

          oneApiAccepted,
          oneApiQueued: oneApiAccepted,

          oneApiRequestId: d?.oneApiRequestId ?? null,

          emailQueued: d?.emailQueued ?? 0,
          pushSent: d?.pushSent ?? 0,
          deliveryPending: !!d?.deliveryPending,

          recipients: Array.isArray(d?.recipients)
            ? d.recipients
            : undefined,

          errors: {
            invoke: null,
            recipients: d?.errors?.recipients ?? null,
            oneApi: d?.errors?.oneApi ?? null,
          },
        };

        if (delivery.recipientCount === 0) {
          toast.error(
            delivery.errors.recipients ||
              "No accepted guardians with valid phone numbers"
          );
        } else if (oneApiAccepted === 0) {
          toast.error(
            `SOS not accepted by provider. OneAPI: ${
              delivery.errors.oneApi || "n/a"
            }`
          );
        }

        return { delivery, invokeError: null };
      } catch (e: any) {
        // Non-fatal: DB trigger dispatches server-side regardless.
        console.warn(
          "[triggerSOS] client invoke threw; server trigger will handle dispatch:",
          e
        );

        const msg = e?.message || String(e);

        return {
          delivery: null,
          invokeError: msg,
        };
      }
    },
    [session?.user?.id, profile?.full_name]
  );

  const triggerSOS = useCallback(
    async (opts?: TriggerSOSOptions): Promise<TriggerSOSResult> => {
      setEmergencyMode(true);

      if (!session?.user?.id) {
        toast.error("You must be logged in to trigger SOS");

        return {
          sosId: null,
          delivery: null,
          invokeError: "no-session",
        };
      }

      const coords = await getCurrentPosition();

      if (!coords) {
        toast.warning("Location unavailable — SOS sent without coordinates");
      }

      const sosPayload = {
        user_id: session.user.id,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        trigger_type: "manual",
        status: "active",
      };

      try {
        const { data, error } = await supabase
          .from("sos_events")
          .insert(sosPayload)
          .select("id")
          .single();

        if (error) throw error;

        if (!data) {
          return {
            sosId: null,
            delivery: null,
            invokeError: "no-sos-id",
          };
        }

        setActiveSosId(data.id);

        const result = await invokeSosAlertOnce(data.id, opts);

        return {
          sosId: data.id,
          delivery: result.delivery,
          invokeError: result.invokeError,
        };
      } catch (err: any) {
        console.error(
          "Failed to create SOS event (may be offline):",
          err
        );

        try {
          await queueSOS(sosPayload);

          toast.warning(
            "You're offline — SOS queued and will send when reconnected"
          );

          if ("serviceWorker" in navigator && "SyncManager" in window) {
            const reg = await navigator.serviceWorker.ready;
            await (reg as any).sync.register("sos-sync");
          }
        } catch (queueErr) {
          console.error("Failed to queue SOS:", queueErr);
          toast.error("Failed to record SOS event");
        }

        return {
          sosId: null,
          delivery: null,
          invokeError: err?.message || String(err),
        };
      }
    },
    [session?.user?.id, invokeSosAlertOnce]
  );

  const cancelSOS = useCallback(async () => {
    setEmergencyMode(false);

    if (!activeSosId) return;

    const { error } = await supabase
      .from("sos_events")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", activeSosId);

    if (error) {
      console.error("Failed to cancel SOS event:", error);
    }

    setActiveSosId(null);

    // Notify guardians that user is safe
    if (session?.user?.id) {
      const currentUserName = profile?.full_name || "User";

      // Get guardians
      const { data: guardianRows } = await supabase
        .from("guardians")
        .select("id, guardian_email")
        .eq("user_id", session.user.id);

      if (guardianRows?.length) {
        // Insert "all clear" notifications
        const notifRows = guardianRows.map((g: any) => ({
          user_id: session.user.id,
          guardian_id: g.id,
          title: "✅ SOS Resolved",
          message: `${currentUserName} has marked themselves as safe. The SOS alert has been cancelled.`,
          type: "sos_resolved",
        }));

        await supabase.rpc("insert_notifications_deduped", {
          p_notifications: notifRows,
        });

        // Send "all clear" via edge function (email/push/WhatsApp)
        const guardianEmails = guardianRows
          .map((g: any) => g.guardian_email)
          .filter(Boolean);

        supabase
          .functions
          .invoke("send-sos-alert", {
            body: {
              user_id: session.user.id,
              message: `✅ ALL CLEAR — ${currentUserName} has confirmed they are safe. The SOS alert has been cancelled.`,
              guardian_emails: guardianEmails,
              user_name: currentUserName,
            },
          })
          .catch((e) => console.error("Failed to send all-clear:", e));
      }
    }
  }, [activeSosId, session, profile]);

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        isLoggedIn,
        loginInProgress,
        emergencyMode,
        activeSosId,
        triggerSOS,
        cancelSOS,
        userName,
        pauseMode,
        setPauseMode,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
