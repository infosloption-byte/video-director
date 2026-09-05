import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import SignalsPage from "./pages/SignalsPage";
import ResearchPage from "./pages/ResearchPage";
import StoryboardPage from "./pages/StoryboardPage";
import ReviewPage from "./pages/ReviewPage";
import MyResearchPage from "./pages/MyResearchPage";
import AccountPage from "./pages/AccountPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import PlatformShell from "./components/PlatformShell";
import EditorWorkspace from "./components/EditorWorkspace";
import { AuthProvider, authRequired, useAuth } from "./context/AuthContext";

function SignalsRoute() {
  const { status } = useAuth();
  if (authRequired() && status === "loading") return <div className="hx-page"><main className="container" style={{ padding: "80px 0" }}>Checking your session…</main></div>;
  return <PlatformShell><SignalsPage /></PlatformShell>;
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, status } = useAuth();
  if (!authRequired()) return <PlatformShell>{children}</PlatformShell>;
  if (status === "loading") return <div className="hx-page"><main className="container" style={{ padding: "80px 0" }}>Checking your session…</main></div>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  return <PlatformShell>{children}</PlatformShell>;
}

function LegacyEditorToolRedirect({ tool }) {
  const { id } = useParams();
  return <Navigate to={`/editor/${id}?tool=${tool}`} replace />;
}

export default function App() {
  return <AuthProvider><Routes>
    <Route path="/" element={<SignalsRoute />} />
    <Route path="/signin" element={<SignInPage />} /><Route path="/signup" element={<SignUpPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/review/:token" element={<ReviewPage />} />
    <Route path="/my-research" element={<ProtectedRoute><MyResearchPage /></ProtectedRoute>} />
    <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
    <Route path="/research/:id" element={<ProtectedRoute><ResearchPage /></ProtectedRoute>} />
    <Route path="/storyboard/:id" element={<ProtectedRoute><StoryboardPage /></ProtectedRoute>} />
    <Route path="/editor/:id" element={<ProtectedRoute><EditorWorkspace /></ProtectedRoute>} />
    <Route path="/editor/:id/ai" element={<LegacyEditorToolRedirect tool="ai" />} />
    <Route path="/editor/:id/render" element={<LegacyEditorToolRedirect tool="render" />} />
    <Route path="/editor/:id/media-picker" element={<LegacyEditorToolRedirect tool="media" />} />
    <Route path="/editor/:id/productivity" element={<LegacyEditorToolRedirect tool="productivity" />} />
    <Route path="/media/:id" element={<LegacyEditorToolRedirect tool="media" />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AuthProvider>;
}
