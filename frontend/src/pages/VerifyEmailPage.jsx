import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "./AuthPage.css";

export default function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const token = new URLSearchParams(location.search).get("token") || "";
  const hasToken = Boolean(token);
  const [status, setStatus] = useState(hasToken ? "working" : "error");
  const [message, setMessage] = useState(hasToken ? "" : "Verification token is missing.");

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Verification failed.");
        if (cancelled) return;
        await refresh();
        if (cancelled) return;
        setStatus("done");
        setMessage("Your email is verified. Redirecting to your workspace…");
        window.setTimeout(() => navigate("/my-research", { replace: true }), 900);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage(err.message || "Verification failed.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, refresh, token]);

  return (
    <div className="hx-page auth-page">
      <Header right={<Link to="/signin" className="btn btn-ghost">Sign in</Link>} />
      <main className="container auth-page__main">
        <section className="auth-card">
          <p className="eyebrow">Email verification</p>
          <h1>{status === "working" ? "Verifying your email…" : status === "done" ? "Email verified." : "Verification failed."}</h1>
          <p>{message}</p>
          {status === "error" && <Link className="btn btn-cream" to="/signin">Back to sign in</Link>}
        </section>
      </main>
    </div>
  );
}
