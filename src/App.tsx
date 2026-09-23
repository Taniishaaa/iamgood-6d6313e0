import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { GuardianWardProvider } from "@/contexts/GuardianWardContext";
import { UserRoute, GuardianRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminRoute from "./components/AdminRoute";

// Lazy-loaded chart-heavy & authenticated routes (isolates recharts bundle from initial load)
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const GuardianDashboard = lazy(() => import("./pages/GuardianDashboard"));
const GuardianAlerts = lazy(() => import("./pages/GuardianAlerts"));
const GuardianReports = lazy(() => import("./pages/GuardianReports"));
const GuardianServices = lazy(() => import("./pages/GuardianServices"));
const MyHealth = lazy(() => import("./pages/MyHealth"));
const MyActivity = lazy(() => import("./pages/MyActivity"));
const GuardianActivity = lazy(() => import("./pages/GuardianActivity"));
const GuardianWardActivity = lazy(() => import("./pages/GuardianWardActivity"));
const HealthPassportPage = lazy(() => import("./pages/HealthPassportPage"));
const Services = lazy(() => import("./pages/Services"));
const MedicalVault = lazy(() => import("./pages/MedicalVault"));
const Settings = lazy(() => import("./pages/Settings"));
const Subscription = lazy(() => import("./pages/Subscription"));
const Appointments = lazy(() => import("./pages/Appointments"));
const Messages = lazy(() => import("./pages/Messages"));
const MyProfile = lazy(() => import("./pages/MyProfile"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const EmergencyProfile = lazy(() => import("./pages/EmergencyProfile"));
const GuardianMessages = lazy(() => import("./pages/GuardianMessages"));
const GuardianAppointments = lazy(() => import("./pages/GuardianAppointments"));
const MapMyJourney = lazy(() => import("./pages/MapMyJourney"));
const FinancialHealth = lazy(() => import("./pages/FinancialHealth"));
const BloodBanks = lazy(() => import("./pages/BloodBanks"));
const PersonalHealthcare = lazy(() => import("./pages/PersonalHealthcare"));
const NearestHospitals = lazy(() => import("./pages/NearestHospitals"));

// Lazy-loaded heavy / rarely-used routes
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Help = lazy(() => import("./pages/Help"));
const GuardianSettings = lazy(() => import("./pages/GuardianSettings"));
const GuardianHelp = lazy(() => import("./pages/GuardianHelp"));
const Install = lazy(() => import('./pages/Install'));
  const GuardianInstall = lazy(() => import('./pages/GuardianInstall'));
const PublicJourneyView = lazy(() => import("./pages/PublicJourneyView"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const AdminCoupons = lazy(() => import("./pages/AdminCoupons"));
const AdminWaitlist = lazy(() => import("./pages/AdminWaitlist"));
const AdminContacts = lazy(() => import("./pages/AdminContacts"));
const AdminVerify = lazy(() => import("./pages/AdminVerify"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminVaultClaims = lazy(() => import("./pages/AdminVaultClaims"));
const AdminEmails = lazy(() => import("./pages/AdminEmails"));
const AdminOtpLog = lazy(() => import("./pages/AdminOtpLog"));
const VaultClaim = lazy(() => import("./pages/VaultClaim"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const CustomerService = lazy(() => import("./pages/CustomerService"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const ConnectAssistant = lazy(() => import("./pages/ConnectAssistant"));
const ProductHelpChat = lazy(() => import("./components/ProductHelpChat"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading…</div>
);

import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
const HelpRouter = () => {
  const { session, profile, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role === "guardian") return <GuardianWardProvider><GuardianHelp /></GuardianWardProvider>;
  return <Help />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppProvider>
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                {/* User-only routes */}
                <Route path="/dashboard" element={<UserRoute><UserDashboard /></UserRoute>} />
                <Route path="/my-health" element={<UserRoute><MyHealth /></UserRoute>} />
                <Route path="/my-activity" element={<UserRoute><MyActivity /></UserRoute>} />
                <Route path="/health-passport" element={<UserRoute><HealthPassportPage /></UserRoute>} />
                <Route path="/financial-health" element={<UserRoute><FinancialHealth /></UserRoute>} />
                <Route path="/personal-healthcare" element={<UserRoute><PersonalHealthcare /></UserRoute>} />
                <Route path="/nearest-hospitals" element={<UserRoute><NearestHospitals /></UserRoute>} />
                <Route path="/medical-vault" element={<UserRoute><MedicalVault /></UserRoute>} />
                <Route path="/subscription" element={<UserRoute><Subscription /></UserRoute>} />
                <Route path="/appointments" element={<UserRoute><Appointments /></UserRoute>} />
                <Route path="/messages" element={<UserRoute><Messages /></UserRoute>} />
                <Route path="/journey" element={<UserRoute><MapMyJourney /></UserRoute>} />
                <Route path="/services" element={<UserRoute><Services /></UserRoute>}/>
                {/* Guardian-only routes */}
                <Route path="/guardian" element={<GuardianRoute><GuardianWardProvider><GuardianDashboard /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian/activity" element={<GuardianRoute><GuardianWardProvider><GuardianActivity /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian/ward-activity" element={<GuardianRoute><GuardianWardProvider><GuardianWardActivity /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian/alerts" element={<GuardianRoute><GuardianWardProvider><GuardianAlerts /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian/reports" element={<GuardianRoute><GuardianWardProvider><GuardianReports /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian/services" element={<GuardianRoute><GuardianWardProvider><GuardianServices /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian/messages" element={<GuardianRoute><GuardianWardProvider><GuardianMessages /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian/appointments" element={<GuardianRoute><GuardianWardProvider><GuardianAppointments /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/reports" element={<GuardianRoute><GuardianWardProvider><GuardianReports /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian-settings" element={<GuardianRoute><GuardianWardProvider><GuardianSettings /></GuardianWardProvider></GuardianRoute>} />
                <Route path="/guardian-help" element={<GuardianRoute><GuardianWardProvider><GuardianHelp /></GuardianWardProvider></GuardianRoute>} />
                {/* Shared routes (both roles) */}
                <Route path="/settings" element={<UserRoute><Settings /></UserRoute>} />
                <Route path="/help" element={<HelpRouter />} />
                <Route path="/support" element={<ProtectedRoute><CustomerService /></ProtectedRoute>} />
                <Route path="/connect" element={<ProtectedRoute><ConnectAssistant /></ProtectedRoute>} />
                <Route path="/my-profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
                <Route path="/contact-us" element={<ProtectedRoute><ContactUs /></ProtectedRoute>} />
                <Route path="/blood-banks" element={<ProtectedRoute><GuardianWardProvider><BloodBanks /></GuardianWardProvider></ProtectedRoute>} />
                {/* Public routes */}
                <Route path="/e/:token" element={<EmergencyProfile />} />
                <Route path="/j/:token" element={<PublicJourneyView />} />
                <Route path="/install" element={<Install />} />
                <Route path="/guardian-install" element={<GuardianInstall />} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogPost />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                {/* Admin routes */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/verify" element={<ProtectedRoute><AdminVerify /></ProtectedRoute>} />
                <Route path="/admin/coupons" element={<AdminRoute><AdminCoupons /></AdminRoute>} />
                <Route path="/admin/waitlist" element={<AdminRoute><AdminWaitlist /></AdminRoute>} />
                <Route path="/admin/contacts" element={<AdminRoute><AdminContacts /></AdminRoute>} />
                <Route path="/admin/vault-claims" element={<AdminRoute><AdminVaultClaims /></AdminRoute>} />
                <Route path="/admin/emails" element={<AdminRoute><AdminEmails /></AdminRoute>} />
                <Route path="/admin/otp-log" element={<AdminRoute><AdminOtpLog /></AdminRoute>} />
                <Route path="/vault-claim/:token" element={<VaultClaim />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <Suspense fallback={null}>
              <ProductHelpChat />
            </Suspense>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
