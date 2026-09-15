import { useState, useEffect, useRef } from "react";
import { X, Phone, Users, Stethoscope, Mic, MicOff, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useUserSettings } from "@/hooks/useUserSettings";
import { resolveCheckInHours, getCurrentWindow, getCheckInWindowStart } from "@/lib/checkInSchedule";

type Step = "ask" | "well" | "not-well" | "voice";

interface Guardian {
  id: string;
  guardian_name: string;
  guardian_phone: string;
  relation: string | null;
}

interface CheckInDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirmOk: () => void;
}

const CheckInDialog = ({ open, onClose, onConfirmOk }: CheckInDialogProps) => {
  const { session } = useAuth();
  const [step, setStep] = useState<Step>("ask");
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [doctorName, setDoctorName] = useState<string | null>(null);
  const [doctorPhone, setDoctorPhone] = useState<string | null>(null);

  // Voice check-in state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceAnalysis, setVoiceAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (open) {
      setStep("ask");
      setTranscript("");
      setVoiceAnalysis(null);
      setAnalyzing(false);
    }
  }, [open]);

  const fetchContacts = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from("guardians")
      .select("id, guardian_name, guardian_phone, relation")
      .eq("user_id", session.user.id);
    if (data) setGuardians(data);

    const { data: appt } = await supabase
      .from("appointments")
      .select("doctor_name")
      .eq("user_id", session.user.id)
      .not("doctor_name", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (appt && appt.length > 0 && appt[0].doctor_name) {
      setDoctorName(appt[0].doctor_name);
    }
  };

  const handleYes = () => {
    onConfirmOk();
    setStep("well");
  };

  const handleNo = () => {
    fetchContacts();
    setStep("not-well");
  };

  // Auto-dismiss the "Well" confirmation after 3 seconds
  useEffect(() => {
    if (!open || step !== "well") return;
    const t = setTimeout(() => onClose(), 3000);
    return () => clearTimeout(t);
  }, [open, step, onClose]);


  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, "_self");
  };

  // Voice check-in functions
  const startVoiceCheckIn = () => {
    setStep("voice");
    setTranscript("");
    setVoiceAnalysis(null);

    // Speak the prompt
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance("How are you feeling right now?");
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.lang = "en-IN";
      utterance.onend = () => {
        startListening();
      };
      window.speechSynthesis.speak(utterance);
    } else {
      startListening();
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice recognition is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        finalTranscript += event.results[i][0].transcript;
      }
      setTranscript(finalTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === "no-speech") {
        toast.info("No speech detected. Please try again or use the buttons.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const analyzeVoiceResponse = async () => {
    if (!transcript.trim() || !session?.user?.id) return;

    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("health-tools", {
        body: {
          type: "wellness_voice_checkin",
          payload: {
            transcript: transcript.trim(),
            time_of_day: new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening",
          },
        },
      });

      if (error) throw error;

      let analysis: any;
      try {
        analysis = JSON.parse(data.response);
      } catch {
        analysis = { sentiment: "neutral", mood_score: 5, concerns: [], follow_up_needed: false, summary: data.response };
      }

      setVoiceAnalysis(analysis);

      // Save sentiment data to check-in
      await supabase.from("check_ins").insert({
        user_id: session.user.id,
        scheduled_at: new Date().toISOString(),
        status: "responded",
        response: analysis.mood_score >= 6 ? "ok" : "not_ok",
        responded_at: new Date().toISOString(),
        notes: `Voice check-in: "${transcript.trim()}"`,
        sentiment_data: analysis,
      });

      // If follow-up needed, notify guardians
      if (analysis.follow_up_needed) {
        const { data: guardians } = await supabase
          .from("guardians")
          .select("guardian_user_id")
          .eq("user_id", session.user.id)
          .eq("status", "accepted");

        if (guardians?.length) {
          const notifications = guardians
            .filter((g) => g.guardian_user_id)
            .map((g) => ({
              user_id: g.guardian_user_id!,
              title: "Ward Wellness Alert",
              message: `Voice check-in detected potential concern: ${analysis.summary || analysis.concerns?.join(", ") || "Needs attention"}`,
              type: "wellness_alert",
            }));
          if (notifications.length) {
            await supabase.rpc("insert_notifications_deduped", { p_notifications: notifications });
          }
        }
      }

      if (analysis.mood_score >= 6) {
        onConfirmOk();
      }
    } catch (e) {
      console.error("Voice analysis error:", e);
      toast.error("Could not analyze your response. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Auto-analyze when listening stops and we have a transcript
  useEffect(() => {
    if (!isListening && transcript.trim() && step === "voice" && !voiceAnalysis && !analyzing) {
      analyzeVoiceResponse();
    }
  }, [isListening, transcript, step]);

  const isSpeechSupported = typeof window !== "undefined" && 
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-2xl shadow-xl w-[90%] max-w-md mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <div className="flex justify-end p-3 pb-0">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        {step === "ask" && (
          <div className="px-6 pb-8 text-center space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Are you OK? 😊</h2>
              <p className="text-lg text-muted-foreground mt-2">Let us know how you're feeling</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleYes}
                className="py-10 rounded-xl border-2 border-primary text-3xl font-bold text-foreground bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={handleNo}
                className="py-10 rounded-xl border-2 border-border text-3xl font-bold text-foreground hover:bg-muted transition-colors"
              >
                No
              </button>
            </div>
            {isSpeechSupported && (
              <button
                onClick={startVoiceCheckIn}
                className="flex items-center justify-center gap-2 mx-auto px-6 py-3 rounded-xl border border-primary text-primary hover:bg-primary/5 transition-colors text-sm font-medium"
              >
                <Volume2 className="w-4 h-4" />
                Voice Check-in
              </button>
            )}
          </div>
        )}

        {step === "voice" && (
          <div className="px-6 pb-8 text-center space-y-4">
            {analyzing ? (
              <>
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 flex items-center justify-center animate-pulse">
                  <Volume2 className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Analyzing your response…</h2>
                {transcript && (
                  <p className="text-sm text-muted-foreground italic">"{transcript}"</p>
                )}
              </>
            ) : voiceAnalysis ? (
              <>
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                  voiceAnalysis.mood_score >= 7 ? "bg-success/15" : 
                  voiceAnalysis.mood_score >= 4 ? "bg-warning/15" : "bg-destructive/15"
                }`}>
                  <span className="text-3xl">
                    {voiceAnalysis.mood_score >= 7 ? "😊" : voiceAnalysis.mood_score >= 4 ? "😐" : "😟"}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-foreground">
                  {voiceAnalysis.sentiment === "positive" ? "Glad you're doing well!" :
                   voiceAnalysis.sentiment === "negative" ? "We're here for you" : "Thanks for checking in"}
                </h2>
                {voiceAnalysis.summary && (
                  <p className="text-sm text-muted-foreground">{voiceAnalysis.summary}</p>
                )}
                {voiceAnalysis.concerns?.length > 0 && (
                  <div className="bg-warning/10 rounded-lg p-3 text-left">
                    <p className="text-xs font-medium text-warning mb-1">Points of attention:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {voiceAnalysis.concerns.map((c: string, i: number) => (
                        <li key={i}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {voiceAnalysis.follow_up_needed && (
                  <p className="text-xs text-destructive font-medium">
                    Your guardians have been notified.
                  </p>
                )}
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl border border-border text-lg font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center transition-colors ${
                  isListening ? "bg-primary/20 animate-pulse" : "bg-muted"
                }`}>
                  {isListening ? (
                    <Mic className="w-10 h-10 text-primary" />
                  ) : (
                    <MicOff className="w-10 h-10 text-muted-foreground" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-foreground">
                  {isListening ? "Listening…" : "How are you feeling?"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isListening 
                    ? "Speak naturally about how you're feeling"
                    : "Tap the microphone to start speaking"
                  }
                </p>
                {transcript && (
                  <p className="text-sm text-foreground bg-muted rounded-lg p-3 italic">"{transcript}"</p>
                )}
                <div className="flex gap-3 justify-center">
                  {isListening ? (
                    <button
                      onClick={stopListening}
                      className="px-6 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={startListening}
                      className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold"
                    >
                      <Mic className="w-4 h-4 inline mr-2" />
                      Start Speaking
                    </button>
                  )}
                  <button
                    onClick={() => setStep("ask")}
                    className="px-6 py-3 rounded-xl border border-border text-foreground font-semibold hover:bg-muted"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "well" && (
          <div className="px-6 pb-8 text-center space-y-4">
            <div className="w-24 h-24 mx-auto rounded-full bg-success/15 flex items-center justify-center">
              <span className="text-5xl">😊</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Great to know you're Well!</h2>
            <p className="text-lg text-muted-foreground">Have a wonderful day!</p>
          </div>
        )}

        {step === "not-well" && (
          <div className="px-6 pb-6 space-y-4">
            <h2 className="text-xl font-bold text-foreground text-center">
              Do you want to talk to your Doctor or Guardians?
            </h2>

            {doctorName && (
              <div className="bg-muted rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Stethoscope className="w-5 h-5 text-primary" />
                  <span className="font-semibold">Your Doctor</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground text-lg">{doctorName}</p>
                    {doctorPhone && <p className="text-muted-foreground">{doctorPhone}</p>}
                  </div>
                  {doctorPhone && (
                    <button
                      onClick={() => handleCall(doctorPhone)}
                      className="flex items-center gap-2 bg-success text-success-foreground px-4 py-2 rounded-lg font-semibold"
                    >
                      <Phone className="w-4 h-4" /> Call
                    </button>
                  )}
                </div>
              </div>
            )}

            {guardians.length > 0 && (
              <div className="bg-muted rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="font-semibold">Your Guardians</span>
                </div>
                <div className="space-y-3">
                  {guardians.map((g) => (
                    <div key={g.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground text-lg">{g.guardian_name}</p>
                        <p className="text-muted-foreground">{g.guardian_phone}</p>
                      </div>
                      <button
                        onClick={() => handleCall(g.guardian_phone)}
                        className="flex items-center gap-2 bg-success text-success-foreground px-4 py-2 rounded-lg font-semibold"
                      >
                        <Phone className="w-4 h-4" /> Call
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl border border-border text-lg font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckInDialog;
