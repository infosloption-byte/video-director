import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import SignalsPage from "./pages/SignalsPage";
import ResearchPage from "./pages/ResearchPage";
import StoryboardPage from "./pages/StoryboardPage";
import AdvancedEditorPage from "./pages/AdvancedEditorPage";
import EditorAIAssistantPage from "./pages/EditorAIAssistantPage";
import EditorRenderPage from "./pages/EditorRenderPage";
import MediaLibraryPage from "./pages/MediaLibraryPage";
import EditorMediaPickerPage from "./pages/EditorMediaPickerPage";
import ProjectProductivityPage from "./pages/ProjectProductivityPage";
import ReviewPage from "./pages/ReviewPage";
import MyResearchPage from "./pages/MyResearchPage";
import AccountPage from "./pages/AccountPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import { AuthProvider, authRequired, useAuth } from "./context/AuthContext";

function ProtectedRoute({ children }) {
  const location = useLocation(); const { user, status } = useAuth();
  if (!authRequired()) return children;
  if (status === "loading") return <div className="hx-page"><main className="container" style={{ padding: "80px 0" }}>Checking your session…</main></div>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  return children;
}

export default function App() {
  return <AuthProvider><Routes>
    <Route path="/" element={<SignalsPage />} />
    <Route path="/signin" element={<SignInPage />} /><Route path="/signup" element={<SignUpPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/review/:token" element={<ReviewPage />} />
    <Route path="/my-research" element={<ProtectedRoute><MyResearchPage /></ProtectedRoute>} />
    <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
    <Route path="/research/:id" element={<ProtectedRoute><ResearchPage /></ProtectedRoute>} />
    <Route path="/storyboard/:id" element={<ProtectedRoute><StoryboardPage /></ProtectedRoute>} />
    <Route path="/editor/:id" element={<ProtectedRoute><AdvancedEditorPage /></ProtectedRoute>} />
    <Route path="/editor/:id/ai" element={<ProtectedRoute><EditorAIAssistantPage /></ProtectedRoute>} />
    <Route path="/editor/:id/render" element={<ProtectedRoute><EditorRenderPage /></ProtectedRoute>} />
    <Route path="/editor/:id/media-picker" element={<ProtectedRoute><EditorMediaPickerPage /></ProtectedRoute>} />
    <Route path="/editor/:id/productivity" element={<ProtectedRoute><ProjectProductivityPage /></ProtectedRoute>} />
    <Route path="/media/:id" element={<ProtectedRoute><MediaLibraryPage /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AuthProvider>;
}
