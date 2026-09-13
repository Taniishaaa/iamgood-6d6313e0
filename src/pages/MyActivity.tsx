import { Activity, HeartPulse, Pill, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import VitalsMonitor from "@/components/VitalsMonitor";
import { useLiveDashboardStats } from "@/hooks/useLiveDashboardStats";
import useRefillDue from "@/hooks/useRefillDue";
import useMedicationDue from "@/hooks/useMedicationDue";

const MyActivity = () => {
  const navigate = useNavigate();
  const stats = useLiveDashboardStats();
  const refillDue = useRefillDue();
  const medDue = useMedicationDue();
  const medsAlert = refillDue || medDue;

  const sections = [
    {
      key: "checkins",
      label: "Check-ins",
      icon: CheckCircle2,
      color: "text-success",
      value: `${stats.checkInsCompleted}`,
      suffix: `/${stats.checkInsTotal}`,
      onClick: () => navigate("/dashboard"),
    },
    {
      key: "health",
      label: "Health",
      icon: HeartPulse,
      color: "text-primary",
      value: `${stats.healthScore}`,
      suffix: "/100",
      onClick: () => navigate("/health-passport"),
    },
    {
      key: "meds",
      label: "Meds",
      icon: Pill,
      color: "text-warning",
      value: `${stats.medsCompleted}`,
      suffix: `/${stats.medsTotal || 0}`,
      alert: true,
      onClick: () => navigate("/my-health?tool=Tablets&returnTo=my-activity"),
    },
  ];

  return (
    <AppLayout>
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" /> My Activity
        </h1>

        {sections.map((s) => (
          <Card key={s.key} className="cursor-pointer hover:shadow-md transition-shadow" onClick={s.onClick}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                <s.icon className={`w-6 h-6 ${s.color}`} />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold flex items-center gap-2">
                  {s.label}
                  {(s as any).alert && medsAlert && (
                    <span className="min-w-[18px] h-[18px] px-1 text-[11px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center animate-pulse">!</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">Today</p>
              </div>
              <div className={`text-2xl font-bold ${s.color}`}>
                {s.value}
                <span className="text-sm text-muted-foreground font-normal">{s.suffix}</span>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="pt-2">
          <h2 className="text-lg font-semibold mb-2">Vitals</h2>
          <VitalsMonitor />
        </div>
      </div>
    </AppLayout>
  );
};

export default MyActivity;
