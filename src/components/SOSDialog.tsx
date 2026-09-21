import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Phone, MapPin, X, Droplets, AlertCircle, Stethoscope, Pill, Users, MessageCircle, Mail, Loader2, CheckCircle2, User, Heart, Calendar, Share2, Printer, Download, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { buildLetterheadHtml } from "@/lib/reportPdf";

interface SOSDialogProps {
  open: boolean;
  onClose: () => void;
  isPracticeMode?: boolean;
}

interface MedicalInfo {
  bloodGroup: string | null;
  allergies: string[];
  conditions: string[];
  medications: string[];
  doctorName: string | null;
  familyDoctorName: string | null;
  familyDoctorPhone: string | null;
}

interface MedicationDetail {
  name: string;
  dosage: string;
}

interface Guardian {
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string | null;
  relation: string | null;
  is_primary: boolean;
  status?: string;
}

interface MedHistoryEntry {
  type: string;
  reason: string;
  hospital_name: string | null;
  start_date: string | null;
  end_date: string | null;
  treatment: string | null;
  doctor_name: string | null;
}

const SOSDialog = ({ open, onClose, isPracticeMode = false }: SOSDialogProps) => {
  const { session } = useAuth();
  const { triggerSOS, cancelSOS, activeSosId } = useApp();

  const [medical, setMedical] = useState<MedicalInfo>({
    bloodGroup: null, allergies: [], conditions: [], medications: [], doctorName: null,
    familyDoctorName: null, familyDoctorPhone: null,
  });
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [medicationDetails, setMedicationDetails] = useState<MedicationDetail[]>([]);
  const [timeLeft, setTimeLeft] = useState(10);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [deliverySummary, setDeliverySummary] = useState<{
    status: "success" | "partial" | "failed";
    title: string;
    detail: string;
    selfTargetedPhones: string[];
    recipients?: import("@/contexts/AppContext").SOSRecipientReport[];
  } | null>(null);
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userDob, setUserDob] = useState("");
  const [userGender, setUserGender] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'acquiring' | 'secured' | 'failed'>('idle');
  const [healthData, setHealthData] = useState<{ activity: any; wellness: any } | null>(null);
  const [emergencyToken, setEmergencyToken] = useState<string | null>(null);
  const [medicalHistory, setMedicalHistory] = useState<MedHistoryEntry[]>([]);
  const countingRef = useRef(true);
  const hasSentRef = useRef(false);

  const sentRef = useRef(false);
  const activeSosIdRef = useRef<string | null>(null);

  useEffect(() => {
    sentRef.current = sent;
  }, [sent]);

  useEffect(() => {
    activeSosIdRef.current = activeSosId;
  }, [activeSosId]);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;
    const uid = session.user.id;

    const [hpRes, gRes, apRes, profileRes, activityRes, wellnessRes, medsRes, tokenRes, npRes, historyRes] = await Promise.all([
      supabase.from("health_profile").select("blood_group, allergies, chronic_conditions, current_medications, family_doctor_name, family_doctor_phone").eq("user_id", uid).maybeSingle(),
      supabase.from("guardians").select("guardian_name, guardian_phone, guardian_email, relation, is_primary, status").eq("user_id", uid).in("status", ["accepted", "pending"]).order("is_primary", { ascending: false }),
      supabase.from("appointments").select("doctor_name").eq("user_id", uid).order("start_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("profiles").select("full_name, phone, date_of_birth, gender").eq("id", uid).maybeSingle(),
      supabase.from("activity_logs").select("heart_rate, spo2, steps, exercise_minutes").eq("user_id", uid).order("log_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("wellness_logs").select("mood, stress_level, energy_level").eq("user_id", uid).order("log_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("medications").select("name, dosage").eq("user_id", uid),
      supabase.from("emergency_share_tokens").select("token").eq("user_id", uid).eq("is_active", true).maybeSingle(),
      supabase.from("nutrition_personas").select("blood_group, allergies, medical_conditions").eq("user_id", uid).maybeSingle(),
      supabase.from("medical_history").select("type, reason, hospital_name, doctor_name, start_date, end_date, treatment").eq("user_id", uid).order("start_date", { ascending: false }),
    ]);

    const hp = hpRes.data;
    const np = npRes.data;

    setMedical({
      bloodGroup: hp?.blood_group || (np as any)?.blood_group || null,
      allergies: (hp?.allergies?.length ? hp.allergies : (np as any)?.allergies) ?? [],
      conditions: (hp?.chronic_conditions?.length ? hp.chronic_conditions : (np as any)?.medical_conditions) ?? [],
      medications: hp?.current_medications ?? [],
      doctorName: apRes.data?.doctor_name ?? null,
      familyDoctorName: (hp as any)?.family_doctor_name ?? null,
      familyDoctorPhone: (hp as any)?.family_doctor_phone ?? null,
    });
    setGuardians(gRes.data ?? []);
    setMedicationDetails(medsRes.data ?? []);
    setUserName(profileRes.data?.full_name ?? "User");
    setUserPhone(profileRes.data?.phone ?? "");
    setUserDob(profileRes.data?.date_of_birth ?? "");
    setUserGender(profileRes.data?.gender ?? "");
    setEmergencyToken(tokenRes.data?.token ?? null);
    setMedicalHistory((historyRes.data ?? []) as MedHistoryEntry[]);

    // Store latest health data for the SOS message
    setHealthData({
      activity: activityRes.data,
      wellness: wellnessRes.data,
    });

    if (navigator.geolocation) {
      setGpsStatus('acquiring');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat, lng });
          setGpsStatus('secured');

          // If SOS has already been sent, patch the DB and send a follow-up WhatsApp/SMS
          if (sentRef.current && activeSosIdRef.current) {
            console.log("GPS resolved late. Patching SOS event:", activeSosIdRef.current);
            await supabase
              .from('sos_events')
              .update({ latitude: lat, longitude: lng })
              .eq('id', activeSosIdRef.current);

            // Send follow-up details to guardians
            const currentUserName = profileRes.data?.full_name || "User";
            const updateMessage = `📍 UPDATE: Live location secured for ${currentUserName}: https://maps.google.com/?q=${lat},${lng}`;
            
            const { data: guardianRows } = await supabase
              .from("guardians")
              .select("guardian_email, guardian_phone")
              .eq("user_id", uid)
              .eq("status", "accepted");

            const guardian_emails = (guardianRows ?? []).map((g: any) => g.guardian_email).filter(Boolean);
            const guardian_phones = (guardianRows ?? []).map((g: any) => g.guardian_phone).filter(Boolean);

            await supabase.functions.invoke("send-sos-alert", {
              body: {
                user_id: uid,
                message: updateMessage,
                guardian_emails,
                guardian_phones,
                user_name: currentUserName,
              },
            });
          }
        },
        () => {
          setLocation(null);
          setGpsStatus('failed');
        },
        { timeout: 15000, enableHighAccuracy: true }
      );
    } else {
      setGpsStatus('failed');
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (open) {
      fetchData();
      countingRef.current = true;
      hasSentRef.current = false;
      setTimeLeft(10);
      setSent(false);
      setSending(false);
      setIsOfflineFallback(false);
      setDeliverySummary(null);
    } else {
      countingRef.current = false;
    }
  }, [open, fetchData]);

  useEffect(() => {
    if (!open || timeLeft <= 0) return;
    const timer = setTimeout(() => {
      if (countingRef.current) setTimeLeft((t) => t - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [open, timeLeft]);

  const vibrate = (pattern: number | number[]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  const buildSOSMessage = useCallback(() => {
    let msg = isPracticeMode ? `🧪 PRACTICE SOS ALERT from ${userName}!` : `🚨 SOS ALERT from ${userName}!`;
    if (userPhone) msg += `\n📞 Phone: ${userPhone}`;
    if (userDob) msg += `\n🎂 Age: ${Math.floor((Date.now() - new Date(userDob).getTime()) / 31557600000)} years`;
    if (location) {
      msg += `\n📍 Location: https://maps.google.com/?q=${location.lat},${location.lng}`;
    }
    if (medical.bloodGroup) msg += `\n🩸 Blood Type: ${medical.bloodGroup}`;
    if (medical.allergies.length > 0) msg += `\n⚠️ Allergies: ${medical.allergies.join(", ")}`;
    if (medical.conditions.length > 0) msg += `\n💊 Conditions: ${medical.conditions.join(", ")}`;
    if (medical.medications.length > 0) msg += `\n💊 Medications: ${medical.medications.join(", ")}`;
    if (medical.familyDoctorName) {
      msg += `\n👨‍⚕️ Family Doctor: ${medical.familyDoctorName}`;
      if (medical.familyDoctorPhone) msg += ` (${medical.familyDoctorPhone})`;
    }
    if (healthData?.activity) {
      const a = healthData.activity;
      if (a.heart_rate) msg += `\n❤️ Last Heart Rate: ${a.heart_rate} bpm`;
      if (a.spo2) msg += `\n🫁 SpO2: ${a.spo2}%`;
      if (a.steps) msg += `\n🚶 Steps Today: ${a.steps}`;
    }
    if (healthData?.wellness) {
      const w = healthData.wellness;
      if (w.mood) msg += `\n😊 Mood: ${w.mood}`;
      if (w.stress_level) msg += `\n😰 Stress Level: ${w.stress_level}/5`;
    }
    msg += "\n\n⚠️ Please respond immediately!";
    return msg;
  }, [userName, userPhone, userDob, location, medical, isPracticeMode, healthData]);

  const getWhatsAppLink = useCallback((phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const phoneWithCode = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;
    return `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(buildSOSMessage())}`;
  }, [buildSOSMessage]);

  const getSmsLink = useCallback(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const separator = isIOS ? '&' : '?';
    // Combine all guardian phones into a single string
    const numbers = guardians
      .map(g => g.guardian_phone.replace(/[^0-9]/g, ""))
      .filter(p => p.length >= 10)
      .join(isIOS ? "," : ";"); // iOS uses comma, Android usually uses semicolon
    return `sms:${numbers}${separator}body=${encodeURIComponent(buildSOSMessage())}`;
  }, [guardians, buildSOSMessage]);

  const sendAlerts = useCallback(async () => {
    if (hasSentRef.current) return;
    hasSentRef.current = true;
    setSending(true);
    vibrate([200, 100, 200, 100, 400]);

    const message = buildSOSMessage();

    if (isPracticeMode) {
      setSending(false);
      setSent(true);
      toast.success("Practice SOS complete! No real alerts were sent.");
      setDeliverySummary({
        status: "success",
        title: "Practice Mode Complete",
        detail: "This was a test run. Your guardians were NOT notified and emergency services were NOT contacted.",
        selfTargetedPhones: [],
      });
      return;
    }

    if (!navigator.onLine) {
      setSending(false);
      setIsOfflineFallback(true);
      return;
    }

    try {
      const result = await triggerSOS({
        message,
        doctorName: medical.familyDoctorName,
        userName,
      });

      const delivery = result.delivery;
      const invokeError = result.invokeError;

      if (invokeError) {
        toast.error(`SOS backend failed: ${invokeError} — opening WhatsApp as backup`);
        setDeliverySummary({
          status: "failed",
          title: "SOS could not be sent",
          detail: `Backend error: ${invokeError}. Opening WhatsApp as a manual backup.`,
          selfTargetedPhones: [],
        });
        guardians.forEach((g, i) => {
          setTimeout(() => window.open(getWhatsAppLink(g.guardian_phone), "_blank"), i * 500);
        });
      } else if (delivery) {
        const whatsappOk = (delivery.whatsappAccepted ?? delivery.whatsappQueued) > 0;
        const smsOk = (delivery.smsAccepted ?? delivery.smsQueued) > 0;
        const selfTargeted = delivery.selfTargetedPhones ?? [];
        const recipients = delivery.recipients;

        if (delivery.recipientCount === 0) {
          setDeliverySummary({
            status: "failed",
            title: "No SOS message was delivered",
            detail: selfTargeted.length > 0
              ? `Your guardian's phone (${selfTargeted.join(", ")}) is the same as the WhatsApp sender number. MSG91 cannot deliver a message from the sender to itself. Update the guardian's phone in My Profile to a different mobile number.`
              : (delivery.errors.recipients || "No accepted guardians with valid phone numbers were found."),
            selfTargetedPhones: selfTargeted,
            recipients,
          });
        } else if (!whatsappOk && !smsOk) {
          toast.error(`Provider didn't accept the alert — opening WhatsApp as backup`);
          setDeliverySummary({
            status: "failed",
            title: "Provider did not accept the SOS",
            detail: `WhatsApp: ${delivery.errors.whatsapp || "rejected"} · SMS: ${delivery.errors.sms || "rejected"}. Opening WhatsApp as a manual backup.`,
            selfTargetedPhones: selfTargeted,
            recipients,
          });
          guardians.forEach((g, i) => {
            setTimeout(() => window.open(getWhatsAppLink(g.guardian_phone), "_blank"), i * 500);
          });
        } else {
          const channels = [whatsappOk && "WhatsApp", smsOk && "SMS"].filter(Boolean).join(" + ");
          const skippedCount = recipients ? recipients.filter(r => !r.included).length : selfTargeted.length;
          toast.success(`SOS queued via ${channels} for ${delivery.recipientCount} guardian(s) — awaiting delivery confirmation`);
          setDeliverySummary({
            status: skippedCount > 0 ? "partial" : "success",
            title: skippedCount > 0 ? "SOS partially submitted" : "SOS submitted to provider",
            detail: skippedCount > 0
              ? `Submitted via ${channels} for ${delivery.recipientCount} guardian(s). ${skippedCount} skipped — see details below.`
              : `Submitted via ${channels} for ${delivery.recipientCount} guardian(s). Awaiting delivery confirmation from MSG91.`,
            selfTargetedPhones: selfTargeted,
            recipients,
          });
        }
      }
    } catch (e: any) {
      console.error("Failed to send SOS alerts:", e);
      if (!navigator.onLine || String(e).includes("Failed to fetch") || String(e).includes("NetworkError")) {
        setSending(false);
        setIsOfflineFallback(true);
        return;
      }
      
      toast.error(`SOS failed: ${e?.message || e} — opening WhatsApp as backup`);
      setDeliverySummary({
        status: "failed",
        title: "SOS failed",
        detail: `${e?.message || e}. Opening WhatsApp as a manual backup.`,
        selfTargetedPhones: [],
      });
      guardians.forEach((g, i) => {
        setTimeout(() => {
          window.open(getWhatsAppLink(g.guardian_phone), "_blank");
        }, i * 500);
      });
    }

    setSending(false);
    setSent(true);
  }, [guardians, triggerSOS, buildSOSMessage, getWhatsAppLink, medical.familyDoctorName, userName]);

  useEffect(() => {
    if (timeLeft === 0 && countingRef.current && !hasSentRef.current) {
      countingRef.current = false;
      sendAlerts();
    }
  }, [timeLeft, sendAlerts]);

  const handleCancel = () => {
    countingRef.current = false;
    setTimeLeft(10);
    cancelSOS();
    onClose();
  };

  const handleClose = () => {
    if (!sent) handleCancel();
    else onClose();
  };

  const sosHospitalizations = medicalHistory.filter(h => h.type === "hospitalization");
  const sosSurgeries = medicalHistory.filter(h => h.type === "surgery");

  const buildShareText = useCallback(() => {
    const lines = [
      `🚨 EMERGENCY HEALTH CARD — ${userName}`,
      "",
      userDob ? `Age: ${Math.floor((Date.now() - new Date(userDob).getTime()) / 31557600000)} years` : "",
      userPhone ? `Phone: ${userPhone}` : "",
      userGender ? `Gender: ${userGender}` : "",
      medical.bloodGroup ? `Blood Group: ${medical.bloodGroup}` : "",
      medical.allergies.length ? `⚠️ Allergies: ${medical.allergies.join(", ")}` : "",
      medical.conditions.length ? `Conditions: ${medical.conditions.join(", ")}` : "",
      medicationDetails.length ? `Medications: ${medicationDetails.map(m => `${m.name} (${m.dosage})`).join(", ")}` : "",
      medical.familyDoctorName ? `Doctor: ${medical.familyDoctorName}${medical.familyDoctorPhone ? ` (${medical.familyDoctorPhone})` : ""}` : "",
      guardians.length ? `Emergency Contacts: ${guardians.map(g => `${g.guardian_name} ${g.guardian_phone}`).join(", ")}` : "",
      sosHospitalizations.length ? `\n🏥 Hospitalizations:\n${sosHospitalizations.map(h => `• ${h.reason}${h.hospital_name ? ` at ${h.hospital_name}` : ""}${h.start_date ? ` (${h.start_date})` : ""}`).join("\n")}` : "",
      sosSurgeries.length ? `\n✂️ Surgeries:\n${sosSurgeries.map(s => `• ${s.reason}${s.hospital_name ? ` at ${s.hospital_name}` : ""}${s.start_date ? ` (${s.start_date})` : ""}`).join("\n")}` : "",
      location ? `Location: https://maps.google.com/?q=${location.lat},${location.lng}` : "",
      "",
      "Generated by Check-iN Emergency Response System",
    ];
    return lines.filter(Boolean).join("\n");
  }, [userName, userDob, userPhone, userGender, medical, medicationDetails, guardians, location, sosHospitalizations, sosSurgeries]);

  const handleShareCard = useCallback(() => {
    const text = buildShareText();
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Emergency card copied to clipboard");
    }
  }, [buildShareText]);

  const emergencyProfileUrl = emergencyToken ? `${window.location.origin}/e/${emergencyToken}` : null;

  const buildCardHtml = useCallback(() => {
    const qrSection = emergencyProfileUrl
      ? `<div class="qr-section"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(emergencyProfileUrl)}" alt="QR Code" width="100" height="100" /><div class="qr-text"><strong>📱 Scan for Emergency Profile</strong>First responders can scan this QR code to access the full emergency health profile quickly.</div></div>`
      : "";
    const bodyHtml = `
${qrSection}
<div class="section"><div class="section-title">👤 Personal Information</div><div class="section-body">
<div class="row"><span class="label">Name</span><span class="value">${userName}</span></div>
${userDob ? `<div class="row"><span class="label">Age</span><span class="value">${Math.floor((Date.now() - new Date(userDob).getTime()) / 31557600000)} years</span></div>` : ""}
${userGender ? `<div class="row"><span class="label">Gender</span><span class="value" style="text-transform:capitalize">${userGender}</span></div>` : ""}
${userPhone ? `<div class="row"><span class="label">Phone</span><span class="value">${userPhone}</span></div>` : ""}
${medical.bloodGroup ? `<div class="row"><span class="label">Blood Group</span><span class="value"><span class="badge">${medical.bloodGroup}</span></span></div>` : ""}
</div></div>
${medical.allergies.length ? `<div class="alert-box"><p>⚠️ ALLERGIES: ${medical.allergies.map(a => `<span class="badge">${a}</span>`).join(" ")}</p></div>` : ""}
${medical.conditions.length ? `<div class="section"><div class="section-title">🩺 Medical Conditions</div><div class="section-body">${medical.conditions.map(c => `<span class="badge" style="background:#eff6ff;color:#2563eb">${c}</span>`).join(" ")}</div></div>` : ""}
${medicationDetails.length ? `<div class="section"><div class="section-title">💊 Medications</div><div class="section-body"><table><tr><th>Medication</th><th>Dosage</th></tr>${medicationDetails.map(m => `<tr><td>${m.name}</td><td>${m.dosage}</td></tr>`).join("")}</table></div></div>` : ""}
${medical.familyDoctorName ? `<div class="section"><div class="section-title">👨‍⚕️ Family Doctor</div><div class="section-body"><div class="row"><span class="label">Name</span><span class="value">${medical.familyDoctorName}</span></div>${medical.familyDoctorPhone ? `<div class="row"><span class="label">Phone</span><span class="value">${medical.familyDoctorPhone}</span></div>` : ""}</div></div>` : ""}
${guardians.length ? `<div class="section"><div class="section-title">🛡️ Emergency Contacts</div><div class="section-body"><table><tr><th>Name</th><th>Relation</th><th>Phone</th></tr>${guardians.map(g => `<tr><td>${g.guardian_name}</td><td>${g.relation || "—"}</td><td>${g.guardian_phone}</td></tr>`).join("")}</table></div></div>` : ""}
${sosHospitalizations.length ? `<div class="section"><div class="section-title">🏥 Past Hospitalizations</div><div class="section-body"><table><tr><th>Reason</th><th>Hospital</th><th>Period</th><th>Treatment</th></tr>${sosHospitalizations.map(h => `<tr><td>${h.reason}</td><td>${h.hospital_name || "—"}</td><td>${h.start_date ? `${h.start_date}${h.end_date ? ` — ${h.end_date}` : ""}` : "—"}</td><td>${h.treatment || "—"}</td></tr>`).join("")}</table></div></div>` : ""}
${sosSurgeries.length ? `<div class="section"><div class="section-title">✂️ Past Surgeries</div><div class="section-body"><table><tr><th>Reason</th><th>Hospital</th><th>Doctor</th><th>Date</th></tr>${sosSurgeries.map(s => `<tr><td>${s.reason}</td><td>${s.hospital_name || "—"}</td><td>${s.doctor_name || "—"}</td><td>${s.start_date || "—"}</td></tr>`).join("")}</table></div></div>` : ""}
${location ? `<div class="section"><div class="section-title">📍 Location</div><div class="section-body"><a href="https://maps.google.com/?q=${location.lat},${location.lng}">Open in Google Maps</a></div></div>` : ""}`;

    return buildLetterheadHtml({
      title: "EMERGENCY HEALTH CARD",
      subtitle: userName,
      bodyHtml,
    });
  }, [userName, userDob, userPhone, userGender, medical, medicationDetails, guardians, location, emergencyProfileUrl, sosHospitalizations, sosSurgeries]);

  const handlePrintCard = useCallback(() => {
    const html = buildCardHtml();
    const w = window.open("", "_blank");
    if (!w) { toast.error("Pop-up blocked — allow pop-ups to print"); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
    toast.success("Emergency card opened for printing");
  }, [buildCardHtml]);

  const handleDownloadPdf = useCallback(() => {
    const html = buildCardHtml();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Emergency-Health-Card-${userName.replace(/\s+/g, "-") || "Patient"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Emergency card downloaded — open in any browser to view or print to PDF");
  }, [buildCardHtml, userName]);

  if (sent) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-10">
          {/* Confirmation header — reflects real delivery outcome */}
          {(() => {
            const ds = deliverySummary;
            const status = ds?.status ?? "success";
            const isFailed = status === "failed";
            const isPartial = status === "partial";
            const ringClass = isFailed
              ? "bg-destructive/10"
              : isPartial
                ? "bg-warning/10"
                : "bg-sos/10";
            const iconClass = isFailed
              ? "text-destructive"
              : isPartial
                ? "text-warning"
                : "text-sos";
            const Icon = isFailed ? AlertCircle : CheckCircle2;
            const title = ds?.title ?? `SOS Alerts Submitted`;
            const detail = ds?.detail ?? `Emergency alerts submitted to provider for ${guardians.length} guardian(s) — delivery status will be confirmed shortly via WhatsApp/SMS callback.`;
            return (
              <div className="text-center space-y-3 py-4">
                <div className={`w-16 h-16 rounded-full ${ringClass} flex items-center justify-center mx-auto`}>
                  <Icon className={`w-8 h-8 ${iconClass}`} />
                </div>
                <h2 className={`text-xl font-bold ${isFailed ? "text-destructive" : "text-foreground"}`}>{isPracticeMode ? "Practice Complete" : title}</h2>
                <p className="text-muted-foreground text-sm whitespace-pre-line">{detail}</p>
                {isFailed && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-left">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Action required
                    </p>
                    <p className="text-sm text-destructive">
                      No guardian has been notified. Please call 112 immediately if this is a real emergency, then fix your guardian's phone number in My Profile.
                    </p>
                  </div>
                )}
                {/* Per-recipient summary — backend is source of truth */}
                {(() => {
                  const backendRecipients = ds?.recipients;
                  if (backendRecipients && backendRecipients.length > 0) {
                    const skipReasonLabel = (r: typeof backendRecipients[number]) => {
                      switch (r.skip_reason) {
                        case "self_targeted": return "phone matches the WhatsApp sender number — MSG91 cannot deliver from sender to itself. Update in My Profile.";
                        case "invalid_phone": return "phone number is invalid.";
                        case "duplicate_phone": return "duplicate of another guardian — deduped.";
                        default: return "skipped";
                      }
                    };
                    const channelLabel = (s: "accepted" | "rejected" | "not_attempted") =>
                      s === "accepted" ? "submitted" : s === "rejected" ? "rejected" : "—";
                    const included = backendRecipients.filter(r => r.included);
                    const skipped = backendRecipients.filter(r => !r.included);
                    return (
                      <div className="bg-secondary/40 border border-border rounded-lg p-3 text-left space-y-3">
                        {included.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              Recipients ({included.length})
                            </p>
                            <div className="space-y-2">
                              {included.map((r) => (
                                <div key={r.guardian_id} className="text-xs space-y-0.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <CheckCircle2 className="w-3 h-3 text-success inline mr-1" />
                                      <span className="font-medium text-foreground">{r.name}</span>
                                      <span className="text-muted-foreground"> · {r.phone_raw}</span>
                                      <Badge
                                        variant="outline"
                                        className={`ml-1.5 text-[10px] px-1.5 py-0 ${r.status === "pending" ? "border-warning text-warning" : "border-success text-success"}`}
                                      >
                                        {r.status}
                                      </Badge>
                                    </div>
                                    <span className="shrink-0 text-muted-foreground">
                                      WA {channelLabel(r.channels.whatsapp)} · SMS {channelLabel(r.channels.sms)}
                                    </span>
                                  </div>
                                  {r.status === "pending" && (
                                    <p className="text-[11px] text-warning pl-4">
                                      Pending acceptance — alerted anyway.
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {skipped.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2 flex items-center gap-1">
                              <X className="w-3 h-3" /> Skipped ({skipped.length})
                            </p>
                            <div className="space-y-2">
                              {skipped.map((r) => (
                                <div key={r.guardian_id} className="text-xs">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <span className="font-medium text-foreground">{r.name}</span>
                                      <span className="text-muted-foreground"> · {r.phone_raw}</span>
                                      <Badge
                                        variant="outline"
                                        className={`ml-1.5 text-[10px] px-1.5 py-0 ${r.status === "pending" ? "border-warning text-warning" : "border-muted-foreground text-muted-foreground"}`}
                                      >
                                        {r.status}
                                      </Badge>
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-destructive mt-0.5">
                                    Reason: {skipReasonLabel(r)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  // Fallback: backend didn't return recipients (deploy lag) — keep legacy local inference
                  if (guardians.length === 0) return null;
                  return (
                    <div className="bg-secondary/40 border border-border rounded-lg p-3 text-left">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Recipients ({guardians.length})
                      </p>
                      <div className="space-y-1.5">
                        {guardians.map((g, i) => {
                          const digits = (g.guardian_phone || "").replace(/\D/g, "");
                          const withCc = digits.startsWith("91") ? digits : `91${digits}`;
                          const isSender = withCc === "917045868482";
                          const isInvalid = digits.length < 10;
                          const skipped = isSender || isInvalid;
                          const skipReason = isSender
                            ? "skipped: matches sender number"
                            : isInvalid
                              ? "skipped: invalid number"
                              : null;
                          return (
                            <div key={i} className="flex items-start justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <span className="font-medium text-foreground">{g.guardian_name}</span>
                                <span className="text-muted-foreground"> · {g.guardian_phone}</span>
                                {g.status === "pending" && (
                                  <span className="ml-1 text-warning">(pending)</span>
                                )}
                              </div>
                              <span className={`shrink-0 ${skipped ? "text-destructive" : isFailed ? "text-destructive" : "text-success"}`}>
                                {skipped ? skipReason : isFailed ? "not delivered" : "WA + SMS submitted"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Call buttons */}
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex gap-2">
              {guardians.find(g => g.is_primary) && (
                <a href={`tel:${guardians.find(g => g.is_primary)?.guardian_phone}`} className="flex-1">
                  <Button className="w-full bg-primary text-primary-foreground gap-2 h-12 text-base font-semibold">
                    <Phone className="w-4 h-4" /> Call Primary Guardian
                  </Button>
                </a>
              )}
              {medical.familyDoctorPhone && (
                <a href={`tel:${medical.familyDoctorPhone}`} className={guardians.find(g => g.is_primary) ? "flex-[0.5]" : "flex-1"}>
                  <Button className="w-full bg-success text-success-foreground gap-2 h-12">
                    <Phone className="w-4 h-4" /> Call Doctor
                  </Button>
                </a>
              )}
            </div>
            <a href="tel:112" className="block w-full">
              <Button className="w-full bg-sos text-sos-foreground hover:bg-sos/90 h-12 text-base font-semibold gap-2">
                <Phone className="w-5 h-5" /> Call 112
              </Button>
            </a>
          </div>

          <Separator className="my-3" />

          {/* Emergency Health Card */}
          <div className="border-2 border-sos/30 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-sos" />
                <h3 className="text-base font-bold text-foreground">Emergency Health Card</h3>
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1" onClick={handleShareCard}>
                  <Share2 className="w-3.5 h-3.5" /> Share
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1" onClick={handlePrintCard}>
                  <Printer className="w-3.5 h-3.5" /> Print
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1" onClick={handleDownloadPdf}>
                  <Download className="w-3.5 h-3.5" /> Save
                </Button>
              </div>
            </div>

            {/* Personal info */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Personal</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium text-foreground">{userName}</span></div>
                {userDob && <div><span className="text-muted-foreground">Age:</span> <span className="font-medium text-foreground">{Math.floor((Date.now() - new Date(userDob).getTime()) / 31557600000)} yrs</span></div>}
                {userPhone && <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium text-foreground">{userPhone}</span></div>}
                {userGender && <div><span className="text-muted-foreground">Gender:</span> <span className="font-medium text-foreground capitalize">{userGender}</span></div>}
              </div>
            </div>

            {/* Blood type - prominent */}
            {medical.bloodGroup && (
              <div className="flex items-center gap-3">
                <Badge className="bg-sos text-sos-foreground text-lg px-4 py-1.5 font-bold">
                  <Droplets className="w-5 h-5 mr-1.5" />
                  {medical.bloodGroup}
                </Badge>
                <span className="text-sm text-muted-foreground">Blood Type</span>
              </div>
            )}

            {/* Allergies - warning style */}
            {medical.allergies.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wide flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Allergies
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {medical.allergies.map((a, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">{a}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Medical conditions */}
            {medical.conditions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medical Conditions</p>
                <div className="flex flex-wrap gap-1.5">
                  {medical.conditions.map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Medications */}
            {medicationDetails.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Pill className="w-3.5 h-3.5" /> Current Medications
                </p>
                <div className="space-y-1">
                  {medicationDetails.map((m, i) => (
                    <div key={i} className="text-sm bg-secondary/50 rounded px-2.5 py-1.5 flex justify-between">
                      <span className="font-medium text-foreground">{m.name}</span>
                      <span className="text-muted-foreground">{m.dosage}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Family Doctor */}
            {medical.familyDoctorName && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Stethoscope className="w-3.5 h-3.5" /> Family Doctor
                </p>
                <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-2.5">
                  <span className="text-sm font-medium text-foreground">{medical.familyDoctorName}</span>
                  {medical.familyDoctorPhone && (
                    <a href={`tel:${medical.familyDoctorPhone}`} className="text-sm text-primary font-medium flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> {medical.familyDoctorPhone}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Emergency Contacts */}
            {guardians.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> Emergency Contacts ({guardians.length})
                </p>
                <div className="space-y-1.5">
                  {guardians.map((g, i) => (
                    <div key={i} className="flex items-center justify-between bg-secondary/50 rounded-lg p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          {g.guardian_name}
                          {g.is_primary && <Badge variant="default" className="text-[10px] px-1.5 py-0">Primary</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">{g.relation || "Guardian"}</p>
                      </div>
                      <a href={`tel:${g.guardian_phone}`} className="text-sm text-primary font-medium flex items-center gap-1 shrink-0">
                        <Phone className="w-3.5 h-3.5" /> {g.guardian_phone}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Location */}
            {location && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Location
                </p>
                <a
                  href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline"
                >
                  Open in Google Maps →
                </a>
              </div>
            )}

            {/* QR Code */}
            {emergencyProfileUrl && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" /> Emergency Profile QR
                </p>
                <div className="flex flex-col items-center gap-2 bg-white rounded-lg p-4">
                  <QRCodeSVG value={emergencyProfileUrl} size={140} />
                  <p className="text-[10px] text-muted-foreground break-all text-center">{emergencyProfileUrl}</p>
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleClose} variant="outline" className="w-full mt-4">
            Close
          </Button>
        </SheetContent>
      </Sheet>
    );
  }

  if (isOfflineFallback) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-10">
          <div className="flex flex-col items-center text-center space-y-6 pt-6 pb-2">
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center animate-pulse">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-destructive">No Internet Connection</h2>
              <p className="text-muted-foreground text-sm px-4">
                We couldn't reach the server to send your SOS automatically. You can still alert your guardians using your phone's standard SMS cellular network.
              </p>
            </div>

            <div className="w-full space-y-3 pt-4">
              <a href={getSmsLink()} onClick={() => setSent(true)} className="block w-full">
                <Button className="w-full h-16 text-lg font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-xl">
                  <MessageCircle className="w-6 h-6 mr-2" />
                  Tap to Send Offline SMS
                </Button>
              </a>
              <p className="text-[11px] text-muted-foreground">
                This will open your messaging app. You must tap "Send" in the app to dispatch the message.
              </p>
            </div>

            {guardians.find(g => g.is_primary) && (
              <div className="w-full pt-2">
                <a href={`tel:${guardians.find(g => g.is_primary)?.guardian_phone}`} className="block w-full">
                  <Button variant="outline" className="w-full h-14 text-base font-semibold border-primary/30 text-primary hover:bg-primary/10">
                    <Phone className="w-5 h-5 mr-2" />
                    Call Primary Guardian
                  </Button>
                </a>
              </div>
            )}

            <div className="w-full pt-4">
              <a href="tel:112" className="block w-full">
                <Button variant="outline" className="w-full h-14 text-base font-semibold border-destructive/30 text-destructive hover:bg-destructive/10">
                  <Phone className="w-5 h-5 mr-2" />
                  Call Emergency (112)
                </Button>
              </a>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          {isPracticeMode && (
            <div className="bg-warning/20 text-warning-foreground text-xs font-bold p-2 text-center uppercase tracking-widest rounded-t-2xl">
              PRACTICE MODE ACTIVE — No alerts will be sent
            </div>
          )}
          <SheetHeader className="text-center pt-2 pb-2">
          <SheetTitle className="text-xl font-bold text-sos flex items-center gap-2">
            🚨 Emergency SOS Active
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Alerts will be sent automatically when the timer reaches zero
          </p>
        </SheetHeader>

        {/* Countdown */}
        <div className="border-2 border-sos rounded-xl p-4 space-y-3 mt-4 animate-pulse">
          <div className="text-center">
            <p className="text-sos font-bold text-3xl tabular-nums">{timeLeft}s</p>
            <p className="text-sm text-muted-foreground mt-1">
              {sending ? "Sending alerts..." : "Sending SOS to all guardians & doctor"}
            </p>
            {gpsStatus === 'acquiring' && (
              <Badge variant="outline" className="mt-2 border-warning text-warning animate-pulse flex items-center gap-1 mx-auto w-fit">
                <Loader2 className="w-3 h-3 animate-spin" /> 📍 Getting location...
              </Badge>
            )}
            {gpsStatus === 'secured' && (
              <Badge variant="outline" className="mt-2 border-success text-success flex items-center gap-1 mx-auto w-fit">
                📍 Location secured
              </Badge>
            )}
            {gpsStatus === 'failed' && (
              <Badge variant="outline" className="mt-2 border-destructive text-destructive flex items-center gap-1 mx-auto w-fit">
                📍 Location unavailable — sending without coordinates
              </Badge>
            )}
          </div>
          <Progress value={((10 - timeLeft) / 10) * 100} className="h-2 [&>div]:bg-sos" />
          <Button
            onClick={() => { countingRef.current = false; sendAlerts(); }}
            disabled={sending}
            className="w-full bg-sos text-sos-foreground hover:bg-sos/90 h-12 text-base font-semibold"
          >
            {sending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <AlertCircle className="w-5 h-5 mr-2" />}
            Send SOS Now
          </Button>
          <Button onClick={handleCancel} variant="outline" className="w-full border-sos text-sos hover:bg-sos/10 h-12 text-base font-semibold">
            <X className="w-5 h-5 mr-2" />
            Cancel SOS
          </Button>
        </div>

        {/* Call 112 / Primary Guardian */}
        <div className="flex flex-col gap-2 mt-4">
          {guardians.find(g => g.is_primary) && (
            <a href={`tel:${guardians.find(g => g.is_primary)?.guardian_phone}`} className="block w-full">
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-14 text-lg font-semibold gap-2">
                <Phone className="w-5 h-5" />
                Call Primary Guardian Now
              </Button>
            </a>
          )}
          <a href="tel:112" className="block w-full">
            <Button className="w-full bg-sos text-sos-foreground hover:bg-sos/90 h-14 text-lg font-semibold gap-2">
              <Phone className="w-5 h-5" />
              Call 112 Now
            </Button>
          </a>
        </div>

        {/* What will be sent */}
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">What will be shared:</h3>
          <div className="space-y-2 text-sm">
            <InfoRow 
              icon={<MapPin className="w-4 h-4 text-success" />} 
              label="Live Location" 
              value={
                gpsStatus === 'secured' 
                  ? "✓ Captured" 
                  : gpsStatus === 'acquiring' 
                    ? "Acquiring..." 
                    : "Unavailable"
              } 
            />
            <InfoRow icon={<Droplets className="w-4 h-4 text-sos" />} label="Blood Type" value={medical.bloodGroup || "Not set"} />
            <InfoRow icon={<AlertCircle className="w-4 h-4 text-destructive/70" />} label="Allergies" value={medical.allergies.length > 0 ? medical.allergies.join(", ") : "None"} />
            <InfoRow icon={<Pill className="w-4 h-4 text-primary" />} label="Conditions & Meds" value={[...medical.conditions, ...medical.medications].join(", ") || "None"} />
            {medical.familyDoctorName && (
              <InfoRow icon={<Stethoscope className="w-4 h-4 text-success" />} label="Family Doctor" value={`${medical.familyDoctorName}${medical.familyDoctorPhone ? ` · ${medical.familyDoctorPhone}` : ""}`} />
            )}
          </div>
        </div>

        {/* Recipients */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Alert Recipients ({guardians.length})
            </h3>
          </div>
          {guardians.map((g, i) => {
            const digits = (g.guardian_phone || "").replace(/\D/g, "");
            const withCc = digits.startsWith("91") ? digits : `91${digits}`;
            const isSender = withCc === "917045868482";
            const isInvalid = digits.length < 10;
            const hasIssue = isSender || isInvalid;
            return (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg p-3 ${
                  hasIssue
                    ? "bg-destructive/10 border border-destructive/30"
                    : g.status === "pending"
                      ? "bg-warning/10 border border-warning/30"
                      : "bg-secondary/50"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                    {g.guardian_name}
                    {g.is_primary && <Badge variant="default" className="text-[10px] px-1.5 py-0">Primary</Badge>}
                    {g.status === "pending" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning text-warning">
                        Pending acceptance — will still be alerted
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{g.relation || "Guardian"} · {g.guardian_phone}</p>
                  {g.guardian_email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" />{g.guardian_email}
                    </p>
                  )}
                  {isSender && (
                    <p className="text-[11px] font-medium text-destructive mt-1 flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      This number matches the WhatsApp sender — MSG91 cannot deliver. Update in My Profile.
                    </p>
                  )}
                  {isInvalid && !isSender && (
                    <p className="text-[11px] font-medium text-destructive mt-1 flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      Phone number looks invalid.
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-success" />
                    <Mail className="w-3 h-3 text-primary" />
                  </span>
                </div>
              </div>
            );
          })}
          {guardians.length === 0 && (
            <p className="text-xs text-destructive font-medium">⚠️ No guardians configured. Add guardians in My Profile.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-3 bg-secondary/50 rounded-lg p-2.5">
    {icon}
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  </div>
);

export default SOSDialog;
