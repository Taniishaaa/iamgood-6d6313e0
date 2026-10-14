import { Pill, Stethoscope, Ambulance, Activity, ScanFace, HeartPulse, Apple, Wrench, FileText, Upload, Search, Info, Phone, ChevronRight, ArrowLeft, ShieldAlert, ShieldCheck, Heart, Lock, TestTube, Smile, Receipt, Wallet, HeartHandshake } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import MedicationManager from "@/components/medications/MedicationManager";
import AmbulanceBooking from "@/components/AmbulanceBooking";
import ActivityTracker from "@/components/ActivityTracker";
import NutritionAdvisor from "@/components/NutritionAdvisor";
import WellnessTracker from "@/components/WellnessTracker";
import HealthServices from "@/components/HealthServices";
import FaceScan from "@/components/FaceScan";
import VitalsMonitor from "@/components/VitalsMonitor";
import DoctorVisitReport from "@/components/health-tools/DoctorVisitReport";

import DocumentAnalyzer from "@/components/health-tools/DocumentAnalyzer";
import HospitalBillAnalyzer from "@/components/health-tools/HospitalBillAnalyzer";
import SymptomChecker from "@/components/health-tools/SymptomChecker";
import MedicationInfo from "@/components/health-tools/MedicationInfo";
import TeleConsult from "@/components/health-tools/TeleConsult";
import EmergencyFirstAid from "@/components/health-tools/EmergencyFirstAid";
import UrineCheck from "@/components/health-tools/UrineCheck";
import TongueAnalysis from "@/components/health-tools/TongueAnalysis";
import OrangeLabTests from "@/components/health-tools/OrangeLabTests";
import UpgradeDialog from "@/components/UpgradeDialog";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import useRefillDue from "@/hooks/useRefillDue";

const healthTools = [
  { icon: Pill, label: "Tablets", color: "bg-primary/10 text-primary" },
  { icon: Stethoscope, label: "Health Tools", color: "bg-success/10 text-success" },
  { icon: Ambulance, label: "Ambulance", color: "bg-sos/10 text-sos" },
  { icon: HeartPulse, label: "Wellness Hub", color: "bg-primary/10 text-primary" },
  { icon: ShieldCheck, label: "Vault", color: "bg-sos/10 text-sos" },
  { icon: ShieldAlert, label: "Emergency First Aid", color: "bg-destructive/10 text-destructive" },
];


const healthToolsSubItems = [
  { icon: TestTube, label: "Home Lab Tests", desc: "Doorstep diagnostic sample collection by Orange Health Labs" },
  { icon: FileText, label: "Doctor Visit Report", desc: "Generate health summary for doctor visits" },
  { icon: Receipt, label: "Hospital Bill Analyzer", desc: "Check bill for duplicates & overcharging" },
];


const wellnessHubSubItems = [
  { icon: Activity, label: "Activity", desc: "Steps, exercise & daily movement" },
  { icon: HeartPulse, label: "Mindfulness", desc: "Mood, sleep & mindfulness tracking" },
  { icon: Apple, label: "Nutrition", desc: "Meal logging & AI nutrition advice" },
];

const subToolComponents: Record<string, React.FC> = {
  "Home Lab Tests": OrangeLabTests,
  "Doctor Visit Report": DoctorVisitReport,
  
  "Document Analyzer": DocumentAnalyzer,
  "Hospital Bill Analyzer": HospitalBillAnalyzer,
  "Symptom Checker": SymptomChecker,
  "Medication Info": MedicationInfo,
  "Tele-Consult": TeleConsult,
  "Emergency First Aid": EmergencyFirstAid,
  "Urine Analysis": UrineCheck,
  "Tongue Analysis": TongueAnalysis,
  "Face Scan Analysis": FaceScan,
  "Activity": ActivityTracker,
  "Mindfulness": WellnessTracker,
  "Nutrition": NutritionAdvisor,
};

// Map sub-tool labels to their feature-gate keys (where they differ)
const subFeatureKey: Record<string, string> = {
  "Face Scan Analysis": "Face Scan",
};

const toolComponents: Record<string, React.FC<any>> = {
  "Tablets": MedicationManager,
  "Ambulance": AmbulanceBooking,
  "Vitals": VitalsMonitor,
  "Emergency First Aid": EmergencyFirstAid,
};

const HUB_TOOLS = ["Health Tools", "Wellness Hub"];

const hubConfig: Record<string, { items: typeof healthToolsSubItems }> = {
  "Health Tools": { items: healthToolsSubItems },
  "Wellness Hub": { items: wellnessHubSubItems },
};

// Legacy deep-link support: redirect old ?tool=X values to their new hub
const legacyToolRedirect: Record<string, string> = {
  "Activity": "Wellness Hub",
  "Wellness": "Wellness Hub",
  "Nutrition": "Wellness Hub",
  "Face Scan": "Quick Visual Checks",
  "Urine Check": "Quick Visual Checks",
  "Tongue Check": "Quick Visual Checks",
  // Unpublished tools (code kept) fall back to the Health Tools list
  "Document Analyzer": "Health Tools",
  "Symptom Checker": "Health Tools",
  "Medication Info": "Health Tools",
  "Tele-Consult": "Health Tools",
};

const MyHealth = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedSubTool, setSelectedSubTool] = useState<string | null>(null);
  const [returnToRoute, setReturnToRoute] = useState<string | null>(null);
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined);
  const { canAccess, gate, upgradeDialogOpen, upgradeFeature, requiredPlan, upgradeDescription, closeUpgradeDialog } = useFeatureGate();
  const refillDue = useRefillDue();

  useEffect(() => {
    const tool = searchParams.get("tool");
    const rTo = searchParams.get("returnTo");
    const tab = searchParams.get("tab");
    if (!tool) return;
    const redirected = legacyToolRedirect[tool] ?? tool;
    if (toolComponents[redirected] || HUB_TOOLS.includes(redirected)) {
      setSelectedTool(redirected);
      if (tab) setInitialTab(tab);
      if (rTo) setReturnToRoute(`/${rTo}`);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleToolClick = (label: string) => {
    if (label === "Vault") {
      gate("Vault", () => navigate("/medical-vault"));
    } else if (label === "Financial Healthcare") {
      gate("Financial Healthcare", () => navigate("/financial-health"));
    } else if (label === "Personal Healthcare") {
      navigate("/personal-healthcare");
    } else {
      gate(label, () => setSelectedTool(label));
    }
  };

  const handleSubToolClick = (label: string) => {
    const gateKey = subFeatureKey[label] ?? label;
    gate(gateKey, () => setSelectedSubTool(label));
  };

  if (selectedSubTool) {
    const SubToolComponent = subToolComponents[selectedSubTool];
    return (
      <AppLayout>
        <div className="p-4 space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedSubTool(null)} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> {selectedSubTool}
          </Button>
          {SubToolComponent && <SubToolComponent />}
        </div>
      </AppLayout>
    );
  }

  if (selectedTool && !HUB_TOOLS.includes(selectedTool)) {
    const ToolComponent = toolComponents[selectedTool];
    return (
      <AppLayout>
        <div className="p-4 space-y-4">
          <Button variant="ghost" size="sm" onClick={() => {
            if (returnToRoute) navigate(returnToRoute);
            else setSelectedTool(null);
          }} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> {selectedTool}
          </Button>
          {ToolComponent && <ToolComponent initialTab={initialTab} />}
        </div>
      </AppLayout>
    );
  }

  if (selectedTool && HUB_TOOLS.includes(selectedTool)) {
    const items = hubConfig[selectedTool].items;
    return (
      <AppLayout>
        <div className="p-4 space-y-4">
          <Button variant="ghost" size="sm" onClick={() => {
            if (returnToRoute) navigate(returnToRoute);
            else setSelectedTool(null);
          }} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> {selectedTool}
          </Button>
          <div className="space-y-2">
            {items.map((item) => {
              const gateKey = subFeatureKey[item.label] ?? item.label;
              const locked = !canAccess(gateKey);
              return (
                <Card key={item.label} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleSubToolClick(item.label)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    {locked ? (
                      <Lock className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
        <UpgradeDialog
          open={upgradeDialogOpen}
          onOpenChange={(open) => !open && closeUpgradeDialog()}
          featureName={upgradeFeature}
          requiredPlan={requiredPlan}
          description={upgradeDescription}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-bold">My Health</h1>
        <div className="grid grid-cols-3 gap-3">
          {healthTools.map((tool) => {
            const locked = !canAccess(tool.label);
            return (
              <button
                key={tool.label}
                onClick={() => handleToolClick(tool.label)}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                  tool.label === "Tablets" && refillDue
                    ? "border-destructive ring-2 ring-destructive shadow-[0_0_12px_hsl(var(--destructive))]"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-12 h-12 rounded-full ${tool.color} flex items-center justify-center`}>
                  <tool.icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-center">{tool.label}</span>
                {locked && (
                  <Lock className="absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <UpgradeDialog
        open={upgradeDialogOpen}
        onOpenChange={(open) => !open && closeUpgradeDialog()}
        featureName={upgradeFeature}
        requiredPlan={requiredPlan}
        description={upgradeDescription}
      />
    </AppLayout>
  );
};

export default MyHealth;
