import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import SignalsPage from "./pages/SignalsPage";
import ResearchPage from "./pages/ResearchPage";
import ResearchConversationStartPage from "./pages/ResearchConversationStartPage";
import ResearchConversationPage from "./pages/ResearchConversationPage";
import StoryboardPage from "./pages/StoryboardPage";
import ReviewPage from "./pages/ReviewPage";
import MyResearchPage from "./pages/MyResearchPage";
import SettingsPage from "./pages/SettingsPage";
import PreferenceSync from "./components/PreferenceSync";
import VoiceProfilesPage from "./pages/VoiceProfilesPage";
import SignInPage from "./pages/SignInPage";
import LandingPage from "./pages/LandingPage";
import LegalPage from "./pages/LegalPage";
import BillingPage from "./pages/BillingPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import PlanSelectPage from "./pages/PlanSelectPage";
import PaddlePaymentLinkPage from "./pages/PaddlePaymentLinkPage";
import PlatformShell from "./components/PlatformShell";
import EditorWorkspace from "./components/EditorWorkspace";
import SessionGate from "./components/SessionGate";
import { onboardingDestination } from "./lib/onboarding";
import { AuthProvider, authRequired, useAuth } from "./context/AuthContext";
import { ProjectProvider } from "./context/ProjectProvider.jsx";

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, status } = useAuth();
  if (!authRequired()) return <PlatformShell>{children}</PlatformShell>;
  if (status === "loading") return <SessionGate />;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (!user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;
  if (!user.planSelectedAt) return <Navigate to={onboardingDestination(user.intendedPlan)} replace />;
  return <PlatformShell>{children}</PlatformShell>;
}

function LegacyEditorToolRedirect({ tool }) {
  const { id } = useParams();
  return <Navigate to={`/editor/${id}?tool=${tool}`} replace />;
}

export default function App() {
  return <AuthProvider><PreferenceSync /><ProjectProvider><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/signals" element={<ProtectedRoute><SignalsPage /></ProtectedRoute>} />
    <Route path="/pricing" element={<LandingPage />} />
    <Route path="/privacy" element={<LegalPage type="privacy" />} />
    <Route path="/terms" element={<LegalPage type="terms" />} />
    <Route path="/refund-policy" element={<LegalPage type="refund" />} />
    <Route path="/signin" element={<SignInPage />} /><Route path="/signup" element={<SignUpPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/choose-plan" element={<PlanSelectPage />} />
    <Route path="/checkout" element={<PaddlePaymentLinkPage />} />
    <Route path="/review/:token" element={<ReviewPage />} />
    <Route path="/my-research" element={<ProtectedRoute><MyResearchPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/account" element={<Navigate to="/settings?tab=account" replace />} />
    <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
    <Route path="/voice-profiles" element={<ProtectedRoute><VoiceProfilesPage /></ProtectedRoute>}/>
    <Route path="/research/new" element={<ProtectedRoute><ResearchConversationStartPage /></ProtectedRoute>} />
    <Route path="/research-conversation/:id" element={<ProtectedRoute><ResearchConversationPage /></ProtectedRoute>} />
    <Route path="/research/:id" element={<ProtectedRoute><ResearchPage /></ProtectedRoute>} />
    <Route path="/storyboard/:id" element={<ProtectedRoute><StoryboardPage /></ProtectedRoute>} />
    <Route path="/editor/:id" element={<ProtectedRoute><EditorWorkspace /></ProtectedRoute>} />
    <Route path="/editor/:id/ai" element={<LegacyEditorToolRedirect tool="ai" />} />
    <Route path="/editor/:id/render" element={<LegacyEditorToolRedirect tool="render" />} />
    <Route path="/editor/:id/media-picker" element={<LegacyEditorToolRedirect tool="media" />} />
    <Route path="/editor/:id/productivity" element={<LegacyEditorToolRedirect tool="productivity" />} />
    <Route path="/media/:id" element={<LegacyEditorToolRedirect tool="media" />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></ProjectProvider></AuthProvider>;
}
