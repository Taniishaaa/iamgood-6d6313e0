import { useState, useMemo } from "react";
import { HelpCircle, Search, Download, ShieldCheck, User, Heart, FileText, AlertTriangle, Bell, Crown, Shield, Settings as SettingsIcon, LogOut } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { guardianFaqSections, GUARDIAN_FAQ_VERSION } from "@/data/guardianFaqData";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import SeoMeta from "@/components/SeoMeta";

const iconMap: Record<string, React.ReactNode> = {
  "shield-check": <ShieldCheck className="w-5 h-5 text-success" />,
  user: <User className="w-5 h-5 text-primary" />,
  heart: <Heart className="w-5 h-5 text-destructive" />,
  "file-text": <FileText className="w-5 h-5 text-primary" />,
  "alert-triangle": <AlertTriangle className="w-5 h-5 text-destructive" />,
  bell: <Bell className="w-5 h-5 text-warning" />,
  crown: <Crown className="w-5 h-5 text-warning" />,
  shield: <Shield className="w-5 h-5 text-primary" />,
  settings: <SettingsIcon className="w-5 h-5 text-primary" />,
};

const GuardianHelp = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    toast.success("Logged out successfully");
    navigate("/login");
  };

  const handleDownloadFaq = () => {
    const lines: string[] = [];
    lines.push(`# Check-iN Guardian Guide — v${GUARDIAN_FAQ_VERSION}`);
    lines.push("");
    lines.push(`_Generated ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}_`);
    lines.push("");
    lines.push("---");
    lines.push("");
    for (const section of guardianFaqSections) {
      lines.push(`## ${section.title}`);
      lines.push("");
      for (const item of section.items) {
        lines.push(`### Q: ${item.question}`);
        lines.push("");
        lines.push(item.answer);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
    lines.push("> For emergencies, always call your local emergency number (112 in India).");
    lines.push("");
    lines.push(`_Check-iN by Future Wave · checkin_support@futurewave.in_`);
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Check-iN-Guardian-Guide-${GUARDIAN_FAQ_VERSION}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Guardian Guide downloaded");
  };

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return guardianFaqSections;
    const q = searchQuery.toLowerCase();
    return guardianFaqSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [searchQuery]);

  return (
    <AppLayout>
      <SeoMeta
        title="Guardian Help Centre"
        description="Check-iN Guardian Help — how to monitor your ward, respond to SOS alerts, track medications, and use the elderly care & emergency alert app."
        canonicalPath="/guardian-help"
      />
      <div className="p-4 space-y-4">
        <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-success" />
              How Check-iN Works for Guardians
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground pt-0">
            <div className="flex gap-3 items-start">
              <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</span>
              <p><strong className="text-foreground">Accept the Nomination:</strong> When a Ward nominates you, opt in via the secure link and OTP.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</span>
              <p><strong className="text-foreground">Watch the Dashboard:</strong> Health Score, vitals, today's appointments and active alerts at a glance.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</span>
              <p><strong className="text-foreground">Respond to Alerts:</strong> SOS, missed check-ins, low battery, geofence exits and more — push & WhatsApp.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-7 h-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold shrink-0">!</span>
              <p><strong className="text-foreground">Hospital Ready:</strong> Generate the Admission Kit PDF with all IDs, insurance & vitals in one tap.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Your guide to using Check-iN as a Guardian.</p>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleDownloadFaq}>
            <Download className="w-4 h-4" />
            Download
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search Guardian FAQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredSections.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No FAQs match "{searchQuery}"</p>
        )}

        {filteredSections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                {iconMap[section.icon] || <HelpCircle className="w-5 h-5 text-primary" />}
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Accordion type="single" collapsible className="w-full">
                {section.items.map((item, idx) => (
                  <AccordionItem key={idx} value={`${section.title}-${idx}`} className="border-border/50">
                    <AccordionTrigger className="text-sm text-left py-3 hover:no-underline">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground pb-3">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}

        <p className="text-xs text-center text-muted-foreground pt-2">
          Guardian Guide version: {GUARDIAN_FAQ_VERSION}
        </p>

        <div className="pt-4 pb-2 space-y-2">
          <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/connect")}>
            <ShieldCheck className="w-4 h-4" />
            Connect an AI Assistant
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/support")}>
            <HelpCircle className="w-4 h-4" />
            Contact Customer Service
          </Button>
          <Button variant="destructive" className="w-full gap-2" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
            Log Out
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default GuardianHelp;
