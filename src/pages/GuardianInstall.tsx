import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Download, Share, Plus, ChevronRight, CheckCircle2, MoreVertical, ShieldCheck, ArrowRight, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const GuardianInstall = () => {
  const navigate = useNavigate();
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  
  const isInstalled = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));
  }, []);

  useEffect(() => {
    if (isInstalled) {
      setTimeout(() => navigate("/guardian", { replace: true }), 1500);
    }
  }, [isInstalled, navigate]);

  const handleSkip = () => {
    navigate("/guardian", { replace: true });
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-[#08111F] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <CheckCircle2 className="w-20 h-20 text-auth-green animate-bounce" />
        <h1 className="text-2xl font-bold">Installation Complete!</h1>
        <p className="text-auth-text-2">Taking you to your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08111F] text-auth-text-1 font-sans px-4 py-8 safe-top-8 overflow-y-auto">
      <div className="w-full max-w-md mx-auto space-y-6">
        
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-auth-amber-soft border border-auth-amber/30 flex items-center justify-center mx-auto mb-2 animate-pulse">
            <ShieldCheck className="w-8 h-8 text-auth-amber" />
          </div>
          <h1 className="text-[24px] font-bold tracking-tight text-white">Action Required</h1>
          <p className="text-[15px] text-auth-text-2 leading-relaxed px-2">
            You have successfully verified your phone! To receive <strong className="text-white">Emergency SOS Push Notifications</strong> when your Ward needs help, you <strong className="text-white">must</strong> install the app to your home screen now.
          </p>
        </div>

        <div className="bg-navy-card border border-auth-border-hi rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-auth-amber to-auth-green"></div>
          
          <h2 className="text-[18px] font-semibold text-white flex items-center gap-2 mb-6">
            <Smartphone className="w-5 h-5 text-auth-amber" />
            How to install in 2 taps:
          </h2>

          {isIOS ? (
            <div className="space-y-6 relative">
              <div className="flex items-start gap-4 relative z-10">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                  <Share className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-[16px] font-bold text-white mb-1">Step 1: Tap Share</p>
                  <p className="text-[14px] text-auth-text-2">Tap the square with the up-arrow at the very bottom of your screen.</p>
                </div>
              </div>
              
              <div className="absolute left-6 top-10 w-[2px] h-12 bg-blue-500/20 z-0"></div>

              <div className="flex items-start gap-4 relative z-10">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                  <Plus className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-[16px] font-bold text-white mb-1">Step 2: Add to Home Screen</p>
                  <p className="text-[14px] text-auth-text-2">Scroll down the menu and tap the <strong className="text-white">"Add to Home Screen"</strong> button.</p>
                </div>
              </div>
              
              <div className="mt-8 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 animate-bounce">
                <p className="text-xs font-semibold uppercase tracking-wider text-auth-text-2">Look down here</p>
                <ArrowRight className="w-4 h-4 text-auth-text-2 rotate-90" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
                  <MoreVertical className="w-6 h-6 text-green-400" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-[16px] font-bold text-white mb-1">Step 1: Open Menu</p>
                  <p className="text-[14px] text-auth-text-2">Tap the three dots (?) in the top-right corner of Chrome.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
                  <Download className="w-6 h-6 text-green-400" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-[16px] font-bold text-white mb-1">Step 2: Install App</p>
                  <p className="text-[14px] text-auth-text-2">Tap <strong className="text-white">"Install app"</strong> or <strong className="text-white">"Add to Home screen"</strong>.</p>
                </div>
              </div>
              
              <div className="mt-6 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 animate-pulse">
                <p className="text-xs font-semibold uppercase tracking-wider text-auth-text-2">Look top right</p>
                <ArrowRight className="w-4 h-4 text-auth-text-2 -rotate-45" />
              </div>
            </div>
          )}
        </div>

        <div className="pt-6 space-y-4">
          <Button 
            variant="ghost" 
            onClick={handleSkip}
            className="w-full text-auth-text-3 hover:text-white hover:bg-white/5 text-sm h-12"
          >
            I will do it later (Not Recommended)
          </Button>
        </div>

      </div>
    </div>
  );
};

export default GuardianInstall;
