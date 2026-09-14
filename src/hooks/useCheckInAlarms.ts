import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useApp } from "@/contexts/AppContext";
import { playChime, playVoiceReminder, showBrowserNotification } from "@/lib/audioAlerts";
import { showReminderOverlay, isOverlayVisible, isReminderAcknowledged } from "@/components/ReminderOverlay";

const PRE_ALERT_MIN = 5; // browser push 5 min before scheduled time
const POPUP_DELAY_MIN = 5; // first in-app popup 5 min AFTER scheduled time (grace period)
const POPUP_INTERVAL_MIN = 10; // repeat every 10 min
const MAX_POPUPS = 3; // max 3 popups per slot (T+5, T+15, T+25)
const HARD_CUTOFF_MIN = 60; // stop after 60 min past scheduled time

const formatHour = (h: number) =>
  h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;

const useCheckInAlarms = () => {
  const { session } = useAuth();
  const { settings } = useUserSettings();
  const { pauseMode, loginInProgress } = useApp();
  const firedRef = useRef<Set<string>>(new Set());
  const postGraceRef = useRef<Map<string, { count: number; lastFiredAt: number }>>(new Map());

  const getCheckInHours = useCallback((): number[] => {
    const h = settings.activeCheckInHours;
    return Array.isArray(h) && h.length > 0 ? [...h].sort((a, b) => a - b) : [7, 12, 19];
  }, [settings.activeCheckInHours]);

  const check = useCallback(async () => {
    if (pauseMode !== "active") return;
    if (loginInProgress) return;
    if (!session?.user?.id) return;

    const now = new Date();
    const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const checkInHours = getCheckInHours();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const { data: logs } = await supabase
      .from("check_ins")
      .select("status, scheduled_at")
      .eq("user_id", session.user.id)
      .gte("scheduled_at", todayStart.toISOString())
      .lte("scheduled_at", todayEnd.toISOString());

    const respondedHours = new Set(
      (logs ?? [])
        .filter((l: any) => l.status === "responded")
        .map((l: any) => new Date(l.scheduled_at).getHours())
    );

    for (const scheduledHour of checkInHours) {
      const scheduledTime = new Date(now);
      scheduledTime.setHours(scheduledHour, 0, 0, 0);

      const minutesUntil = (scheduledTime.getTime() - now.getTime()) / 60000;
      const minutesPast = -minutesUntil;
      const slotKey = `checkin-${dateKey}-${scheduledHour}`;
      const timeLabel = formatHour(scheduledHour);

      // Pre-alert: browser push 5 min before
      if (minutesUntil > 0 && minutesUntil <= PRE_ALERT_MIN) {
        const preKey = `pre-${slotKey}`;
        if (!firedRef.current.has(preKey)) {
          firedRef.current.add(preKey);
          showBrowserNotification("Check-iN time coming up", {
            body: `Your ${timeLabel} check-in is in 5 minutes.`,
            tag: preKey,
          });
        }
        continue;
      }

      if (minutesPast <= 0) continue;
      if (minutesPast > HARD_CUTOFF_MIN) continue;
      if (respondedHours.has(scheduledHour)) continue;
      if (isReminderAcknowledged(slotKey)) continue;
      if (minutesPast < POPUP_DELAY_MIN) continue;

      const state = postGraceRef.current.get(slotKey) ?? { count: 0, lastFiredAt: 0 };
      if (state.count >= MAX_POPUPS) continue;

      const minSinceLast = (now.getTime() - state.lastFiredAt) / 60000;
      const shouldFire = state.count === 0 || minSinceLast >= POPUP_INTERVAL_MIN;
      if (!shouldFire) continue;

      state.count++;
      state.lastFiredAt = now.getTime();
      postGraceRef.current.set(slotKey, state);

      playChime();
      if (settings.voiceReminders) {
        playVoiceReminder(`Time to check in! Your ${timeLabel} check-in is waiting.`);
      }

      showBrowserNotification("⏰ Check-in Missed", {
        body: `You missed your ${timeLabel} check-in. Please check in now — your guardian is watching over you.`,
        tag: `missed-${slotKey}`,
        requireInteraction: true,
        vibrate: [300, 150, 300, 150, 300],
      });

      if (!isOverlayVisible()) {
        showReminderOverlay({
          type: "checkin",
          title: "Check-In Missed",
          message: `Your ${timeLabel} check-in is overdue. Tap below to check in now and let your guardians know you're safe.`,
          slotKey,
          reminderCount: `Reminder ${state.count} of ${MAX_POPUPS}`,
        });
      }
    }
  }, [session?.user?.id, pauseMode, loginInProgress, settings, getCheckInHours]);

  useEffect(() => {
    if (!session?.user?.id) return;
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [check, session?.user?.id]);
};

export default useCheckInAlarms;
