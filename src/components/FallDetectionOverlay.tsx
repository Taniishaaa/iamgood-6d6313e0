import { useEffect, useCallback, useRef, useState } from "react";
import { useFallDetection } from "@/hooks/useFallDetection";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X, MessageCircle, Phone, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureAudioReady } from "@/lib/audioAlerts";

const playVoicePrompt = (userName: string): (() => void) => {
  let stopped = false;

  const speak = () => {
    if (stopped || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      `${userName}, a fall has been detected. Are you okay? If you are okay, please cancel the SOS by tapping the Cancel SOS button on your phone.`
    );
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => {
      if (!stopped) {
        setTimeout(speak, 1000);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  speak();

  return () => {
    stopped = true;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };
};

const FallDetectionOverlay = () => {
  const {
    fallDetected,
    countdown,
    cancelFallAlert,
    countdownExpired,
    permissionState,
    requestPermission,
    enabled,
    fallConfidence,
    cancelledRef,
  } = useFallDetection();

  const { triggerSOS } = useApp();
  const { session } = useAuth();

  const [userName, setUserName] = useState("User");
  const hasSentRef = useRef(false);
  const stopAlarmRef = useRef<(() => void) | null>(null);
  const [offlineData, setOfflineData] = useState<{
    msg: string;
    guardians: any[];
  } | null>(null);
  const isCancelledRef = useRef(false);

  const handleCancel = useCallback(() => {
    isCancelledRef.current = true;
    cancelFallAlert();
  }, [cancelFallAlert]);

  const getSmsLink = useCallback(() => {
    if (!offlineData) return "";

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const separator = isIOS ? "&" : "?";

    const numbers = offlineData.guardians
      .map((g) => g.guardian_phone.replace(/[^0-9]/g, ""))
      .filter((p) => p.length >= 10)
      .join(isIOS ? "," : ";");

    return `sms:${numbers}${separator}body=${encodeURIComponent(
      offlineData.msg
    )}`;
  }, [offlineData]);

  // Fetch user's first name early so the voice prompt can address them
  useEffect(() => {
    if (session?.user?.id) {
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.full_name) {
            setUserName(data.full_name.split(" ")[0]);
          }
        });
    }
  }, [session?.user?.id]);

  const sendFallAlerts = useCallback(async () => {
    if (!session?.user?.id) return;

    const uid = session.user.id;

    if (isCancelledRef.current) return;

    const [profileRes, hpRes, gRes, npRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, phone, date_of_birth")
        .eq("id", uid)
        .maybeSingle(),

      supabase
        .from("health_profile")
        .select(
          "blood_group, allergies, chronic_conditions, current_medications, family_doctor_name, family_doctor_phone"
        )
        .eq("user_id", uid)
        .maybeSingle(),

      supabase
        .from("guardians")
        .select(
          "guardian_name, guardian_phone, guardian_email, relation"
        )
        .eq("user_id", uid)
        .eq("status", "accepted"),

      supabase
        .from("nutrition_personas")
        .select("blood_group, allergies, medical_conditions")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);

    if (isCancelledRef.current) return;

    const userName = profileRes.data?.full_name || "User";
    const phone = profileRes.data?.phone || "";
    const dob = profileRes.data?.date_of_birth || "";

    const rawHp = hpRes.data;
    const np = npRes.data as any;

    const hp = {
      blood_group: rawHp?.blood_group || np?.blood_group || null,
      allergies: rawHp?.allergies?.length
        ? rawHp.allergies
        : (np?.allergies ?? []),
      chronic_conditions: rawHp?.chronic_conditions?.length
        ? rawHp.chronic_conditions
        : (np?.medical_conditions ?? []),
      current_medications: rawHp?.current_medications ?? [],
      family_doctor_name: rawHp?.family_doctor_name ?? null,
      family_doctor_phone: rawHp?.family_doctor_phone ?? null,
    };

    const guardians = gRes.data || [];

    const confidenceLabel =
      fallConfidence >= 0.8
        ? "High"
        : fallConfidence >= 0.6
          ? "Moderate"
          : "Low";

    let msg = `🚨 FALL DETECTED (${confidenceLabel} confidence) — SOS ALERT from ${userName}!`;

    if (phone) msg += `\n📞 Phone: ${phone}`;
    if (dob) msg += `\n🎂 DOB: ${dob}`;

    try {
      const pos = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 3000,
          });
        }
      );

      if (isCancelledRef.current) return;

      msg += `\n📍 Location: https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
    } catch {}

    if (isCancelledRef.current) return;

    if (hp?.blood_group) {
      msg += `\n🩸 Blood Type: ${hp.blood_group}`;
    }

    if (hp?.allergies?.length) {
      msg += `\n⚠️ Allergies: ${hp.allergies.join(", ")}`;
    }

    if (hp?.chronic_conditions?.length) {
      msg += `\n💊 Conditions: ${hp.chronic_conditions.join(", ")}`;
    }

    if (hp?.current_medications?.length) {
      msg += `\n💊 Medications: ${hp.current_medications.join(", ")}`;
    }

    if (hp?.family_doctor_name) {
      msg += `\n👨‍⚕️ Family Doctor: ${hp.family_doctor_name}`;

      if (hp.family_doctor_phone) {
        msg += ` (${hp.family_doctor_phone})`;
      }
    }

    msg += "\n\n⚠️ A fall was detected. Please respond immediately!";

    if (isCancelledRef.current) return;

    if (!navigator.onLine) {
      setOfflineData({ msg, guardians });
      return;
    }

    try {
      if (isCancelledRef.current) return;

      const result = await triggerSOS({
        message: msg,
        doctorName: hp?.family_doctor_name || null,
        userName,
      });

      const delivery = result.delivery;

      // MSG91 WhatsApp + SMS are now handled together through OneAPI.
      const oneApiFailed = delivery?.oneApiHasError === true;

      // Only open the manual WhatsApp fallback when invocation failed or
      // MSG91 explicitly reports an error. A successful/queued response is success.
      if (result.invokeError || oneApiFailed) {
        if (isCancelledRef.current) return;

        guardians.forEach((g, i) => {
          const cleanPhone = g.guardian_phone.replace(/[^0-9]/g, "");

          if (cleanPhone.length < 10) return;

          const phoneWithCode = cleanPhone.startsWith("91")
            ? cleanPhone
            : `91${cleanPhone}`;

          setTimeout(() => {
            if (isCancelledRef.current) return;

            window.open(
              `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(msg)}`,
              "_blank"
            );
          }, i * 500);
        });
      }
    } catch (e: any) {
      console.error("Failed to send fall detection alerts:", e);

      if (isCancelledRef.current) return;

      if (
        !navigator.onLine ||
        String(e).includes("Failed to fetch") ||
        String(e).includes("NetworkError")
      ) {
        setOfflineData({ msg, guardians });
        return;
      }

      guardians.forEach((g, i) => {
        const cleanPhone = g.guardian_phone.replace(/[^0-9]/g, "");

        if (cleanPhone.length < 10) return;

        const phoneWithCode = cleanPhone.startsWith("91")
          ? cleanPhone
          : `91${cleanPhone}`;

        setTimeout(() => {
          if (isCancelledRef.current) return;

          window.open(
            `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(msg)}`,
            "_blank"
          );
        }, i * 500);
      });
    }
  }, [session?.user?.id, fallConfidence, triggerSOS]);

  useEffect(() => {
    if (
      countdownExpired &&
      !hasSentRef.current &&
      !cancelledRef?.current
    ) {
      hasSentRef.current = true;

      // sendFallAlerts() calls triggerSOS() internally with the rich fall message.
      sendFallAlerts();
      cancelFallAlert();
    }
  }, [
    countdownExpired,
    sendFallAlerts,
    cancelFallAlert,
    cancelledRef,
  ]);

  // Start/stop alarm sound when fall is detected/dismissed
  useEffect(() => {
    if (fallDetected) {
      isCancelledRef.current = false;
      hasSentRef.current = false;

      ensureAudioReady().then(() => {
        stopAlarmRef.current = playVoicePrompt(userName);
      });

      if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
    } else {
      stopAlarmRef.current?.();
      stopAlarmRef.current = null;
    }

    return () => {
      stopAlarmRef.current?.();
      stopAlarmRef.current = null;
    };
  }, [fallDetected, userName]);

  useEffect(() => {
    if (!fallDetected) {
      setOfflineData(null);
    }
  }, [fallDetected]);

  useEffect(() => {
    if (enabled && permissionState === "unknown") {
      requestPermission();
    }
  }, [enabled, permissionState, requestPermission]);

  if (!fallDetected) return null;

  const progress = (countdown / 30) * 100;
  const confidencePercent = Math.round(fallConfidence * 100);

  const confidenceLabel =
    fallConfidence >= 0.8
      ? "High"
      : fallConfidence >= 0.6
        ? "Moderate"
        : "Low";

  if (offlineData) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="flex flex-col items-center text-center space-y-6 pt-6 pb-2">
          <div className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center animate-pulse">
            <AlertCircle className="w-12 h-12 text-destructive" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-destructive">
              No Internet
            </h2>

            <p className="text-muted-foreground text-base px-4">
              We couldn't reach the server to send your Fall Alert
              automatically. Alert your guardians using your phone's
              cellular network.
            </p>
          </div>

          <div className="w-full space-y-3 pt-6">
            <a
              href={getSmsLink()}
              onClick={() => handleCancel()}
              className="block w-full"
            >
              <Button className="w-full h-20 text-xl font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-2xl rounded-2xl">
                <MessageCircle className="w-8 h-8 mr-3" />
                Send Offline SMS
              </Button>
            </a>

            <p className="text-sm text-muted-foreground font-medium">
              You must tap "Send" in the messaging app.
            </p>
          </div>

          <div className="w-full pt-6">
            <a href="tel:112" className="block w-full">
              <Button
                variant="outline"
                className="w-full h-16 text-lg font-bold border-destructive/30 text-destructive hover:bg-destructive/10 rounded-xl"
              >
                <Phone className="w-6 h-6 mr-3" />
                Call Emergency (112)
              </Button>
            </a>
          </div>

          <Button
            onClick={handleCancel}
            variant="ghost"
            className="mt-8 text-muted-foreground"
          >
            <X className="w-5 h-5 mr-2" /> I'm OK — Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-destructive/95 flex flex-col items-center justify-center text-destructive-foreground p-6 animate-in fade-in duration-300">
      <div className="w-24 h-24 rounded-full bg-destructive-foreground/20 flex items-center justify-center mb-6 animate-pulse">
        <AlertTriangle className="w-14 h-14" />
      </div>

      <h1 className="text-2xl font-bold mb-2">Fall Detected!</h1>

      <div className="bg-destructive-foreground/10 rounded-lg px-4 py-2 mb-4">
        <p className="text-sm font-medium">
          Confidence: {confidenceLabel} ({confidencePercent}%)
        </p>
      </div>

      <p className="text-center text-sm opacity-90 mb-8 max-w-xs">
        A fall has been detected. Emergency SOS will trigger automatically
        unless you cancel.
      </p>

      <div className="relative w-32 h-32 mb-8">
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            opacity={0.2}
          />

          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${
              2 * Math.PI * 45 * (1 - progress / 100)
            }`}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-linear"
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-bold">{countdown}</span>
        </div>
      </div>

      <p className="text-sm opacity-80 mb-6">
        SOS in {countdown} second{countdown !== 1 ? "s" : ""}
      </p>

      <Button
        onClick={handleCancel}
        variant="outline"
        size="lg"
        className="bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90 border-none font-bold text-lg px-10 py-6"
      >
        <X className="w-5 h-5 mr-2" /> Cancel SOS
      </Button>
    </div>
  );
};

export default FallDetectionOverlay;
