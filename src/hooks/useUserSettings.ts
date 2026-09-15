import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback, useRef } from "react";

export interface ActivityGoals {
  steps: number;
  heart_rate: number;
  distance_km: number;
  cadence: number;
  calories: number;
  active_minutes: number;
  breaths_per_min: number;
  floors_climbed: number;
  spo2: number;
}

export const DEFAULT_ACTIVITY_GOALS: ActivityGoals = {
  steps: 10000,
  heart_rate: 80,
  distance_km: 5,
  cadence: 160,
  calories: 500,
  active_minutes: 120,
  breaths_per_min: 16,
  floors_climbed: 10,
  spo2: 98,
};

export type PauseMode = "active" | "sleep" | "nap" | "checked-out";

export interface SleepSchedule {
  from: string; // "22:00"
  to: string;   // "06:00"
}

export interface CheckOutConfig {
  durationType: "quick" | "date-range";
  duration: string; // "30min" | "1h" | "2h" etc.
  reason: string;
  informGuardians: boolean;
  notifyVia: "whatsapp" | "email" | "both";
  selectedGuardianIds: string[];
  endsAt: string | null; // ISO timestamp when checkout expires
  startDate: string | null;
  endDate: string | null;
}

export interface UserSettings {
  // Alerts
  audioAlerts: boolean;
  voiceReminders: boolean;
  vibration: boolean;
  checkInPush: boolean;
  medPush: boolean;
  guardianPush: boolean;
  weeklyReport: boolean;
  medicationMissedNotify: boolean;
  // Check-In
  checkInTimes: string[]; // "HH:MM" slots that drive the daily check-in prompts
  activeCheckInHours: number[]; // e.g. [7, 12, 19] — hours in 24h format (Active mode)
  sleepMode: boolean;
  pauseMode: PauseMode;
  defaultNapDurationMins: number;
  expectedReturn: string | null;
  nudgeFrequency: string;
  fallDetection: boolean;
  fallSensitivity: string;
  // Sleep schedule
  sleepSchedule: SleepSchedule;
  napSchedule: SleepSchedule | null;
  autoNapMode: boolean;
  // Check-Out config
  checkOutConfig: CheckOutConfig;
  // Appointments
  preAlert: string;
  // Privacy
  shareLocation: boolean;
  shareHealthData: boolean;
  shareEmergencyWithGuardians: boolean;
  publicEmergencyProfile: boolean;
  // Exercise
  exerciseReminder: boolean;
  // Activity Goals
  activityGoals: ActivityGoals;
  // Past Medical History toggles
  hasHospitalizations: boolean;
  hasSurgeries: boolean;
  // Guardian-specific
  guardianVoiceAlerts: boolean;
  guardianPersistentMissedAlarm: boolean;
  guardianAppointmentAlarms: boolean;
  guardianSafeZoneAlerts: boolean;
  // Journey Tracking
  journeyCheckInFrequency: number | null;
  journeyTrackingGuardians: string[];
  // Per-guardian location sharing
  locationSharingGuardianIds: string[];
  liveLocationGuardianIds: string[];
  // Voice Query custom prompts
  voiceQueryPrompts: string[];
  // Hydration prompts (humidity-triggered)
  hydrationNudges: boolean;
  hydrationAdvisoryToGuardian: boolean;
  // Accessibility
  largeTextMode: boolean;
}

export const DEFAULT_VOICE_QUERY_PROMPTS = [
  "What medications need refilling today?",
  "How's my nutrition looking?",
  "Is my calorie goal on track?",
  "Did I take my medications today?",
];

export const DEFAULT_SLEEP_SCHEDULE: SleepSchedule = {
  from: "22:00",
  to: "06:00",
};

export const DEFAULT_CHECKOUT_CONFIG: CheckOutConfig = {
  durationType: "quick",
  duration: "1h",
  reason: "",
  informGuardians: true,
  notifyVia: "whatsapp",
  selectedGuardianIds: [],
  endsAt: null,
  startDate: null,
  endDate: null,
};

const DEFAULTS: UserSettings = {
  audioAlerts: true,
  voiceReminders: true,
  vibration: true,
  checkInPush: true,
  medPush: true,
  activityGoals: DEFAULT_ACTIVITY_GOALS,
  guardianPush: true,
  weeklyReport: true,
  medicationMissedNotify: true,
  checkInTimes: ["07:00", "12:00", "19:00"],
  activeCheckInHours: [7, 12, 19],
  sleepMode: true,
  pauseMode: "active",
  defaultNapDurationMins: 60,
  expectedReturn: null,
  nudgeFrequency: "4",
  fallDetection: true,
  fallSensitivity: "medium",
  sleepSchedule: DEFAULT_SLEEP_SCHEDULE,
  napSchedule: null,
  autoNapMode: true,
  checkOutConfig: DEFAULT_CHECKOUT_CONFIG,
  preAlert: "15min",
  shareLocation: true,
  shareHealthData: true,
  shareEmergencyWithGuardians: true,
  publicEmergencyProfile: false,
  exerciseReminder: true,
  hasHospitalizations: false,
  hasSurgeries: false,
  guardianVoiceAlerts: true,
  guardianPersistentMissedAlarm: true,
  guardianAppointmentAlarms: true,
  guardianSafeZoneAlerts: true,
  journeyCheckInFrequency: 15,
  journeyTrackingGuardians: [],
  locationSharingGuardianIds: [],
  liveLocationGuardianIds: [],
  voiceQueryPrompts: [
    "What medications need refilling today?",
    "How's my nutrition looking?",
    "Is my calorie goal on track?",
    "Did I take my medications today?",
  ],
  hydrationNudges: true,
  hydrationAdvisoryToGuardian: true,
  largeTextMode: false,
};

// Module-level refs so flushPendingWrites can work outside React lifecycle
let _pendingTimeout: ReturnType<typeof setTimeout> | undefined;
let _pendingMutate: (() => void) | undefined;

export function flushPendingSettings() {
  if (_pendingTimeout) {
    clearTimeout(_pendingTimeout);
    _pendingTimeout = undefined;
  }
  if (_pendingMutate) {
    _pendingMutate();
    _pendingMutate = undefined;
  }
}

export function useUserSettings() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  const { data: settings = DEFAULTS, isLoading } = useQuery({
    queryKey: ["user_settings", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings" as any)
        .select("settings")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULTS;
      return { ...DEFAULTS, ...(data as any).settings } as UserSettings;
    },
    enabled: !!userId,
  });

  const mutation = useMutation({
    mutationFn: async (newSettings: UserSettings) => {
      const { error } = await supabase
        .from("user_settings" as any)
        .upsert(
          { user_id: userId!, settings: newSettings as any, updated_at: new Date().toISOString() } as any,
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
  });

  // Apply several fields in one atomic patch so related settings never diverge
  const updateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      const current = queryClient.getQueryData<UserSettings>(["user_settings", userId]) ?? DEFAULTS;
      const updated = { ...current, ...patch };
      queryClient.setQueryData(["user_settings", userId], updated);
      if (_pendingTimeout) clearTimeout(_pendingTimeout);
      _pendingMutate = () => mutation.mutate(updated);
      _pendingTimeout = setTimeout(() => {
        _pendingMutate?.();
        _pendingMutate = undefined;
        _pendingTimeout = undefined;
      }, 500);
    },
    [userId, queryClient, mutation]
  );

  const updateSetting = useCallback(
    <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      const current = queryClient.getQueryData<UserSettings>(["user_settings", userId]) ?? DEFAULTS;
      const updated = { ...current, [key]: value };
      // Optimistic update
      queryClient.setQueryData(["user_settings", userId], updated);
      // Debounce the DB write
      if (_pendingTimeout) clearTimeout(_pendingTimeout);
      _pendingMutate = () => mutation.mutate(updated);
      _pendingTimeout = setTimeout(() => {
        _pendingMutate?.();
        _pendingMutate = undefined;
        _pendingTimeout = undefined;
      }, 500);
    },
    [userId, queryClient, mutation]
  );

  return { settings, isLoading, updateSetting };
}
