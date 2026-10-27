import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import PreferenceSync from "./components/PreferenceSync";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import PlanSelectPage from "./pages/PlanSelectPage";
import PlatformShell from "./components/PlatformShell";
import AdminShell from "./components/AdminShell.jsx";
import { isPlatformAdminUser } from "./lib/platformAdmin.js";
import SessionGate from "./components/SessionGate";
import { onboardingDestination } from "./lib/onboarding";
import { AuthProvider, authRequired, useAuth } from "./context/AuthContext";
import { ProjectProvider } from "./context/ProjectProvider.jsx";

const SignalsPage = lazy(() => import("./pages/SignalsPage"));
const PlatformAdminPage = lazy(() => import("./pages/PlatformAdminPage"));
const AdminManagementPage = lazy(() => import("./pages/AdminManagementPage.jsx"));
const AdminPipelinesPage = lazy(() => import("./pages/AdminPipelinesPage.jsx"));
const AdminModelPoolPage = lazy(() => import("./pages/AdminModelPoolPage.jsx"));
const ResearchPage = lazy(() => import("./pages/ResearchPage"));
const ResearchConversationStartPage = lazy(() => import("./pages/ResearchConversationStartPage"));
const ResearchConversationPage = lazy(() => import("./pages/ResearchConversationPage"));
const StoryboardPage = lazy(() => import("./pages/StoryboardPage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const MyResearchPage = lazy(() => import("./pages/MyResearchPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const VoiceProfilesPage = lazy(() => import("./pages/VoiceProfilesPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const PaddlePaymentLinkPage = lazy(() => import("./pages/PaddlePaymentLinkPage"));
const PaymentResultPage = lazy(() => import("./pages/PaymentResultPage"));
const EditorWorkspace = lazy(() => import("./components/EditorWorkspace"));

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, status } = useAuth();
  if (!authRequired()) return <PlatformShell>{children}</PlatformShell>;
  if (status === "loading") return <SessionGate />;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (!user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;
  if (!user.planSelectedAt && !isPlatformAdminUser(user)) return <Navigate to={onboardingDestination(user.intendedPlan)} replace />;
  return <PlatformShell>{children}</PlatformShell>;
}

function PlatformAdminRoute({ children }) {
  const location = useLocation();
  const { user, status } = useAuth();
  if (status === "loading") return <SessionGate />;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;
  if (!isPlatformAdminUser(user)) return <Navigate to="/signals" replace />;
  return <AdminShell>{children}</AdminShell>;
}

function LegacyEditorToolRedirect({ tool }) {
  const { id } = useParams();
  return <Navigate to={`/editor/${id}?tool=${tool}`} replace />;
}

export default function App() {
  return <AuthProvider><PreferenceSync /><ProjectProvider><Suspense fallback={<SessionGate label="Loading Voxora…" />}><Routes>
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
    <Route path="/payment-result" element={<PaymentResultPage />} />
    <Route path="/review/:token" element={<ReviewPage />} />
    <Route path="/my-research" element={<ProtectedRoute><MyResearchPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/platform-admin" element={<Navigate to="/admin" replace />} />
    <Route path="/admin" element={<PlatformAdminRoute><PlatformAdminPage key="overview" view="overview" /></PlatformAdminRoute>} />
    <Route path="/admin/users" element={<PlatformAdminRoute><PlatformAdminPage key="users" view="users" /></PlatformAdminRoute>} />
    <Route path="/admin/projects" element={<PlatformAdminRoute><PlatformAdminPage key="projects" view="projects" /></PlatformAdminRoute>} />
    <Route path="/admin/subscriptions" element={<PlatformAdminRoute><PlatformAdminPage key="subscriptions" view="subscriptions" /></PlatformAdminRoute>} />
    <Route path="/admin/activity" element={<PlatformAdminRoute><PlatformAdminPage key="activity" view="activity" /></PlatformAdminRoute>} />
    <Route path="/admin/plans" element={<PlatformAdminRoute><AdminManagementPage key="plans" section="plans" /></PlatformAdminRoute>} />
    <Route path="/admin/master-data" element={<PlatformAdminRoute><AdminManagementPage key="master-data" section="master-data" /></PlatformAdminRoute>} />
    <Route path="/admin/settings" element={<PlatformAdminRoute><AdminManagementPage key="settings" section="settings" /></PlatformAdminRoute>} />
    <Route path="/admin/audit" element={<PlatformAdminRoute><AdminManagementPage key="audit" section="audit" /></PlatformAdminRoute>} />
    <Route path="/admin/integrations" element={<PlatformAdminRoute><AdminManagementPage key="integrations" section="integrations" /></PlatformAdminRoute>} />
    <Route path="/admin/pipelines" element={<PlatformAdminRoute><AdminPipelinesPage /></PlatformAdminRoute>} />
    <Route path="/admin/model-pool" element={<PlatformAdminRoute><AdminModelPoolPage /></PlatformAdminRoute>} />
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
  </Routes></Suspense></ProjectProvider></AuthProvider>;
}
