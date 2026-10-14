import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill, TrendingUp, Activity, Heart, Utensils, CheckCircle, Navigation, BriefcaseMedical, FileSearch, Stethoscope, TestTube2, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { format, subDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import ReportShareButtons from "@/components/ReportShareButtons";
import { useGuardianWard } from "@/contexts/GuardianWardContext";
import WardPicker from "@/components/WardPicker";
import JourneyReportCard from "@/components/JourneyReportCard";
import NutritionTrendChart, { type NutritionTrendPoint } from "@/components/NutritionTrendChart";
import HospitalVisitTab from "@/components/guardian/HospitalVisitTab";
import AnalysisReportTab from "@/components/guardian/AnalysisReportTab";
import ReactMarkdown from "react-markdown";
import VisualHealthReport, { tryParseVisualReport } from "@/components/health-tools/VisualHealthReport";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useIsPrimaryGuardian } from "@/hooks/useIsPrimaryGuardian";

type ReportSection = "medications" | "checkins" | "activity" | "vitals" | "nutrition" | "journeys" | "hospital_visit" | "analysis" | "doctor_visit" | "lab_tests";

const GuardianReports = () => {
  const { session } = useAuth();
  const { selectedWard } = useGuardianWard();
  const [searchParams] = useSearchParams();
  const initialSection = (searchParams.get("section") as ReportSection) || "medications";
  const [activeSection, setActiveSection] = useState<ReportSection>(initialSection);
  const wardUserId = selectedWard?.userId || null;
  const wardName = selectedWard?.name || "User";
  const { isPrimary } = useIsPrimaryGuardian(wardUserId);
  const [loading, setLoading] = useState(true);

  // Data states
  const [medications, setMedications] = useState<any[]>([]);
  const [medLogs, setMedLogs] = useState<any[]>([]);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [vitalData, setVitalData] = useState<any[]>([]);
  const [mealLogs, setMealLogs] = useState<any[]>([]);
  const [journeyReports, setJourneyReports] = useState<any[]>([]);
  const [doctorReports, setDoctorReports] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [checkingLabResults, setCheckingLabResults] = useState<string | null>(null);

  useEffect(() => {
    setLoading(!selectedWard);
  }, [selectedWard]);

  // Fetch data based on active section
  useEffect(() => {
    if (!wardUserId) return;
    const start = format(subDays(new Date(), 29), "yyyy-MM-dd");

    if (activeSection === "medications") {
      Promise.all([
        supabase.from("medications").select("*").eq("user_id", wardUserId),
        supabase.from("medication_logs").select("*").eq("user_id", wardUserId).gte("scheduled_at", `${start}T00:00:00`),
      ]).then(([m, l]) => {
        setMedications(m.data || []);
        setMedLogs(l.data || []);
      });
    } else if (activeSection === "checkins") {
      supabase.from("check_ins").select("*").eq("user_id", wardUserId).gte("scheduled_at", `${start}T00:00:00`).order("scheduled_at")
        .then(({ data }) => setCheckIns(data || []));
    } else if (activeSection === "activity") {
      supabase.from("activity_logs").select("*").eq("user_id", wardUserId).gte("log_date", start).order("log_date")
        .then(({ data }) => setActivityLogs(data || []));
    } else if (activeSection === "vitals") {
      supabase.from("activity_logs").select("log_date,heart_rate,spo2,bp_systolic,bp_diastolic").eq("user_id", wardUserId).gte("log_date", start).order("log_date")
        .then(({ data }) => setVitalData(data || []));
    } else if (activeSection === "nutrition") {
      supabase.from("meal_logs").select("*").eq("user_id", wardUserId).gte("log_date", start).order("log_date")
        .then(({ data }) => setMealLogs(data || []));
    } else if (activeSection === "journeys") {
      supabase.from("journey_reports").select("*").eq("user_id", wardUserId).order("ended_at", { ascending: false }).limit(20)
        .then(({ data }) => setJourneyReports(data || []));
    } else if (activeSection === "lab_tests") {
      supabase.from("lab_orders" as any).select("*").eq("user_id", wardUserId).order("created_at", { ascending: false })
        .then(({ data }) => setLabOrders((data as any) || []));
    } else if (activeSection === "doctor_visit") {
      supabase.from("medical_records")
        .select("id, title, description, record_date, created_at")
        .eq("user_id", wardUserId)
        .eq("record_type", "Doctor's Diagnosis")
        .order("record_date", { ascending: false })
        .limit(20)
        .then(({ data }) => setDoctorReports(data || []));
    }
  }, [wardUserId, activeSection]);

  const buildMedTrend = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
      const dayLogs = medLogs.filter(l => l.scheduled_at?.slice(0, 10) === date);
      return {
        day: format(subDays(new Date(), 6 - i), "EEE"),
        taken: dayLogs.filter(l => l.status === "taken").length,
        taken_late: dayLogs.filter(l => l.status === "taken_late").length,
        missed: dayLogs.filter(l => l.status === "missed" || l.status === "skipped").length,
      };
    });
  };

  const buildCheckInTrend = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
      const dayCIs = checkIns.filter(c => c.scheduled_at?.slice(0, 10) === date);
      return {
        day: format(subDays(new Date(), 6 - i), "EEE"),
        done: dayCIs.filter(c => c.status === "responded" || c.status === "ok").length,
        missed: dayCIs.filter(c => c.status === "missed").length,
      };
    });
  };

  const buildActivityTrend = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
      const entry = activityLogs.find(a => a.log_date === date);
      return {
        day: format(subDays(new Date(), 6 - i), "EEE"),
        steps: entry?.steps || 0,
        calories: entry?.calories || 0,
      };
    });
  };

  const buildVitalsTrend = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
      const entry = vitalData.find(a => a.log_date === date);
      return {
        day: format(subDays(new Date(), 6 - i), "EEE"),
        hr: entry?.heart_rate || 0,
        spo2: entry?.spo2 || 0,
      };
    });
  };

  const buildNutritionTrend = (): NutritionTrendPoint[] => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
      const dayMeals = mealLogs.filter(m => m.log_date === date);
      let sodium = 0;
      let potassium = 0;
      dayMeals.forEach((m: any) => {
        const items = Array.isArray(m.items) ? m.items : [];
        items.forEach((it: any) => {
          sodium += Number(it?.sodium_mg) || 0;
          potassium += Number(it?.potassium_mg) || 0;
        });
      });
      return {
        label: format(subDays(new Date(), 6 - i), "EEE"),
        protein: Math.round(dayMeals.reduce((s: number, m: any) => s + (Number(m.total_protein_g) || 0), 0)),
        fiber: Math.round(dayMeals.reduce((s: number, m: any) => s + (Number(m.total_fiber_g) || 0), 0)),
        sodium: Math.round(sodium),
        potassium: Math.round(potassium),
      };
    });
  };

  const refreshLabOrders = async () => {
    if (!wardUserId) return;
    const { data } = await supabase.from("lab_orders" as any).select("*").eq("user_id", wardUserId).order("created_at", { ascending: false });
    setLabOrders((data as any) || []);
  };

  const handleCheckLabResults = async (order: any) => {
    setCheckingLabResults(order.id);
    try {
      const { data, error } = await supabase.functions.invoke("orange-health", {
        body: {
          action: "test-results",
          primary_patient_number: order.patient_phone,
          order_id: order.id,
        },
      });
      if (error) throw error;
      if (data?.ready && data?.data?.report_url) {
        toast.success("Test report is ready!");
        await refreshLabOrders();
        window.open(data.data.report_url, "_blank");
      } else {
        toast.info(data?.message || "Sample is being processed by the lab. Report not ready yet.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to check report status");
    } finally {
      setCheckingLabResults(null);
    }
  };

  if (loading) {
    return <AppLayout><div className="p-4 text-center text-muted-foreground">Loading...</div></AppLayout>;
  }

  const chartConfigs: Record<string, any> = {
    medications: { taken: { label: "On Time", color: "hsl(var(--success))" }, taken_late: { label: "Late", color: "hsl(45 93% 47%)" }, missed: { label: "Missed", color: "hsl(var(--destructive))" } },
    checkins: { done: { label: "Done", color: "hsl(var(--success))" }, missed: { label: "Missed", color: "hsl(var(--destructive))" } },
    activity: { steps: { label: "Steps", color: "hsl(var(--primary))" }, calories: { label: "Calories", color: "hsl(var(--success))" } },
    vitals: { hr: { label: "Heart Rate", color: "hsl(var(--sos))" }, spo2: { label: "SpO2", color: "hsl(var(--primary))" } },
    nutrition: { calories: { label: "Calories", color: "hsl(var(--primary))" }, protein: { label: "Protein (g)", color: "hsl(var(--success))" } },
  };

  const sections: { id: ReportSection; label: string; icon: any }[] = [
    { id: "medications", label: "Meds", icon: Pill },
    { id: "checkins", label: "Check-iNs", icon: CheckCircle },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "vitals", label: "Vitals", icon: Heart },
    { id: "nutrition", label: "Nutrition", icon: Utensils },
    { id: "journeys", label: "Journeys", icon: Navigation },
    { id: "hospital_visit", label: "Hospital Visit", icon: BriefcaseMedical },
    { id: "analysis", label: "Analysis Reports", icon: FileSearch },
    { id: "lab_tests", label: "Lab Tests", icon: TestTube2 },
    ...(isPrimary ? [{ id: "doctor_visit" as ReportSection, label: "Doctor Visit", icon: Stethoscope }] : []),
  ];

  return (
    <AppLayout>
      <div className="p-4 space-y-4">
        <WardPicker />
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            {wardName}'s Reports
          </h1>
        </div>

        <ReportShareButtons
          title={`${wardName}'s ${activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} Report`}
          subtitle="Guardian Health Report"
          content={`7-day ${activeSection} report for ${wardName}. Generated by Check-iN on ${new Date().toLocaleDateString("en-IN")}.`}
          category={activeSection}
        />

        <div className="flex gap-1 overflow-x-auto pb-1">
          {sections.map(s => (
            <Badge
              key={s.id}
              variant={activeSection === s.id ? "default" : "outline"}
              className="cursor-pointer shrink-0 gap-1"
              onClick={() => setActiveSection(s.id)}
            >
              <s.icon className="w-3 h-3" /> {s.label}
            </Badge>
          ))}
        </div>

        {/* Medications */}
        {activeSection === "medications" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Current Medications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {medications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No medications</p>
                ) : medications.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.dosage} • {(m.schedule_times || []).join(", ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{m.remaining_quantity}/{m.total_quantity} left</p>
                      {m.remaining_quantity <= m.low_stock_threshold && (
                        <Badge variant="destructive" className="text-[10px]">Refill needed</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">7-Day Adherence</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={chartConfigs.medications} className="h-[180px] w-full">
                  <BarChart data={buildMedTrend()} barGap={2}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickLine={false} fontSize={12} />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="taken" stackId="a" fill="var(--color-taken)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="taken_late" stackId="a" fill="var(--color-taken_late)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="missed" stackId="a" fill="var(--color-missed)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Check-ins */}
        {activeSection === "checkins" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">7-Day Check-in Trend</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfigs.checkins} className="h-[200px] w-full">
                <BarChart data={buildCheckInTrend()} barGap={2}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} fontSize={12} />
                  <YAxis hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="done" stackId="a" fill="var(--color-done)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="missed" stackId="a" fill="var(--color-missed)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Activity */}
        {activeSection === "activity" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">7-Day Activity</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfigs.activity} className="h-[200px] w-full">
                <BarChart data={buildActivityTrend()}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} fontSize={12} />
                  <YAxis hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="steps" fill="var(--color-steps)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="calories" fill="var(--color-calories)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Vitals */}
        {activeSection === "vitals" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">7-Day Vitals</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfigs.vitals} className="h-[200px] w-full">
                <LineChart data={buildVitalsTrend()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} fontSize={12} />
                  <YAxis fontSize={10} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="hr" stroke="var(--color-hr)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="spo2" stroke="var(--color-spo2)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Nutrition */}
        {activeSection === "nutrition" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">7-Day Nutrition</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">Nutrition Trend</h3>
              </div>
              <NutritionTrendChart data={buildNutritionTrend()} height={200} />
            </CardContent>
          </Card>
        )}

        {/* Journeys */}
        {activeSection === "journeys" && (
          <div className="space-y-3">
            {journeyReports.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground text-sm">
                  No journey reports yet
                </CardContent>
              </Card>
            ) : (
              journeyReports.map((r) => (
                <JourneyReportCard key={r.id} report={r} />
              ))
            )}
          </div>
        )}

        {/* Hospital Visit */}
        {activeSection === "hospital_visit" && wardUserId && (
          <HospitalVisitTab wardUserId={wardUserId} wardName={wardName} />
        )}

        {/* Analysis Reports */}
        {activeSection === "analysis" && wardUserId && (
          <AnalysisReportTab wardUserId={wardUserId} wardName={wardName} />
        )}

        {/* Doctor Visit Reports — Primary Guardian only */}
        {activeSection === "doctor_visit" && wardUserId && (
          isPrimary ? (
            doctorReports.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground text-sm">
                  No Doctor Visit Reports yet
                </CardContent>
              </Card>
            ) : (
              <Accordion type="single" collapsible className="space-y-2">
                {doctorReports.map((r) => {
                  const visual = tryParseVisualReport(r.description || "");
                  return (
                    <AccordionItem key={r.id} value={r.id} className="border rounded-lg bg-card">
                      <AccordionTrigger className="px-4 py-3 text-left hover:no-underline">
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.record_date ? format(new Date(r.record_date), "dd MMM yyyy") : ""}
                          </p>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-3">
                        <ReportShareButtons
                          title={r.title}
                          subtitle={`${wardName} — Doctor Visit Report`}
                          content={r.description || ""}
                          category="Doctor Visit Report"
                        />
                        {visual ? (
                          <VisualHealthReport report={visual} />
                        ) : (
                          <div className="prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown>{r.description || ""}</ReactMarkdown>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                Doctor Visit Reports are accessible to the Primary Guardian only.
              </CardContent>
            </Card>
          )
        )}
      </div>
    </AppLayout>
  );
};

export default GuardianReports;
