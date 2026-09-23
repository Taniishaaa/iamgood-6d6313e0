import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import OtpVerification from "@/components/OtpVerification";
import PhoneInput from "@/components/PhoneInput";
import usePwaInstall from "@/hooks/usePwaInstall";
import { isValidE164, toE164 } from "@/lib/countryCodes";
import { resendGuardianInvite } from "@/lib/guardianInvite";
import { useSeoMeta } from "@/components/SeoMeta";
import { clearPendingNomination, stashNominationToken, getPendingNominationToken } from "@/lib/pendingNomination";




type SelectedRole = "user" | "guardian" | null;
const TOTAL_STEPS_USER = 4;
const TOTAL_STEPS_GUARDIAN = 3;

const Register = () => {
  useSeoMeta({
    title: "Create your Check-iN account",
    description: "Create a free Check-iN account in minutes — set daily check-ins, add medication reminders and invite family guardians to watch over you.",
    canonicalPath: "/register",
  });
  const { signUp, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { canInstall, installApp, isInstalled } = usePwaInstall();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<number>(2);
  const [selectedRole, setSelectedRole] = useState<SelectedRole>("user");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  
  const [sentGuardianCount, setSentGuardianCount] = useState(0);
  const [guardians, setGuardians] = useState([{ name: "", phone: "", email: "", relation: "" }]);
  
  const [nominationBlocked, setNominationBlocked] = useState(false);
  const [isInviteLink, setIsInviteLink] = useState(false);
  const [inviteLookupState, setInviteLookupState] = useState<"idle" | "loading" | "loaded" | "failed">("idle");
  const [inviteLookupError, setInviteLookupError] = useState("");
  const [showEmailSection, setShowEmailSection] = useState(false);
const totalSteps = selectedRole === "guardian" ? TOTAL_STEPS_GUARDIAN : TOTAL_STEPS_USER;
  const progressPercent = (step / totalSteps) * 100;

  const loadInvitation = async (token: string) => {
    setInviteLookupState("loading");
    setInviteLookupError("");
    const { data, error } = await supabase.functions.invoke("guardian-nomination-response", {
      body: { token, action: "lookup" },
    });

    const invitedPhone = typeof data?.guardian_phone === "string" ? toE164(data.guardian_phone) : "";
    if (error || !data?.success || !isValidE164(invitedPhone)) {
      setPhone("");
      setInviteLookupState("failed");
      setInviteLookupError(data?.error || "We could not load the phone number from this invitation.");
      return;
    }

    setFullName(typeof data.guardian_name === "string" ? data.guardian_name : "");
    setPhone(invitedPhone);
    setInviteLookupState("loaded");
  };

  useEffect(() => {
    if (authLoading) return;
    const nomination = searchParams.get("nomination");
    const token = searchParams.get("token");
    if (nomination && token) stashNominationToken(token);
    if (nomination === "reject" && token) clearPendingNomination();
    if (nomination === "accept" && token) {
      if (session) {
        // User is already logged in, auto-accept and link
        const acceptExisting = async () => {
          setLoading(true);
          try {
            await supabase.rpc("link_guardian_user_id");
            await supabase.functions.invoke("guardian-nomination-response", { body: { token, action: "accept" } });
            clearPendingNomination();
            toast.success("Guardian invitation accepted successfully!");
            navigate("/guardian");
          } catch (e) {
            console.error(e);
            toast.error("Failed to accept invitation");
          } finally {
            setLoading(false);
          }
        };
        acceptExisting();
        return;
      }
      setIsInviteLink(true);
      setSelectedRole("guardian");
      setStep(2);
      void loadInvitation(token);
    }
  }, [searchParams, session, authLoading, navigate]);const handleBack = () => {
    if (step === 2) {
      navigate(-1);
    } else if (step === 3) {
      // On the invite path step 2 auto-advances, so going back there would loop.
      if (isInviteLink) navigate(-1);
      else setStep(2);
    } else if (step === 4) {
      setStep(3);
    }
  };


  const addGuardian = () => {
    if (guardians.length < 5) {
      setGuardians([...guardians, { name: "", phone: "", email: "", relation: "" }]);
    }
  };
  const removeGuardian = (i: number) => {
    if (guardians.length > 1) {
      setGuardians(guardians.filter((_, idx) => idx !== i));
    }
  };
  const updateGuardian = (i: number, field: string, value: string) => {
    setGuardians(guardians.map((g, idx) => (idx === i ? { ...g, [field]: value } : g)));
  };

  const isPhoneValid = isValidE164(phone);

  // Invite path: the name and number come from the ward's nomination, so skip
  // straight to phone verification instead of asking the guardian to re-type them.
  useEffect(() => {
    if (isInviteLink && inviteLookupState === "loaded" && step === 2 && fullName && isPhoneValid) {
      setStep(3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInviteLink, inviteLookupState, step, fullName, isPhoneValid]);


  const handleDetailsNext = () => {
    if (isInviteLink && inviteLookupState !== "loaded") return toast.error("Please wait for the invitation to load");
    if (!fullName) return toast.error("Please enter your name");
    if (!isPhoneValid) return toast.error("Invalid phone number", { description: "Enter a valid number including the country code." });
    if (email && !password) return toast.error("Password is required when email is provided");
    setStep(3);
  };

  const handleOtpVerified = async () => {
    setPhoneVerified(true);
    if (selectedRole === "user") {
      setStep(4);
    } else {
      const cleanPhone = toE164(phone).replace(/\+/g, "");
      const { data: hasNomination } = await supabase.rpc("check_guardian_nomination" as any, { _phone: cleanPhone });

      if (!hasNomination) {
        setNominationBlocked(true);
        return;
      }
      const { data: wardCount } = await supabase.rpc("guardian_ward_count_by_phone" as any, { _phone: cleanPhone });
      if (typeof wardCount === "number" && wardCount >= 3) {
        toast.error("Ward limit reached", { description: "You already monitor 3 users (maximum)." });
        return;
      }
      handleSubmit();
    }
  };

  const handleOtpCancel = () => setStep(2);


  const handleSubmit = async () => {
    if (!fullName) return toast.error("Please fill in all required fields");
    if (selectedRole === "user" && (!guardians[0].name || !guardians[0].phone)) {
      toast.error("Primary guardian name and phone are required");
      return;
    }
    if (selectedRole === "user") {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const g of guardians.filter(g => g.name || g.phone)) {
        if (!emailRe.test((g.email || "").trim())) {
          toast.error("Guardian email is required", {
            description: `Add a valid email for ${g.name || "your guardian"} — it's the backup if WhatsApp doesn't go through.`,
          });
          return;
        }
      }
    }
    
    if (selectedRole === "user") {
      for (const g of guardians.filter(g => g.phone)) {
        if (!isValidE164(g.phone)) return toast.error("Invalid guardian phone", { description: `${g.name || "A guardian"} has an invalid number. Include the country code.` });
        
        const cleanGPhone = toE164(g.phone).replace(/\+/g, "");
        const { data: phoneCount } = await supabase.rpc("guardian_ward_count_by_phone" as any, { _phone: cleanGPhone });
        if (typeof phoneCount === "number" && phoneCount >= 3) return toast.error("Guardian limit reached", { description: `${g.name || g.phone} already monitors 3 users.` });
        
        if (g.email) {
          const { data: emailCount } = await supabase.rpc("guardian_ward_count", { _guardian_email: g.email });
          if (typeof emailCount === "number" && emailCount >= 3) return toast.error("Guardian limit reached", { description: `${g.name || g.email} already monitors 3 users.` });
        }
      }
    }

    const guardianRows = selectedRole === "user" ? guardians.filter(g => g.name && g.phone).map((g, i) => ({ guardian_name: g.name.trim(), guardian_phone: toE164(g.phone), guardian_email: g.email?.trim() || null, relation: g.relation || null, is_primary: i === 0 })) : [];
    const e164Phone = toE164(phone);
    const emailToUse = email.trim() || `${e164Phone.replace(/\+/g, "")}@phone.checkin.app`;
    const passwordToUse = password || crypto.randomUUID();

    setLoading(true);
    const { data, error } = await signUp(emailToUse, passwordToUse, { full_name: fullName, app_role: selectedRole || "user", phone: e164Phone, date_of_birth: dob || "", guardians: guardianRows });

    if (error) {
      setLoading(false);
      return toast.error("Registration failed", { description: error.message });
    }

    // Fire-and-forget WhatsApp welcome (never blocks signup)
    supabase.functions
      .invoke("msg91-whatsapp-welcome")
      .catch((e) => console.error("welcome WhatsApp failed:", e));

    if (selectedRole === "user" && data?.user?.id) {
      // Query the newly inserted guardians for this user
      // Delay slightly to ensure trigger has completed
      await new Promise(r => setTimeout(r, 500));
      const { data: insertedGuardians } = await supabase
        .from("guardians")
        .select("id")
        .eq("user_id", data.user.id);

      if (insertedGuardians) {
        for (const g of insertedGuardians) {
          await resendGuardianInvite(g.id, fullName);
        }
      }
      setSentGuardianCount(insertedGuardians?.length || 0);
    }


    if (selectedRole === "guardian" && data?.user?.id) {
      await supabase.rpc("link_guardian_user_id");
      const nominationToken = searchParams.get("token") || getPendingNominationToken();
      if (nominationToken) {
        try {
          await supabase.functions.invoke("guardian-nomination-response", { body: { token: nominationToken, action: "accept" } });
          clearPendingNomination();
        } catch (e) { console.error(e); }
      }
      setLoading(false);
      // Guardian: no account/success ceremony — straight into the dashboard.
      toast.success("You're verified — welcome to Check-iN");
      if (!isInstalled) {
        navigate("/guardian-install"); return;
      }
      navigate("/guardian");
      return;
    }
    setLoading(false);
    setRegistrationComplete(true);
  };


  const handleInstallClick = async () => {
    if (canInstall) await installApp();
    else navigate("/install");
  };

  // --- BLOCKED ---
  if (nominationBlocked) {
    return (
      <div className="dark min-h-screen bg-[#08111F] text-auth-text-1 font-sans px-4 pb-8 safe-top-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-[320px] flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-auth-amber-soft border-[1.5px] border-[#F5A6234D] flex items-center justify-center text-[28px] mb-4">🔒</div>
          <h1 className="text-[22px] font-bold text-center tracking-tight mb-1.5">No invitation found</h1>
          <div className="text-[14px] text-auth-text-2 text-center mb-6">Your phone number hasn't been nominated as a guardian yet.</div>

          <div className="bg-navy-card border border-auth-border-hi rounded-2xl p-3.5 mb-5 w-full">
            <div className="text-[12px] font-semibold text-auth-text-2 mb-2.5 uppercase tracking-wide">How to get invited</div>
            <div className="flex gap-2.5 items-start mb-2">
              <div className="w-5 h-5 rounded-full bg-auth-amber-soft border border-[#F5A6234D] flex items-center justify-center text-[11px] font-bold text-auth-amber shrink-0">1</div>
              <div className="text-[13px] text-auth-text-2 leading-relaxed">Ask the person you want to protect to open Check-iN</div>
            </div>
            <div className="flex gap-2.5 items-start mb-2">
              <div className="w-5 h-5 rounded-full bg-auth-amber-soft border border-[#F5A6234D] flex items-center justify-center text-[11px] font-bold text-auth-amber shrink-0">2</div>
              <div className="text-[13px] text-auth-text-2 leading-relaxed">They go to <strong className="text-auth-text-1">Settings → Guardians</strong> and add your phone</div>
            </div>
            <div className="flex gap-2.5 items-start">
              <div className="w-5 h-5 rounded-full bg-auth-amber-soft border border-[#F5A6234D] flex items-center justify-center text-[11px] font-bold text-auth-amber shrink-0">3</div>
              <div className="text-[13px] text-auth-text-2 leading-relaxed">You'll receive an SMS/WhatsApp invite link — use it to register</div>
            </div>
          </div>

          <div className="w-full flex flex-col gap-2.5">
            <button onClick={() => navigate("/login")} className="w-full bg-auth-green text-[#0A1525] text-[17px] font-bold py-4 rounded-2xl">Got it — go to Sign In</button>
            <div className="text-[13px] text-auth-text-3 text-center mt-1.5 cursor-pointer" onClick={() => { setNominationBlocked(false); setStep(1); setSelectedRole(null); }}>
              Registering for yourself? <span className="text-auth-green font-semibold">Switch to User</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- SUCCESS ---
  if (registrationComplete) {
    return (
      <div className="dark min-h-screen bg-[#08111F] text-auth-text-1 font-sans px-4 pb-8 safe-top-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-[320px] flex flex-col items-center">
          <div className="w-[72px] h-[72px] rounded-full bg-auth-green-glow border-[1.5px] border-[#2ECC8A66] flex items-center justify-center text-[32px] mb-5">
            {selectedRole === "user" ? "✅" : "🛡️"}
          </div>
          
          <h1 className="text-[22px] font-bold text-center tracking-tight mb-1.5">
            {selectedRole === "user" ? `You're all set,\n${fullName.split(" ")[0]}!` : `Guardian account\nready, ${fullName.split(" ")[0]}!`}
          </h1>
          <div className="text-[14px] text-auth-text-2 text-center mb-6 leading-relaxed">
            {selectedRole === "user" 
              ? "Welcome to Check-iN. Taking you to your dashboard now." 
              : "You're now protecting your ward. Taking you to your Guardian dashboard."}
          </div>

          <div className="w-full flex flex-col gap-2 mb-6">
            <div className="bg-navy-card border border-auth-border-hi rounded-[10px] p-3 flex items-center gap-2.5">
              <div className="text-[16px] shrink-0">📱</div>
              <div className="text-[13px] text-auth-text-2 leading-relaxed">
                <strong className="text-auth-text-1">Phone verified</strong> — sign in anytime with an OTP
              </div>
            </div>
            
            {selectedRole === "user" && guardians[0]?.name && (
              <div className="bg-navy-card border border-auth-border-hi rounded-[10px] p-3 flex items-center gap-2.5">
                <div className="text-[16px] shrink-0">👨‍👧</div>
                <div className="text-[13px] text-auth-text-2 leading-relaxed">
                  <strong className="text-auth-text-1">{guardians[0].name.split(" ")[0]}</strong> has been notified as your guardian
                </div>
              </div>
            )}
            
            {selectedRole === "guardian" && (
              <div className="bg-navy-card border border-auth-border-hi rounded-[10px] p-3 flex items-center gap-2.5">
                <div className="text-[16px] shrink-0">📍</div>
                <div className="text-[13px] text-auth-text-2 leading-relaxed">
                  <strong className="text-auth-text-1">Live location</strong> access is now active during emergencies
                </div>
              </div>
            )}

            {!isInstalled && (
              <div className="bg-navy-card border border-auth-border-hi rounded-[10px] p-3 flex items-center gap-2.5">
                <div className="text-[16px] shrink-0">📲</div>
                <div className="text-[13px] text-auth-text-2 leading-relaxed">
                  Install Check-iN for instant SOS alerts when the app is closed
                </div>
              </div>
            )}
          </div>

          <div className="w-full flex flex-col gap-2.5 mt-auto">
            <button onClick={() => navigate("/dashboard")} className="w-full bg-auth-green text-[#0A1525] text-[17px] font-bold py-4 rounded-2xl">
              {selectedRole === "user" ? "Go to my dashboard ›" : "Open Guardian dashboard ›"}
            </button>
            {!isInstalled && (
              <button onClick={handleInstallClick} className="w-full bg-transparent text-auth-green text-[14px] font-semibold py-3 rounded-2xl">
                Install app on this phone
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PROGRESS HEADER COMPONENT
  const ProgressHeader = () => (
    <div className="flex items-center gap-2.5 mb-5 mt-2">
      <button onClick={handleBack} className="w-8 h-8 rounded-lg bg-navy-mid border border-auth-border-hi flex items-center justify-center text-auth-text-2 text-[14px]">‹</button>
      <div className="flex-1 h-1 bg-navy-soft rounded-full overflow-hidden">
        <div className="h-full bg-auth-green transition-all duration-300" style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="text-[11px] text-auth-text-3 whitespace-nowrap">Step {step} / {totalSteps}</div>
    </div>
  );

  // --- STEP 2: DETAILS ---
  if (step === 2) {
    return (
      <div className="dark min-h-screen bg-[#08111F] text-auth-text-1 font-sans px-4 pb-6 safe-top-6 flex flex-col items-center">
        <div className="w-full max-w-[320px] flex-1 flex flex-col pt-4">
          <ProgressHeader />
          <h1 className="text-[22px] font-bold tracking-tight mb-1">{selectedRole === "guardian" ? "Guardian details" : "Your details"}</h1>
          <div className="text-[14px] text-auth-text-2 mb-6">{selectedRole === "guardian" ? "Set up your guardian account" : "Tell us about yourself"}</div>

          <div className="flex flex-col gap-3.5 mb-2">
            <div>
              <label className="block text-[12px] font-semibold text-auth-text-2 tracking-wide uppercase mb-1.5">Your full name *</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full bg-navy-mid border border-auth-border-hi rounded-[10px] p-[13px] text-auth-text-1 text-[16px] outline-none focus:border-auth-green" />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-auth-text-2 tracking-wide uppercase mb-1.5">Your phone number *</label>
              {isInviteLink && inviteLookupState === "loading" ? (
                <div className="w-full bg-navy-mid border border-auth-border-hi rounded-[10px] p-[13px] text-auth-text-2 text-[16px]">
                  Loading invited number…
                </div>
              ) : isInviteLink && inviteLookupState === "loaded" && isPhoneValid ? (
                <>
                  <div className="w-full bg-navy-mid border border-auth-border-hi rounded-[10px] p-[13px] text-auth-text-1 text-[16px] opacity-80">
                    {phone}
                  </div>
                  <div className="text-[11px] text-auth-text-2 mt-1.5">
                    This is the number your ward invited. If it is wrong, ask them to correct it and re-send the invite.
                  </div>
                </>
              ) : isInviteLink ? (
                <div className="rounded-[10px] border border-auth-red/30 bg-auth-red/10 p-3">
                  <div className="text-[13px] text-auth-red leading-relaxed">{inviteLookupError || "The invitation could not be loaded."}</div>
                  <button
                    type="button"
                    className="mt-2 text-[13px] font-semibold text-auth-green"
                    onClick={() => {
                      const token = searchParams.get("token") || getPendingNominationToken();
                      if (token) void loadInvitation(token);
                    }}
                  >
                    Retry invitation
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-navy-mid border border-auth-border-hi rounded-xl p-1">
                    <PhoneInput value={phone} onChange={setPhone} placeholder="xxxxx xxxxx" className="border-0 shadow-none bg-transparent h-12" />
                  </div>
                  {selectedRole === "guardian" && <div className="text-[11px] text-auth-text-2 mt-1.5">Must match the number the ward invited</div>}
                </>
              )}
            </div>

            {selectedRole === "user" && (
              <div>
                <label className="block text-[12px] font-semibold text-auth-text-2 tracking-wide uppercase mb-1.5">Date of birth</label>
                <input type="date" value={dob} onChange={e => setDob(e.target.value)} className="w-full bg-navy-mid border border-auth-border-hi rounded-[10px] p-[13px] text-auth-text-1 text-[16px] outline-none focus:border-auth-green [color-scheme:dark]" />
              </div>
            )}

            {selectedRole !== "guardian" && (
              <>
                <div
                  className="flex items-center gap-2 py-2.5 mt-1 border-t border-auth-border cursor-pointer text-auth-green text-[13px] font-medium"
                  onClick={() => setShowEmailSection(!showEmailSection)}
                >
                  <span>{showEmailSection ? "-" : "+"}</span> Add email for alerts <span className="ml-auto text-[11px] text-auth-text-3 font-normal">Optional</span>
                </div>

                {showEmailSection && (
                  <div className="flex flex-col gap-3.5 animate-in slide-in-from-top-2">
                    <div>
                      <label className="block text-[12px] font-semibold text-auth-text-2 tracking-wide uppercase mb-1.5">Email</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-navy-mid border border-auth-border-hi rounded-[10px] p-[13px] text-auth-text-1 text-[16px] outline-none focus:border-auth-green" />
                    </div>
                    {email && (
                      <div>
                        <label className="block text-[12px] font-semibold text-auth-text-2 tracking-wide uppercase mb-1.5">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-navy-mid border border-auth-border-hi rounded-[10px] p-[13px] text-auth-text-1 text-[16px] outline-none focus:border-auth-green" />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

          </div>

          <div className="mt-auto pt-6 flex flex-col gap-2.5">
            {selectedRole === "user" && (
              <>
                <div className="flex items-center gap-2.5 text-auth-text-3 text-[12px] tracking-wide mb-1.5">
                  <div className="flex-1 h-px bg-auth-border" /> or sign up faster <div className="flex-1 h-px bg-auth-border" />
                </div></>
            )}
            <button disabled={isInviteLink && inviteLookupState !== "loaded"} onClick={handleDetailsNext} className="w-full bg-auth-green text-[#0A1525] text-[17px] font-bold py-4 rounded-2xl mt-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
              Next — Verify phone ›
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- STEP 3: OTP ---
  if (step === 3) {
    return (
      <div className="dark min-h-screen bg-[#08111F] text-auth-text-1 font-sans px-4 pb-6 safe-top-6 flex flex-col items-center">
        <div className="w-full max-w-[320px] flex-1 flex flex-col pt-4">
          <ProgressHeader />
          <h1 className="text-[22px] font-bold tracking-tight mb-1">Verify your<br/>phone</h1>
          <div className="text-[14px] text-auth-text-2 mb-5">We sent a 6-digit code to<br/><strong className="text-auth-text-1">{phone}</strong></div>
          <OtpVerification
            phone={toE164(phone)}
            purpose="register"
            nominationToken={searchParams.get("token") || getPendingNominationToken()}
            onVerified={handleOtpVerified}
            onCancel={handleOtpCancel}
          />
        </div>
      </div>
    );
  }

  // --- STEP 4: GUARDIAN NOMINATION (User only) ---
  if (step === 4) {
    return (
      <div className="dark min-h-screen bg-[#08111F] text-auth-text-1 font-sans px-4 pb-6 safe-top-6 flex flex-col items-center overflow-y-auto">
        <div className="w-full max-w-[320px] flex-1 flex flex-col pt-4">
          <ProgressHeader />
          <h1 className="text-[22px] font-bold tracking-tight mb-1">Nominate your<br/>guardian</h1>
          <div className="text-[14px] text-auth-text-2 mb-6 leading-relaxed">At least 1 required. They'll be alerted if you miss a check-in.</div>

          <div className="flex flex-col gap-2.5 flex-1">
            {guardians.map((g, i) => (
              <div key={i} className="bg-navy-card border border-auth-border-hi rounded-[16px] p-3.5 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-auth-green bg-auth-green-glow px-2 py-0.5 rounded-full tracking-wide uppercase">
                    {i === 0 ? "Primary Guardian" : `Guardian ${i + 1}`}
                  </span>
                  {i > 0 && <button onClick={() => removeGuardian(i)} className="text-auth-text-3 hover:text-auth-red text-[16px]">✕</button>}
                </div>
                
                <div className="flex flex-col gap-2">
                  <input type="text" placeholder="👤 Guardian Name" value={g.name} onChange={e => updateGuardian(i, "name", e.target.value)} className="w-full bg-navy-mid border border-auth-border rounded-[10px] px-3 py-[13px] text-[14px] text-auth-text-1 placeholder:text-auth-text-3 outline-none focus:border-auth-green" />
                  
                  <div className="bg-navy-mid border border-auth-border rounded-[10px] p-1 focus-within:border-auth-green">
                    <PhoneInput value={g.phone} onChange={val => updateGuardian(i, "phone", val)} placeholder="📱 Phone Number" className="h-10 border-0 shadow-none bg-transparent" />
                  </div>

                  <div>
                    <input type="email" placeholder="✉️ Email for alerts *" value={g.email} onChange={e => updateGuardian(i, "email", e.target.value)} className="w-full bg-navy-mid border border-auth-border rounded-[10px] px-3 py-[13px] text-[14px] text-auth-text-1 placeholder:text-auth-text-3 outline-none focus:border-auth-green" />
                    <p className="text-[11px] text-auth-text-3 mt-1">Required — used to reach your guardian if WhatsApp doesn't go through.</p>
                  </div>
                  
                  <select value={g.relation} onChange={e => updateGuardian(i, "relation", e.target.value)} className="w-full bg-navy-mid border border-auth-border rounded-[10px] px-3 py-[13px] text-[14px] text-auth-text-1 placeholder:text-auth-text-3 outline-none focus:border-auth-green appearance-none">
                    <option value="" disabled>🔗 Relation (e.g. Son, Daughter)</option>
                    <option value="spouse">Spouse</option>
                    <option value="son">Son</option>
                    <option value="daughter">Daughter</option>
                    <option value="sibling">Sibling</option>
                    <option value="friend">Friend</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            ))}

            {guardians.length < 5 && (
              <button onClick={addGuardian} className="w-full bg-transparent border-[1.5px] border-dashed border-auth-green/30 text-auth-green text-[13px] font-semibold py-3 rounded-[16px] flex items-center justify-center gap-1.5 mb-2 mt-1">
                + Add another guardian ({guardians.length}/5)
              </button>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <button disabled={loading} onClick={handleSubmit} className="w-full bg-auth-green text-[#0A1525] text-[17px] font-bold py-4 rounded-2xl">
              {loading ? "Creating..." : "Create my account ›"}
            </button>
            <div className="text-center text-[13px] text-auth-text-3 cursor-pointer mt-1" onClick={handleSubmit}>
              <span className="text-auth-green font-semibold">Skip</span> — add guardians later in Settings
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Register;



