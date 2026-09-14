import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye, EyeOff, FileText, Shield, Heart, User, Upload, Trash2, Download,
  File, Loader2, Search, Plus, Lock, ShieldCheck, Camera, Printer, Share2, Save, Pill, AlertTriangle, ChevronDown,
  ArrowLeft, ChevronRight, Stethoscope
} from "lucide-react";
import { VAULT_CATEGORIES, type VaultCategory } from "@/lib/vaultCategories";

import ReactMarkdown from "react-markdown";
import VisualHealthReport, { tryParseVisualReport } from "@/components/health-tools/VisualHealthReport";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import AppLayout from "@/components/AppLayout";
import VaultGate from "@/components/VaultGate";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { encrypt, decrypt, hashPin } from "@/lib/encryption";
import { buildLetterheadHtml } from "@/lib/reportPdf";
import DoctorVisitReport from "@/components/health-tools/DoctorVisitReport";
import VaultCategorisedSection from "@/components/vault/VaultCategorisedSection";
import { useVaultReminderScheduler } from "@/hooks/useVaultReminderScheduler";

const RECORD_TYPES = ["Visual Check", "Vaccination Record", "Doctor's Diagnosis", "Lab Report", "Other"];

interface MedicalRecord {
  id: string;
  title: string;
  record_type: string;
  record_date: string | null;
  doctor_name: string | null;
  hospital_name: string | null;
  description: string | null;
  file_name: string | null;
  file_url: string | null;
  created_at: string;
}

interface ProfileViewData {
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  weight_kg: string;
  height_m: string;
  blood_group: string;
  diet_type: string;
  allergies: string[];
  medical_conditions: string[];
  activity_level: string;
  smoking: string;
  alcohol: string;
  dietary_preferences: string[];
  health_goals: string[];
  family_doctor_name: string;
  family_doctor_phone: string;
  emergency_notes: string;
}

interface MedicationView {
  name: string;
  dosage: string;
  frequency: string;
  schedule_times: string[];
  remaining_quantity: number;
  total_quantity: number;
  low_stock_threshold: number;
}

interface GuardianView {
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string | null;
  relation: string | null;
  is_primary: boolean;
}

interface EncryptedDoc {
  id: string;
  doc_type: string;
  encrypted_value: string;
  iv: string;
  salt: string;
}

const DOC_TYPES = [
  { key: "aadhaar", label: "Aadhaar Number", placeholder: "1234 5678 9012" },
  { key: "pan", label: "PAN Number", placeholder: "ABCDE1234F" },
  { key: "passport", label: "Passport Number", placeholder: "A1234567" },
  { key: "driving_license", label: "Driving License", placeholder: "DL-1234567890" },
  { key: "health_insurance_id", label: "Health Insurance ID", placeholder: "Policy number" },
  { key: "life_insurance_id", label: "Life Insurance ID", placeholder: "Policy number" },
  { key: "legal_will", label: "Legal Will", placeholder: "Will reference or details" },
];

const FREQUENCIES: Record<string, string> = {
  once_daily: "Once daily",
  twice_daily: "Twice daily",
  three_daily: "3× daily",
  as_needed: "As needed",
};

interface ParsedDescription {
  originalText: string | null;
  aiAnalysisText: string;
}

const parseDescription = (desc: string): ParsedDescription => {
  const originalMarker = "═══ ORIGINAL DOCUMENT ═══";
  const aiMarker = "═══ AI ANALYSIS ═══";

  if (desc.includes(originalMarker) && desc.includes(aiMarker)) {
    const origIndex = desc.indexOf(originalMarker) + originalMarker.length;
    const aiIndex = desc.indexOf(aiMarker);
    const originalText = desc.substring(origIndex, aiIndex).trim();
    const aiAnalysisText = desc.substring(aiIndex + aiMarker.length).trim();
    return { originalText, aiAnalysisText };
  }

  return { originalText: null, aiAnalysisText: desc.trim() };
};

const RenderRecordDescription = ({ description }: { description: string }) => {
  const { originalText, aiAnalysisText } = parseDescription(description);
  const visual = tryParseVisualReport(aiAnalysisText);

  return (
    <div className="space-y-4">
      {/* Original Document Section (Collapsible) */}
      {originalText && (
        <Collapsible className="border border-border rounded-xl overflow-hidden bg-muted/10">
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/20 hover:bg-muted/30 transition-colors text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              Original Document Content
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="p-3 border-t border-border bg-background">
            <ScrollArea className="max-h-[150px] w-full">
              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed">
                {originalText}
              </pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* AI Analysis / Notes Section */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
          <FileText className="w-3.5 h-3.5 text-primary" />
          Analysis & Notes
        </p>
        {visual ? (
          <VisualHealthReport report={visual} />
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert bg-muted/30 rounded-xl p-4 border border-border/50">
            <ReactMarkdown>{aiAnalysisText}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

const MedicalVaultContent = () => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  useVaultReminderScheduler();

  // --- View Record Dialog ---
  const [viewRecord, setViewRecord] = useState<MedicalRecord | null>(null);
  const [viewSignedUrl, setViewSignedUrl] = useState<string>("");
  const [viewLoading, setViewLoading] = useState(false);

  // --- Records Tab ---
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [recordType, setRecordType] = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [section, setSection] = useState<null | "medical" | "data">(null);
  const [subview, setSubview] = useState<null | "records" | "doctor-report">(null);
  const [dataCategory, setDataCategory] = useState<VaultCategory | null>(null);

  const idleToastShownRef = useRef(false);

  // --- Profile Tab (fully read-only) ---
  const [profileView, setProfileView] = useState<ProfileViewData | null>(null);
  const [profileMeds, setProfileMeds] = useState<MedicationView[]>([]);
  const [profileGuardians, setProfileGuardians] = useState<GuardianView[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [emergencyToken, setEmergencyToken] = useState<string | null>(null);

  // --- Secret Vault Tab ---
  const [encDocs, setEncDocs] = useState<EncryptedDoc[]>([]);
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({});
  const [pinForVault, setPinForVault] = useState("");
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [storedPinHash, setStoredPinHash] = useState("");
  const [addDocDialog, setAddDocDialog] = useState(false);
  const [addDocType, setAddDocType] = useState("");
  const [addDocValue, setAddDocValue] = useState("");
  const [addDocFile, setAddDocFile] = useState<File | null>(null);
  const [addingDoc, setAddingDoc] = useState(false);
  const vaultFileRef = useRef<HTMLInputElement>(null);

  // ===================== RECORDS =====================

  const fetchRecords = useCallback(async () => {
    if (!userId) return;
    setLoadingRecords(true);
    const { data } = await supabase
      .from("medical_records")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setRecords(data ?? []);
    setLoadingRecords(false);
  }, [userId]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const resetForm = () => {
    setTitle(""); setRecordType(""); setRecordDate("");
    setDoctorName(""); setHospitalName(""); setDescription("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!userId) return;
    if (!title || !recordType) { toast.error("Title and type are required"); return; }
    setUploading(true);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (selectedFile) {
        const ext = selectedFile.name.split(".").pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("medical-documents").upload(path, selectedFile);
        if (uploadErr) throw uploadErr;
        fileUrl = path;
        fileName = selectedFile.name;
      }
      const { error } = await supabase.from("medical_records").insert({
        user_id: userId, title, record_type: recordType,
        record_date: recordDate || null, doctor_name: doctorName || null,
        hospital_name: hospitalName || null, description: description || null,
        file_url: fileUrl, file_name: fileName,
      });
      if (error) throw error;
      toast.success("Record saved");
      resetForm();
      setShowUploadForm(false);
      fetchRecords();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (r: MedicalRecord) => {
    if (r.file_url) {
      await supabase.storage.from("medical-documents").remove([r.file_url]);
    }
    await supabase.from("medical_records").delete().eq("id", r.id);
    toast.success("Deleted");
    fetchRecords();
  };

  const handleDownload = async (r: MedicalRecord) => {
    if (!r.file_url) return;
    const { data } = await supabase.storage.from("medical-documents").download(r.file_url);
    if (!data) { toast.error("Download failed"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download = r.file_name || "document";
    a.click();
  };

  const handleShare = async (r: MedicalRecord) => {
    if (!r.file_url) {
      if (navigator.share) {
        try {
          await navigator.share({
            title: r.title,
            text: `${r.record_type} — ${r.title}${r.doctor_name ? ` (Dr. ${r.doctor_name})` : ""}`,
          });
        } catch { /* user cancelled */ }
      } else {
        toast.info("Sharing not supported on this browser");
      }
      return;
    }
    const { data } = await supabase.storage.from("medical-documents").download(r.file_url);
    if (!data) { toast.error("Failed to load file for sharing"); return; }
    const file = new window.File([data], r.file_name || "document", { type: data.type });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: r.title, files: [file] });
      } catch { /* user cancelled */ }
    } else if (navigator.share) {
      try {
        await navigator.share({ title: r.title, text: `${r.record_type}: ${r.title}` });
      } catch { /* user cancelled */ }
    } else {
      toast.info("Sharing not supported on this browser");
    }
  };

  const handleViewRecord = async (r: MedicalRecord) => {
    setViewRecord(r);
    setViewSignedUrl("");
    if (r.file_url) {
      setViewLoading(true);
      try {
        const { data } = await supabase.storage.from("medical-documents").createSignedUrl(r.file_url, 3600);
        if (data?.signedUrl) setViewSignedUrl(data.signedUrl);
      } catch (e) {
        console.error("Failed to get signed URL:", e);
      } finally {
        setViewLoading(false);
      }
    }
  };

  const filteredRecords = records.filter((r) => {
    const matchSearch = !searchQuery || r.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = !filterType || r.record_type === filterType;
    return matchSearch && matchType;
  });

  // ===================== PROFILE (fully read-only) =====================

  const fetchProfileView = useCallback(async () => {
    if (!userId) return;
    setProfileLoading(true);
    const [{ data: prof }, { data: persona }, { data: hp }, { data: meds }, { data: guards }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("nutrition_personas").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("health_profile").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("medications").select("name, dosage, frequency, schedule_times, remaining_quantity, total_quantity, low_stock_threshold").eq("user_id", userId).order("name"),
      supabase.from("guardians").select("guardian_name, guardian_phone, guardian_email, relation, is_primary").eq("user_id", userId).order("is_primary", { ascending: false }),
    ]);

    setProfileView({
      full_name: prof?.full_name || "",
      date_of_birth: prof?.date_of_birth || "",
      gender: (prof as any)?.gender || "",
      phone: prof?.phone || "",
      weight_kg: (prof as any)?.weight_kg?.toString() || "",
      height_m: (prof as any)?.height_m?.toString() || "",
      blood_group: persona?.blood_group || hp?.blood_group || "",
      diet_type: persona?.diet_type || "",
      allergies: persona?.allergies || hp?.allergies || [],
      medical_conditions: persona?.medical_conditions || hp?.chronic_conditions || [],
      activity_level: persona?.activity_level || "",
      smoking: persona?.smoking || "",
      alcohol: persona?.alcohol || "",
      dietary_preferences: persona?.dietary_preferences || [],
      health_goals: persona?.health_goals || [],
      family_doctor_name: hp?.family_doctor_name || "",
      family_doctor_phone: hp?.family_doctor_phone || "",
      emergency_notes: hp?.emergency_notes || "",
    });

    setProfileMeds((meds as MedicationView[]) || []);
    setProfileGuardians((guards as GuardianView[]) || []);
    setProfileLoading(false);
  }, [userId]);

  useEffect(() => { fetchProfileView(); }, [fetchProfileView]);

  // Fetch emergency share token for QR code
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("emergency_share_tokens" as any)
      .select("token")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEmergencyToken((data as any).token);
      });
  }, [userId]);

  // Auto-shut open Medical Vault views after 30s idle for privacy
  useEffect(() => {
    if (section !== "medical" || !subview) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setSubview(null);
        setShowUploadForm(false);
        setSearchQuery("");
        setViewRecord(null);
        if (!idleToastShownRef.current) {
          toast("Closed for privacy");
          idleToastShownRef.current = true;
        }
      }, 30000);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [section, subview]);

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const buildShareText = () => {
    if (!profileView) return "";
    const pv = profileView;
    const userName = pv.full_name || "User";
    return [
      `🚨 EMERGENCY HEALTH CARD — ${userName}`,
      "",
      pv.blood_group ? `Blood Group: ${pv.blood_group}` : "",
      pv.date_of_birth ? `DOB: ${new Date(pv.date_of_birth).toLocaleDateString("en-IN")}` : "",
      pv.phone ? `Phone: ${pv.phone}` : "",
      pv.allergies.length > 0 ? `⚠️ Allergies: ${pv.allergies.join(", ")}` : "",
      pv.medical_conditions.length > 0 ? `Conditions: ${pv.medical_conditions.join(", ")}` : "",
      profileMeds.length > 0 ? `Medications: ${profileMeds.map(m => `${m.name} (${m.dosage})`).join(", ")}` : "",
      pv.family_doctor_name ? `Doctor: ${pv.family_doctor_name}${pv.family_doctor_phone ? ` (${pv.family_doctor_phone})` : ""}` : "",
      profileGuardians.length > 0 ? `Emergency Contacts: ${profileGuardians.map(g => `${g.guardian_name} ${g.guardian_phone}`).join(", ")}` : "",
      "",
      "Generated by Check-iN Emergency Response System",
    ].filter(Boolean).join("\n");
  };

  const buildEmergencyHtml = (includeActionBar = false) => {
    if (!profileView) return "";
    const pv = profileView;
    const userName = pv.full_name || "User";
    const shareText = buildShareText();
    const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    const emailSubject = encodeURIComponent(`Emergency Health Card — ${userName}`);
    const emailBody = encodeURIComponent(shareText);
    const emailUrl = `mailto:?subject=${emailSubject}&body=${emailBody}`;

    const profileUrl = emergencyToken
      ? `${window.location.origin}/e/${emergencyToken}`
      : `${window.location.origin}/medical-vault`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(profileUrl)}&margin=4`;

    const actionBarHtml = includeActionBar ? `
<div class="action-bar" id="actionBar">
  <button onclick="document.getElementById('actionBar').style.display='none';window.print();setTimeout(()=>document.getElementById('actionBar').style.display='flex',500)" class="btn btn-print">🖨️ Print / Save PDF</button>
  <button onclick="window.open('${whatsAppUrl}','_blank')" class="btn btn-whatsapp">💬 WhatsApp</button>
  <button onclick="window.location.href='${emailUrl}'" class="btn btn-email">📧 Email</button>
</div>` : undefined;

    const bodyHtml = `
<div class="qr-section">
  <img src="${qrUrl}" alt="QR Code" width="100" height="100" />
  <div class="qr-text"><strong>📱 Scan for Emergency Profile</strong>First responders can scan this QR code to access the full emergency health profile quickly.</div>
</div>
<div class="section"><div class="section-title">👤 Personal Information</div><div class="section-body">
<div class="row"><span class="label">Name</span><span class="value">${userName}</span></div>
${pv.date_of_birth ? `<div class="row"><span class="label">Date of Birth</span><span class="value">${new Date(pv.date_of_birth).toLocaleDateString("en-IN")}</span></div>` : ""}
${pv.gender ? `<div class="row"><span class="label">Gender</span><span class="value" style="text-transform:capitalize">${pv.gender}</span></div>` : ""}
${pv.phone ? `<div class="row"><span class="label">Phone</span><span class="value">${pv.phone}</span></div>` : ""}
${pv.blood_group ? `<div class="row"><span class="label">Blood Group</span><span class="value"><span class="badge">${pv.blood_group}</span></span></div>` : ""}
</div></div>
${pv.allergies.length > 0 ? `<div class="alert-box"><p>⚠️ ALLERGIES: ${pv.allergies.map(a => `<span class="badge">${a}</span>`).join(" ")}</p></div>` : ""}
${pv.medical_conditions.length > 0 ? `<div class="section"><div class="section-title">🩺 Medical Conditions</div><div class="section-body">${pv.medical_conditions.map(c => `<span class="badge badge-blue">${c}</span>`).join(" ")}</div></div>` : ""}
${profileMeds.length > 0 ? `<div class="section"><div class="section-title">💊 Medications</div><div class="section-body">
<table><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Times</th></tr>${profileMeds.map(m => `<tr><td>${m.name}</td><td>${m.dosage}</td><td>${m.frequency.replace(/_/g, " ")}</td><td>${(m.schedule_times || []).join(", ")}</td></tr>`).join("")}</table>
</div></div>` : ""}
${pv.emergency_notes ? `<div class="section"><div class="section-title">📝 Emergency Notes</div><div class="section-body"><p>${pv.emergency_notes}</p></div></div>` : ""}
${pv.family_doctor_name ? `<div class="section"><div class="section-title">👨‍⚕️ Family Doctor</div><div class="section-body">
<div class="row"><span class="label">Name</span><span class="value">${pv.family_doctor_name}</span></div>
${pv.family_doctor_phone ? `<div class="row"><span class="label">Phone</span><span class="value">${pv.family_doctor_phone}</span></div>` : ""}
</div></div>` : ""}
${profileGuardians.length > 0 ? `<div class="section"><div class="section-title">🛡️ Emergency Contacts</div><div class="section-body">
<table><tr><th>Name</th><th>Relation</th><th>Phone</th><th>Email</th></tr>
${profileGuardians.map(g => `<tr><td>${g.guardian_name}${g.is_primary ? " ⭐" : ""}</td><td>${g.relation || "—"}</td><td>${g.guardian_phone}</td><td>${g.guardian_email || "—"}</td></tr>`).join("")}
</table></div></div>` : ""}`;

    return buildLetterheadHtml({
      title: "EMERGENCY HEALTH CARD",
      subtitle: userName,
      bodyHtml,
      actionBarHtml,
    });
  };

  const openEmergencyCardWindow = () => {
    if (!userId || !profileView) return;
    setGeneratingPdf(true);
    try {
      const html = buildEmergencyHtml(true);
      const cardWindow = window.open("", "_blank");
      if (!cardWindow) {
        toast.error("Pop-up blocked. Please allow pop-ups.");
        return;
      }
      cardWindow.document.write(html);
      cardWindow.document.close();
      toast.success("Emergency card opened — use Print, WhatsApp, or Email buttons");
    } catch (err: any) {
      toast.error("Failed to generate card");
      console.error(err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrintCard = () => openEmergencyCardWindow();

  const handleShareCard = () => openEmergencyCardWindow();

  // ===================== SECRET VAULT =====================

  const fetchEncryptedDocs = useCallback(async () => {
    if (!userId) return;
    const [{ data: docs }, { data: pinData }] = await Promise.all([
      supabase.from("encrypted_documents").select("*").eq("user_id", userId),
      supabase.from("vault_pins").select("pin_hash").eq("user_id", userId).maybeSingle(),
    ]);
    setEncDocs(docs || []);
    if (pinData) setStoredPinHash(pinData.pin_hash);
  }, [userId]);

  useEffect(() => { fetchEncryptedDocs(); }, [fetchEncryptedDocs]);

  const unlockVault = async () => {
    if (!pinForVault || pinForVault.length !== 6) { toast.error("Enter 6-digit PIN"); return; }
    const hash = await hashPin(pinForVault);
    if (hash !== storedPinHash) { toast.error("Incorrect PIN"); setPinForVault(""); return; }
    const decrypted: Record<string, string> = {};
    for (const doc of encDocs) {
      try {
        decrypted[doc.doc_type] = await decrypt(doc.encrypted_value, doc.iv, doc.salt, pinForVault);
      } catch {
        decrypted[doc.doc_type] = "⚠ Decryption failed";
      }
    }
    setDecryptedValues(decrypted);
    setVaultUnlocked(true);
    setPinForVault("");
  };

  const handleAddDoc = async () => {
    if (!userId || !addDocType || !addDocValue.trim()) { toast.error("Fill all fields"); return; }
    setAddingDoc(true);
    try {
      const pin = prompt("Enter your 6-digit vault PIN to encrypt:");
      if (!pin || pin.length !== 6) { toast.error("Valid PIN required"); setAddingDoc(false); return; }
      const hash = await hashPin(pin);
      if (hash !== storedPinHash) { toast.error("Incorrect PIN"); setAddingDoc(false); return; }

      const { ciphertext, iv, salt } = await encrypt(addDocValue.trim(), pin);

      const existing = encDocs.find((d) => d.doc_type === addDocType);
      if (existing) {
        await supabase.from("encrypted_documents").update({
          encrypted_value: ciphertext, iv, salt,
        }).eq("id", existing.id);
      } else {
        await supabase.from("encrypted_documents").insert({
          user_id: userId, doc_type: addDocType,
          encrypted_value: ciphertext, iv, salt,
        });
      }

      // Upload file attachment if provided
      if (addDocFile) {
        const ext = addDocFile.name.split(".").pop();
        const path = `${userId}/vault_${addDocType}.${ext}`;
        await supabase.storage.from("medical-documents").remove([path]);
        await supabase.storage.from("medical-documents").upload(path, addDocFile, { upsert: true });
      }

      toast.success("Document encrypted & saved");
      setAddDocDialog(false);
      setAddDocType("");
      setAddDocValue("");
      setAddDocFile(null);
      setVaultUnlocked(false);
      setDecryptedValues({});
      fetchEncryptedDocs();
    } catch {
      toast.error("Encryption failed");
    } finally {
      setAddingDoc(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    await supabase.from("encrypted_documents").delete().eq("id", id);
    toast.success("Document deleted");
    setDecryptedValues({});
    setVaultUnlocked(false);
    fetchEncryptedDocs();
  };

  // ===================== RENDER =====================

  const InfoRow = ({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) => (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={`font-medium text-sm ${capitalize ? "capitalize" : ""}`}>{value || "—"}</span>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Secure Vault</h1>
          <p className="text-xs text-muted-foreground">Your encrypted health records & personal data</p>
        </div>
      </div>

      {/* ========== TILES ========== */}
      {!section && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setSection("medical"); setSubview(null); }}
            className="flex flex-col items-center gap-2 p-6 rounded-xl border border-border hover:border-primary/30 transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Heart className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium">Medical Vault</span>
            <span className="text-[11px] text-muted-foreground text-center">Records & Dr. Reports</span>
          </button>
          <button
            onClick={() => { setSection("data"); setDataCategory(null); }}
            className="flex flex-col items-center gap-2 p-6 rounded-xl border border-border hover:border-primary/30 transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium">Data Vault</span>
            <span className="text-[11px] text-muted-foreground text-center">IDs, banks, investments & more</span>
          </button>
        </div>
      )}

      {/* ========== MEDICAL VAULT ========== */}
      {section === "medical" && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2"
            onClick={() => { if (subview) setSubview(null); else setSection(null); }}>
            <ArrowLeft className="w-4 h-4" /> {subview ? "Medical Vault" : "Secure Vault"}
          </Button>

          {!subview && (
            <div className="space-y-2">
              {[
                { key: "records" as const, label: "Records", desc: "Uploaded reports, scans & vaccination records", icon: FileText },
                { key: "doctor-report" as const, label: "Dr. Reports", desc: "Doctor visit summaries & diagnoses", icon: Stethoscope },
              ].map((item) => (
                <Card key={item.key} className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSubview(item.key)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {subview === "records" && (
            <div className="space-y-3">

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Search records..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 text-base"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => setShowUploadForm(!showUploadForm)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex gap-1 flex-wrap">
            <Badge variant={filterType ? "outline" : "default"} className="cursor-pointer text-xs"
              onClick={() => setFilterType(null)}>All</Badge>
            {RECORD_TYPES.map((t) => (
              <Badge key={t} variant={filterType === t ? "default" : "outline"}
                className="cursor-pointer text-xs" onClick={() => setFilterType(t)}>{t}</Badge>
            ))}
          </div>

          {showUploadForm && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" /> Upload Record
                </h3>
                <Input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} className="text-base" />
                <Select value={recordType} onValueChange={setRecordType}>
                  <SelectTrigger><SelectValue placeholder="Record type *" /></SelectTrigger>
                  <SelectContent position="item-aligned">
                    {RECORD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} className="text-base" />
                  <Input placeholder="Doctor" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="text-base" />
                </div>
                <Input placeholder="Hospital / Clinic" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} className="text-base" />
                <Textarea placeholder="Notes..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                <Input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
                <div className="flex gap-2">
                  <Button onClick={handleUpload} disabled={uploading || !title || !recordType} className="flex-1">
                    {uploading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</>
                      : <><Upload className="w-4 h-4 mr-1" /> Save</>}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file"; input.accept = "image/*"; input.capture = "environment";
                    input.onchange = (e) => setSelectedFile((e.target as HTMLInputElement).files?.[0] || null);
                    input.click();
                  }}>
                    <Camera className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loadingRecords ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {records.length === 0 ? "No records yet. Tap + to add your first." : "No matching records."}
            </p>
          ) : (
            filteredRecords.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <File className="w-8 h-8 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{r.record_type}</Badge>
                      {r.record_date && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(r.record_date).toLocaleDateString("en-IN")}
                        </span>
                      )}
                    </div>
                    {r.doctor_name && <p className="text-[10px] text-muted-foreground">{r.doctor_name}</p>}
                    {r.hospital_name && <p className="text-[10px] text-muted-foreground">{r.hospital_name}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleViewRecord(r)} title="View">
                      <Eye className="w-3 h-3" />
                    </Button>
                    {r.file_url && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownload(r)} title="Save As">
                        <Save className="w-3 h-3" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleShare(r)} title="Share">
                      <Share2 className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
            </div>
          )}

          {subview === "doctor-report" && (
            <div className="space-y-3">

          <DoctorVisitReport />
          {(() => {
            const drRecords = records
              .filter((r) => r.record_type === "Doctor's Diagnosis")
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            if (drRecords.length === 0) {
              return (
                <Card>
                  <CardContent className="p-6 text-center">
                    <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No doctor visit reports yet — tap Generate above.
                    </p>
                  </CardContent>
                </Card>
              );
            }
            return drRecords.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <FileText className="w-8 h-8 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{r.record_type}</Badge>
                      {r.record_date && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(r.record_date).toLocaleDateString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleViewRecord(r)} title="View">
                      <Eye className="w-3 h-3" />
                    </Button>
                    {r.file_url && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownload(r)} title="Save As">
                        <Save className="w-3 h-3" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleShare(r)} title="Share">
                      <Share2 className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ));
          })()}
            </div>
          )}
        </div>
      )}

      {/* ========== DATA VAULT ========== */}
      {section === "data" && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2"
            onClick={() => { setSection(null); setDataCategory(null); }}>
            <ArrowLeft className="w-4 h-4" /> Secure Vault
          </Button>

          {!storedPinHash ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Set up your vault PIN first (it was created when you unlocked this page).
            </p>
          ) : !vaultUnlocked ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Data Vault
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  AES-256-GCM encrypted. Only you can decrypt with your vault PIN.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Enter your 6-digit vault PIN to view or add encrypted entries.
                </p>
                <Input
                  type="password" maxLength={6} inputMode="numeric"
                  value={pinForVault} placeholder="● ● ● ● ● ●"
                  onChange={(e) => setPinForVault(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && pinForVault.length === 6 && unlockVault()}
                  className="text-base"
                />
                <Button onClick={unlockVault} disabled={pinForVault.length !== 6} className="w-full">
                  <Lock className="w-4 h-4 mr-2" /> Unlock Vault
                </Button>
              </CardContent>
            </Card>
          ) : !dataCategory ? (
            <div className="space-y-2">
              {VAULT_CATEGORIES.map((c) => (
                <Card key={c.key} className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setDataCategory(c.key)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Lock className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.emptyHint}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setDataCategory(null)}>
                <ArrowLeft className="w-4 h-4" />
                {VAULT_CATEGORIES.find((c) => c.key === dataCategory)?.label}
              </Button>
              <VaultCategorisedSection userId={userId!} pin={pinForVault} category={dataCategory} />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Zero-knowledge AES-256-GCM encryption
          </p>
        </div>
      )}


      {/* View Record Dialog */}
      <Dialog open={!!viewRecord} onOpenChange={(open) => { if (!open) { setViewRecord(null); setViewSignedUrl(""); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {viewRecord?.title}
            </DialogTitle>
            <DialogDescription>
              {viewRecord?.record_type}
              {viewRecord?.record_date && ` · ${new Date(viewRecord.record_date).toLocaleDateString("en-IN")}`}
            </DialogDescription>
          </DialogHeader>
          {viewRecord && (
            <div className="space-y-4">
              {/* Details */}
              <div className="space-y-1">
                {viewRecord.doctor_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Doctor</span>
                    <span className="font-medium">{viewRecord.doctor_name}</span>
                  </div>
                )}
                {viewRecord.hospital_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hospital / Clinic</span>
                    <span className="font-medium">{viewRecord.hospital_name}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {viewRecord.description && (
                <RenderRecordDescription description={viewRecord.description} />
              )}

              {/* Attachment */}
              {viewRecord.file_name && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">📎 Attachment</p>
                  <p className="text-sm font-medium mb-2">{viewRecord.file_name}</p>
                  {viewLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading file…
                    </div>
                  ) : viewSignedUrl ? (
                    <div className="space-y-2">
                      {/\.(jpe?g|png|webp|gif)$/i.test(viewRecord.file_name || "") && (
                        <img src={viewSignedUrl} alt={viewRecord.file_name || "attachment"} className="w-full rounded-lg border" />
                      )}
                      {/\.pdf$/i.test(viewRecord.file_name || "") && (
                        <iframe src={viewSignedUrl} className="w-full h-[400px] border-none rounded-lg" title="PDF preview" />
                      )}
                      <a
                        href={viewSignedUrl}
                        download={viewRecord.file_name || "document"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Download className="w-4 h-4" /> Download File
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">File not available</p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { if (viewRecord) handleShare(viewRecord); }}>
                  <Share2 className="w-3.5 h-3.5 mr-1" /> Share
                </Button>
                {viewRecord.file_url && (
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { if (viewRecord) handleDownload(viewRecord); }}>
                    <Save className="w-3.5 h-3.5 mr-1" /> Save As
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      <Dialog open={addDocDialog} onOpenChange={setAddDocDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Encrypted Document</DialogTitle>
            <DialogDescription>
              This data will be encrypted with AES-256-GCM before storage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Document Type</Label>
              <Select value={addDocType} onValueChange={setAddDocType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent position="item-aligned">
                  {DOC_TYPES.filter(({ key }) => !encDocs.find((d) => d.doc_type === key)).map(({ key, label }) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value</Label>
              <Input
                placeholder={DOC_TYPES.find((d) => d.key === addDocType)?.placeholder || "Enter value"}
                value={addDocValue} onChange={(e) => setAddDocValue(e.target.value)}
                className="text-base"
              />
            </div>
            <div>
              <Label>Upload Document (optional)</Label>
              <Input
                ref={vaultFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={(e) => setAddDocFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Attach a scan or photo of the document</p>
            </div>
            <Button onClick={handleAddDoc} disabled={addingDoc || !addDocType || !addDocValue.trim()} className="w-full">
              {addingDoc ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Encrypting...</>
                : <><ShieldCheck className="w-4 h-4 mr-1" /> Encrypt & Save</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MedicalVault = () => (
  <AppLayout>
    <VaultGate title="Secure Vault">
      <MedicalVaultContent />
    </VaultGate>
  </AppLayout>
);

export default MedicalVault;
