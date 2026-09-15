import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isMedScheduledToday } from "@/lib/medSchedule";
import { useUserSettings } from "@/hooks/useUserSettings";
import { resolveCheckInHours, isScheduledSlot } from "@/lib/checkInSchedule";

export function useLiveDashboardStats() {
  const { session } = useAuth();
  const { settings } = useUserSettings();
  const checkInHours = resolveCheckInHours(settings);
  const checkInHoursKey = checkInHours.join(",");
  const [stats, setStats] = useState({
    checkInsCompleted: 0,
    checkInsTotal: 0,
    medsCompleted: 0,
    medsTotal: 0,
    healthScore: 100,
  });

  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchStats = async () => {
      const todayDate = new Date();
      const todayStr = todayDate.toISOString().slice(0, 10);
      todayDate.setHours(0, 0, 0, 0);
      const tomorrow = new Date(todayDate);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [checkInsRes, medLogsRes, medsRes, healthRes] = await Promise.all([
        supabase
          .from("check_ins")
          .select("status, scheduled_at")
          .eq("user_id", session.user.id)
          .gte("scheduled_at", todayDate.toISOString())
          .lt("scheduled_at", tomorrow.toISOString()),
        supabase
          .from("medication_logs")
          .select("status")
          .eq("user_id", session.user.id)
          .gte("scheduled_at", todayDate.toISOString())
          .lt("scheduled_at", tomorrow.toISOString()),
        supabase
          .from("medications")
          .select("schedule_times, schedule_days, start_date, end_date")
          .eq("user_id", session.user.id)
          .lte("start_date", todayStr),
        supabase
          .from("health_passport_scores")
          .select("overall")
          .eq("user_id", session.user.id)
          .eq("score_date", todayStr)
          .maybeSingle()
      ]);

      // Count only rows that line up with a scheduled slot — ad-hoc rows and
      // slots from an older schedule must not inflate the total.
      const scheduledRows = (checkInsRes.data ?? []).filter((c: any) =>
        isScheduledSlot(c.scheduled_at, checkInHours)
      );
      const ciTotal = checkInHours.length;
      const ciCompleted = scheduledRows.filter(
        (c: any) => c.status === "responded" || c.status === "late"
      ).length;

      // Total scheduled doses today = sum of schedule_times across active medications
      const activeMeds = (medsRes.data ?? []).filter((m: any) =>
        (!m.end_date || m.end_date >= todayStr) && isMedScheduledToday(m)
      );
      const mTotal = activeMeds.reduce(
        (sum: number, m: any) => sum + (Array.isArray(m.schedule_times) ? m.schedule_times.length : 0),
        0
      );
      const mCompleted = (medLogsRes.data ?? []).filter(
        (m: any) => m.status === "taken" || m.status === "taken_late"
      ).length;


      const score = healthRes.data?.overall ?? 0;
      
      setStats({
        checkInsCompleted: ciCompleted,
        checkInsTotal: ciTotal,
        medsCompleted: mCompleted,
        medsTotal: mTotal,
        healthScore: score,
      });
    };

    fetchStats();
    
    // Poll every minute to keep it fresh
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [session?.user?.id, checkInHoursKey]);

  return stats;
}
