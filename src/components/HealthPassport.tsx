import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useUserSettings, DEFAULT_ACTIVITY_GOALS } from "@/hooks/useUserSettings";
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import HealthPassportTrend from "./HealthPassportTrend";
import { resolveCheckInHours, isScheduledSlot } from "@/lib/checkInSchedule";

interface CategoryScore {
  name: string;
  score: number;
  max: 100;
}

interface MilestoneConfig {
  threshold: number;
  emoji: string;
  message: string;
}

const MILESTONES: MilestoneConfig[] = [
  { threshold: 50, emoji: "🌟", message: "Halfway there! Keep going!" },
  { threshold: 70, emoji: "🎯", message: "Amazing progress! You're on fire!" },
  { threshold: 100, emoji: "🏆", message: "Perfect score! You're a health champion!" },
];


const getBarColor = (score: number) => {
  if (score >= 70) return "bg-success";
  if (score >= 40) return "bg-amber-500";
  return "bg-destructive";
};

const HealthPassport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useUserSettings();
  const goals = settings.activityGoals ?? DEFAULT_ACTIVITY_GOALS;
  const checkInHours = resolveCheckInHours(settings);
  const checkInHoursKey = checkInHours.join(",");
  const [categories, setCategories] = useState<CategoryScore[]>([
    { name: "Check-iN", score: 0, max: 100 },
    { name: "Activity", score: 0, max: 100 },
    { name: "Medications", score: 0, max: 100 },
    { name: "Nutrition", score: 0, max: 100 },
  ]);
  const [overallScore, setOverallScore] = useState(0);
  const [activeMilestone, setActiveMilestone] = useState<MilestoneConfig | null>(null);
  const shownMilestones = useRef<Set<number>>(new Set());
  const milestoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeScores = useCallback(async () => {
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10);



    const [checkInsRes, activityRes, medsRes, medLogsRes, mealsRes, personaRes] = await Promise.all([
      supabase.from("check_ins").select("scheduled_at, status, response").eq("user_id", user.id).gte("scheduled_at", `${today}T00:00:00`).lte("scheduled_at", `${today}T23:59:59`),
      supabase.from("activity_logs").select("steps, distance_km, calories, active_minutes").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("medications").select("id, schedule_times").eq("user_id", user.id).lte("start_date", today),
      supabase.from("medication_logs").select("medication_id, status").eq("user_id", user.id).gte("scheduled_at", `${today}T00:00:00`).lte("scheduled_at", `${today}T23:59:59`),
      supabase.from("meal_logs").select("total_calories, total_protein_g, total_fiber_g").eq("user_id", user.id).eq("log_date", today),
      supabase.from("nutrition_personas").select("daily_calorie_goal, weight_kg").eq("user_id", user.id).maybeSingle(),
    ]);

    // 1. Check-iN score — only rows that line up with a real scheduled slot
    // count, exactly like the Check-ins counter. Ad-hoc/out-of-window rows
    // must never award points.
    const checkIns = (checkInsRes.data ?? []).filter((ci: any) =>
      isScheduledSlot(ci.scheduled_at, checkInHours)
    );
    let checkInScore = 0;
    if (checkInHours.length > 0) {
      const pointsPerWindow = 100 / checkInHours.length;
      const responded = checkIns.filter(
        (ci: any) => ci.status === "responded" || ci.status === "late"
      ).length;
      checkInScore = Math.min(Math.round(responded * pointsPerWindow), 100);
    }

    // 2. Activity score
    const act = activityRes.data;
    let activityScore = 0;
    if (act) {
      const stepsP = Math.min((act.steps ?? 0) / goals.steps, 1) * 25;
      const distP = Math.min((Number(act.distance_km) || 0) / goals.distance_km, 1) * 25;
      const calP = Math.min((act.calories ?? 0) / goals.calories, 1) * 25;
      const activeP = Math.min((act.active_minutes ?? 0) / goals.active_minutes, 1) * 25;
      activityScore = Math.round(stepsP + distP + calP + activeP);
    }

    // 3. Medications score
    const meds = medsRes.data ?? [];
    const logs = medLogsRes.data ?? [];
    let totalDoses = 0;
    meds.forEach(m => { totalDoses += (m.schedule_times?.length ?? 0); });
    const medScore = totalDoses > 0
      ? Math.round(Math.min(logs.filter(l => l.status === "taken").length / totalDoses, 1) * 100)
      : 100;

    // 4. Nutrition score
    const meals = mealsRes.data ?? [];
    const calorieGoal = personaRes.data?.daily_calorie_goal ?? 2000;
    const weightKg = Number(personaRes.data?.weight_kg) || 0;
    const totalCal = meals.reduce((s, m) => s + (m.total_calories || 0), 0);
    const totalProtein = meals.reduce((s, m) => s + (Number(m.total_protein_g) || 0), 0);
    const totalFiber = meals.reduce((s, m) => s + (Number(m.total_fiber_g) || 0), 0);
    let calorieP = 0;
    if (calorieGoal > 0 && totalCal > 0) {
      const ratio = totalCal / calorieGoal;
      if (ratio >= 0.8 && ratio <= 1.1) calorieP = 50;
      else if (ratio < 0.8) calorieP = Math.round((ratio / 0.8) * 50);
      else calorieP = Math.max(0, Math.round((1 - Math.min((ratio - 1.1) / 0.5, 1)) * 50));
    }
    const proteinTarget = weightKg > 0 ? weightKg * 0.8 : 50;
    const proteinP = Math.min(totalProtein / proteinTarget, 1) * 25;
    const fiberP = Math.min(totalFiber / 25, 1) * 25;
    const nutritionScore = Math.round(calorieP + proteinP + fiberP);

    const newCategories: CategoryScore[] = [
      { name: "Check-iN", score: checkInScore, max: 100 },
      { name: "Activity", score: activityScore, max: 100 },
      { name: "Medications", score: medScore, max: 100 },
      { name: "Nutrition", score: nutritionScore, max: 100 },
    ];

    const overall = Math.round(newCategories.reduce((sum, c) => sum + c.score, 0) / newCategories.length);

    setCategories(newCategories);
    setOverallScore(overall);

    // Persist daily score
    await supabase.from("health_passport_scores").upsert({
      user_id: user.id,
      score_date: today,
      overall,
      checkin: checkInScore,
      activity: activityScore,
      wellness: 0,
      medications: medScore,
      vitals: 0,
      nutrition: nutritionScore,
    }, { onConflict: "user_id,score_date" });

    for (const ms of MILESTONES) {
      if (overall >= ms.threshold && !shownMilestones.current.has(ms.threshold)) {
        shownMilestones.current.add(ms.threshold);
        setActiveMilestone(ms);
        if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
        milestoneTimer.current = setTimeout(() => setActiveMilestone(null), 3000);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, goals, checkInHoursKey]);

  useEffect(() => {
    computeScores();
    const interval = setInterval(computeScores, 60000);
    return () => {
      clearInterval(interval);
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
    };
  }, [computeScores]);

  const categoryRoutes: Record<string, string> = {
    "Check-iN": "/dashboard",
    "Activity": "/my-health?tool=Activity",
    "Medications": "/my-health?tool=Tablets",
    "Nutrition": "/my-health?tool=Nutrition",
  };

  const handleCategoryTap = (cat: CategoryScore) => {
    const route = categoryRoutes[cat.name];
    if (route) navigate(route);
  };

  return (
    <Card className="relative overflow-hidden">
      {activeMilestone && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="text-center space-y-2 animate-in zoom-in-50 duration-500">
            <span className="text-6xl block">{activeMilestone.emoji}</span>
            <p className="text-lg font-bold text-foreground">{activeMilestone.message}</p>
            <p className="text-sm text-muted-foreground">Score: {overallScore}/100</p>
          </div>
        </div>
      )}

      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Health Passport</span>
          <span className="text-sm font-normal text-muted-foreground">Daily Score</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke={overallScore >= 70 ? "hsl(var(--success))" : overallScore >= 40 ? "hsl(38 92% 50%)" : "hsl(var(--destructive))"}
                strokeWidth="8"
                strokeDasharray={`${(overallScore / 100) * 213.6} 213.6`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold">{overallScore}</span>
            </div>
          </div>
          <div>
            <p className="text-accessible font-semibold">{overallScore}/100</p>
            <p className={`text-sm font-medium ${overallScore >= 70 ? "text-success" : overallScore >= 40 ? "text-amber-500" : "text-destructive"}`}>
              {overallScore >= 70 ? "↗ Great" : overallScore >= 40 ? "→ Steady" : "↘ Needs Attention"}
            </p>
            <p className="text-xs text-muted-foreground">Updated just now</p>
          </div>
        </div>

        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <span className="text-sm text-muted-foreground">{cat.score}/{cat.max}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${getBarColor(cat.score)} transition-all duration-700`}
                    style={{ width: `${cat.score}%` }}
                  />
                </div>
              </div>
              <button onClick={() => handleCategoryTap(cat)} className="ml-3">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>

        {user && <HealthPassportTrend userId={user.id} />}
      </CardContent>
    </Card>
  );
};

export default HealthPassport;
