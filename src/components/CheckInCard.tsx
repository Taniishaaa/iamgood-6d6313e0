import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Heart, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CheckInDialog from "@/components/CheckInDialog";
import { useUserSettings } from "@/hooks/useUserSettings";
import { isScheduledSlot, getCurrentWindow, getCheckInWindowStart } from "@/lib/checkInSchedule";

const DEFAULT_CHECK_IN_HOURS = [7, 12, 19]; // 7AM, 12PM, 7PM

// Convert saved "HH:MM" strings into a sorted, de-duplicated list of hours
export const parseCheckInHours = (times?: string[] | null): number[] => {
  if (!times || times.length === 0) return DEFAULT_CHECK_IN_HOURS;
  const hours = Array.from(
    new Set(
      times
        .map((t) => parseInt(String(t).split(":")[0], 10))
        .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23)
    )
  ).sort((a, b) => a - b);
  return hours.length > 0 ? hours : DEFAULT_CHECK_IN_HOURS;
};

// Window helpers live in @/lib/checkInSchedule so CheckInDialog uses identical logic

const getNextCheckInTime = (CHECK_IN_HOURS: number[]) => {
  const now = new Date();
  const nowMs = now.getTime();
  for (const h of CHECK_IN_HOURS) {
    const earlyStart = getCheckInWindowStart(h);
    earlyStart.setMinutes(earlyStart.getMinutes() - 60);
    if (nowMs < earlyStart.getTime()) {
      return getCheckInWindowStart(h);
    }
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(CHECK_IN_HOURS[0] ?? 7, 0, 0, 0);
  return tomorrow;
};

const getMinutesUntilNext = (CHECK_IN_HOURS: number[]) => {
  const next = getNextCheckInTime(CHECK_IN_HOURS);
  return (next.getTime() - Date.now()) / 60000;
};

const formatTimeLeft = (ms: number) => {
  if (ms <= 0) return "00:00";
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, "0")}m`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const formatHour = (h: number) => {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
};

const CheckInCard = () => {
  const { userName, pauseMode } = useApp();
  const { session } = useAuth();
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedInStatus, setCheckedInStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentCheckInId, setCurrentCheckInId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [isApproaching, setIsApproaching] = useState(false);
  const [approachingMinutes, setApproachingMinutes] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [slotStatuses, setSlotStatuses] = useState<Record<number, string>>({});

  const { settings } = useUserSettings();
  const CHECK_IN_HOURS = useMemo(() => {
    const hours = settings?.activeCheckInHours;
    if (Array.isArray(hours) && hours.length > 0) {
      return Array.from(new Set(hours.filter((h) => Number.isFinite(h) && h >= 0 && h <= 23))).sort((a, b) => a - b);
    }
    return parseCheckInHours(settings?.checkInTimes);
  }, [settings?.activeCheckInHours, settings?.checkInTimes]);

  const checkInTimes = CHECK_IN_HOURS.map(formatHour);

  // Fetch or create today's check-in for the current window
  const loadCurrentCheckIn = useCallback(async () => {
    if (!session?.user?.id) return;

    const windowHour = getCurrentWindow(CHECK_IN_HOURS);
    if (windowHour === null) {
      // Before first check-in of the day
      setCheckedIn(false);
      setCurrentCheckInId(null);
      return;
    }

    const windowStart = getCheckInWindowStart(windowHour);
    const nextHourIndex = CHECK_IN_HOURS.indexOf(windowHour) + 1;
    const windowEnd = nextHourIndex < CHECK_IN_HOURS.length
      ? getCheckInWindowStart(CHECK_IN_HOURS[nextHourIndex])
      : (() => { const d = new Date(windowStart); d.setHours(23, 59, 59, 999); return d; })();
      
    // Apply 60 min early cutoff for the *end* of the query, so it doesn't bleed into the next slot's early window
    if (nextHourIndex < CHECK_IN_HOURS.length) {
      windowEnd.setMinutes(windowEnd.getMinutes() - 60);
    }

    // Check if a check-in already exists for this window
    const { data: existing, error } = await supabase
      .from("check_ins")
      .select("*")
      .eq("user_id", session.user.id)
      .gte("scheduled_at", windowStart.toISOString())
      .lt("scheduled_at", windowEnd.toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Failed to fetch check-in:", error);
      return;
    }

    if (existing && existing.length > 0) {
      const checkIn = existing[0];
      setCurrentCheckInId(checkIn.id);
      setCheckedIn(checkIn.status === "responded" || checkIn.status === "late");
      setCheckedInStatus(checkIn.status);
    } else {
      // Create a pending check-in for this window using upsert to avoid duplicates
      const { data: created, error: insertError } = await supabase
        .from("check_ins")
        .upsert(
          {
            user_id: session.user.id,
            scheduled_at: windowStart.toISOString(),
            status: "pending",
          },
          { onConflict: "user_id,scheduled_at", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

      if (insertError) {
        console.error("Failed to create check-in:", insertError);
        return;
      }

      if (created) {
        setCurrentCheckInId(created.id);
      } else {
        // upsert was a no-op (record already exists), re-fetch
        const { data: refetched } = await supabase
          .from("check_ins")
          .select("id, status")
          .eq("user_id", session.user.id)
          .eq("scheduled_at", windowStart.toISOString())
          .single();
        if (refetched) {
          setCurrentCheckInId(refetched.id);
          setCheckedIn(refetched.status === "responded" || refetched.status === "late");
          setCheckedInStatus(refetched.status);
          return;
        }
      }
      setCheckedIn(false);
      setCheckedInStatus(null);
    }
  }, [session?.user?.id, CHECK_IN_HOURS]);

  // Fetch statuses for all today's check-in slots
  const loadSlotStatuses = useCallback(async () => {
    if (!session?.user?.id) return;
    const today = new Date();
    const dayStart = new Date(today);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(today);
    dayEnd.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from("check_ins")
      .select("scheduled_at, status")
      .eq("user_id", session.user.id)
      .gte("scheduled_at", dayStart.toISOString())
      .lte("scheduled_at", dayEnd.toISOString());

    if (data) {
      const statuses: Record<number, string> = {};
      // Only count rows that line up exactly with a scheduled slot — this
      // excludes ad-hoc rows and slots left over from an older schedule.
      for (const ci of data) {
        if (!isScheduledSlot(ci.scheduled_at, CHECK_IN_HOURS)) continue;
        const h = new Date(ci.scheduled_at).getHours();
        statuses[h] = ci.status;
      }
      setSlotStatuses(statuses);
    }
  }, [session?.user?.id, CHECK_IN_HOURS]);

  const prevWindowRef = useRef<number | null>(undefined);

  useEffect(() => {
    loadCurrentCheckIn();
    loadSlotStatuses();
    const interval = setInterval(() => {
      const newWindow = getCurrentWindow(CHECK_IN_HOURS);
      if (prevWindowRef.current !== undefined && newWindow !== prevWindowRef.current) {
        // Audio alerts are now handled by useCheckInAudio hook
      }
      prevWindowRef.current = newWindow;
      loadCurrentCheckIn();
      loadSlotStatuses();
    }, 30000);
    prevWindowRef.current = getCurrentWindow(CHECK_IN_HOURS);
    return () => clearInterval(interval);
  }, [loadCurrentCheckIn, loadSlotStatuses]);

  // Countdown timer + approaching detection
  useEffect(() => {
    const tick = () => {
      const next = getNextCheckInTime(CHECK_IN_HOURS);
      const ms = next.getTime() - Date.now();
      setTimeLeft(formatTimeLeft(ms));
      const minsLeft = getMinutesUntilNext(CHECK_IN_HOURS);
      const currentWindow = getCurrentWindow(CHECK_IN_HOURS);
      // Approaching = within 60 min of next window AND not currently in an active window (or already checked in)
      if (minsLeft <= 60 && minsLeft > 0 && (currentWindow === null || checkedIn)) {
        setIsApproaching(true);
        setApproachingMinutes(Math.ceil(minsLeft));
      } else {
        setIsApproaching(false);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [checkedIn, CHECK_IN_HOURS]);

  const handleCheckIn = async () => {
    if (!session?.user?.id || loading) return;
    setLoading(true);

    const now = new Date();
    const windowHour = getCurrentWindow(CHECK_IN_HOURS);
    let scheduledAt = windowHour !== null
      ? getCheckInWindowStart(windowHour)
      : now;
    
    // If we're approaching the next window and checking in early, log it for the upcoming window
    const minsLeft = getMinutesUntilNext(CHECK_IN_HOURS);
    if (windowHour === null && minsLeft <= 60 && minsLeft > 0) {
      scheduledAt = getNextCheckInTime(CHECK_IN_HOURS);
    }

    if (!navigator.onLine) {
      try {
        const req = indexedDB.open("checkin-offline", 2);
        req.onsuccess = async () => {
          const db = req.result;
          const tx = db.transaction("checkin_queue", "readwrite");
          tx.objectStore("checkin_queue").add({
            user_id: session.user.id,
            scheduled_at: scheduledAt.toISOString(),
            status: "responded",
            response: "ok",
            responded_at: now.toISOString(),
            queued_at: Date.now()
          });
          const sw = await navigator.serviceWorker.ready;
          // @ts-expect-error: service worker sync type is not standard in lib.dom
          sw.sync.register("checkin-sync");
        };
        setCheckedIn(true);
        setCheckedInStatus("responded");
        toast.success("Check-in saved offline. Will sync when reconnected.");
        import("canvas-confetti").then((module) => {
          const confetti = module.default;
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#22c55e', '#3b82f6', '#eab308'] });
        });
      } catch {
        toast.error("Offline check-in failed.");
      }
      setLoading(false);
      return;
    }

    // Upsert to handle race conditions — creates if missing, no-ops if exists
    if (!currentCheckInId) {
      const { data: created, error: insertError } = await supabase
        .from("check_ins")
        .upsert(
          {
            user_id: session.user.id,
            scheduled_at: scheduledAt.toISOString(),
            status: "pending",
          },
          { onConflict: "user_id,scheduled_at", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

      if (insertError) {
        console.error("Failed to create check-in:", insertError);
        toast.error("Check-in failed. Please try again.");
        setLoading(false);
        return;
      }

      if (created) {
        setCurrentCheckInId(created.id);
      }
    }

    // Check if the current scheduled window was already missed
    const { data: existing } = await supabase
      .from("check_ins")
      .select("status")
      .eq("user_id", session.user.id)
      .eq("scheduled_at", scheduledAt.toISOString())
      .maybeSingle();
      
    const isLate = existing?.status === "missed";
    const newStatus = isLate ? "late" : "responded";

    // Update ALL pending or missed check-ins for this user + scheduled_at
    let updateResult = await supabase
      .from("check_ins")
      .update({
        status: newStatus,
        response: "ok",
        responded_at: new Date().toISOString(),
      })
      .eq("user_id", session.user.id)
      .eq("scheduled_at", scheduledAt.toISOString())
      .in("status", ["pending", "missed"]);

    let error = updateResult.error;
    let finalStatus = newStatus;

    // Fallback: If DB check constraint doesn't allow 'late', use 'responded' and add a note
    if (error && newStatus === "late") {
      console.warn("Failed to update status to 'late', falling back to 'responded':", error);
      const fallbackResult = await supabase
        .from("check_ins")
        .update({
          status: "responded",
          response: "ok",
          notes: "Late check-in",
          responded_at: new Date().toISOString(),
        })
        .eq("user_id", session.user.id)
        .eq("scheduled_at", scheduledAt.toISOString())
        .in("status", ["pending", "missed"]);
      
      error = fallbackResult.error;
      finalStatus = "responded";
    }

    if (error) {
      console.error("Failed to check in:", error);
      toast.error("Check-in failed. Please try again.");
    } else {
      setCheckedIn(true);
      setCheckedInStatus(finalStatus);
      toast.success(isLate ? "Late Check-in recorded! Guardians notified." : "Check-in recorded! Your guardians have been notified.");
      import("canvas-confetti").then((module) => {
        const confetti = module.default;
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#22c55e', '#3b82f6', '#eab308']
        });
      });
    }
    setLoading(false);
  };

  const nextCheckIn = getNextCheckInTime(CHECK_IN_HOURS);
  const nextLabel = nextCheckIn.getDate() !== new Date().getDate()
    ? `${formatHour(nextCheckIn.getHours())} (Tomorrow)`
    : formatHour(nextCheckIn.getHours());

  const isPaused = pauseMode !== "active";
  const pauseLabel = pauseMode === "sleep" ? "Sleep Mode" : "Checked Out";

  return (
    <>
    <Card className="border border-border bg-card shadow-sm">
      <CardContent className="p-4">
        <p className="text-center text-sm font-medium text-white mb-2">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "Asia/Kolkata",
          })}
        </p>
        {isPaused ? (
          <div className="text-center space-y-3">
            <div
              className="relative w-32 h-32 mx-auto flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, hsl(0 0% 100%) 30%, hsl(145 47% 55% / 0.15) 60%, transparent 80%)',
              }}
            >
              <Heart className="w-16 h-16 text-success fill-current" />
            </div>
            <p className="text-3xl font-bold text-success">
              {pauseLabel} — Check-iNs Paused
            </p>
            <p className="text-xl text-white">
              To update mode, go to Settings.
            </p>
          </div>
        ) : isApproaching && !checkedIn && getCurrentWindow(CHECK_IN_HOURS) === null ? (
          <div className="text-center space-y-3">
            <p className="text-3xl font-bold text-foreground">
              {userName}, Check-iN coming up!
            </p>
            <button
              onClick={() => setShowDialog(true)}
              disabled={loading}
              className="relative w-44 h-44 mx-auto flex items-center justify-center animate-pulse-heart disabled:opacity-50"
              aria-label="Check in early"
              style={{
                background: 'radial-gradient(circle, hsl(0 0% 100%) 30%, hsl(0 84% 60% / 0.15) 60%, transparent 80%)',
              }}
            >
              <Heart className="w-24 h-24 text-sos fill-current drop-shadow-lg" />
            </button>
            <p className="text-xl text-muted-foreground font-medium">
              Check-iN in <span className="font-semibold text-sos">{approachingMinutes} min</span>
            </p>
            <p className="text-lg text-muted-foreground">
              Get ready for your next check-in at {formatHour(getNextCheckInTime(CHECK_IN_HOURS).getHours())}
            </p>
          </div>
        ) : !checkedIn && getCurrentWindow(CHECK_IN_HOURS) !== null ? (
          <div className="text-center space-y-3">
            <p className="text-3xl font-bold text-foreground">
              {userName}, did you Check-In today?
            </p>
            <button
              onClick={() => setShowDialog(true)}
              disabled={loading}
              className="relative w-44 h-44 mx-auto flex items-center justify-center animate-pulse-heart disabled:opacity-50"
              aria-label="Check in - I'm okay"
              style={{
                background: 'radial-gradient(circle, hsl(0 0% 100%) 30%, hsl(0 84% 60% / 0.15) 60%, transparent 80%)',
              }}
            >
              <Heart className="w-24 h-24 text-sos fill-current drop-shadow-lg" />
            </button>
            <p className="text-xl text-muted-foreground">
              Tap the heart to Check-iN
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="w-24 h-24 rounded-full border-[3px] border-warning mx-auto flex flex-col items-center justify-center mb-4">
              <div className="text-[22px] font-bold text-warning leading-none">
                {nextLabel.split(' ')[0]}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Next check-in</div>
            </div>
            <p className={`text-lg font-bold mb-1 ${checkedInStatus === "late" ? "text-warning" : checkedIn ? "text-success" : "text-foreground"}`}>
              {checkedInStatus === "late" ? "✔ Checked In (Late)" : checkedIn ? "✔ Checked In!" : "Schedule Active"}
            </p>
            {checkedIn && (
              <p className="text-sm text-muted-foreground">
                Your guardians have been notified.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2 justify-center">
          {CHECK_IN_HOURS.map((h, i) => {
            const status = slotStatuses[h];
            const now = new Date();
            const isPast = now.getHours() >= h;
            const isCurrent = getCurrentWindow(CHECK_IN_HOURS) === h;

            let badgeClass = "bg-primary/10 text-primary"; // upcoming
            let icon = "";
            if (status === "responded") {
              badgeClass = "bg-success/15 text-success border border-success/30";
              icon = "✓ ";
            } else if (status === "late") {
              badgeClass = "bg-amber-500/15 text-amber-600 border border-amber-500/30";
              icon = "✓ ";
            } else if (status === "missed") {
              badgeClass = "bg-destructive/15 text-destructive border border-destructive/30";
              icon = "✗ ";
            } else if (isCurrent && isPast) {
              badgeClass = "bg-amber-500/15 text-amber-600 border border-amber-500/30 animate-pulse";
              icon = "● ";
            }

            return (
              <span
                key={h}
                className={`text-xs px-2 py-1 rounded-full font-medium ${badgeClass}`}
              >
                {icon}{checkInTimes[i]}
              </span>
            );
          })}
        </div>

        {/* Missed check-ins summary */}
        {Object.values(slotStatuses).filter(s => s === "missed").length > 0 && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-destructive">
            <span className="font-semibold">
              ⚠ {Object.values(slotStatuses).filter(s => s === "missed").length} missed check-in{Object.values(slotStatuses).filter(s => s === "missed").length > 1 ? "s" : ""} today
            </span>
          </div>
        )}
      </CardContent>
    </Card>

    <CheckInDialog
      open={showDialog}
      onClose={() => setShowDialog(false)}
      onConfirmOk={handleCheckIn}
    />
    </>
  );
};

export default CheckInCard;
