import { useEffect, useState } from "react";
import "./IntegrationsWarningBanner.css";

// Checks /api/health/integrations once and shows a dismissible warning if
// any required external API key is missing. This exists because most of
// these missing-key cases fail *gracefully but silently* deep in the
// pipeline (e.g. research finds zero sources, narration/B-roll steps
// throw only once the user has already waited through earlier stages).
// Surfacing it here, before the user starts a run, saves that wasted wait.
export default function IntegrationsWarningBanner() {
  const [warnings, setWarnings] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/integrations")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.warnings) && data.warnings.length) setWarnings(data.warnings);
      })
      .catch(() => {
        // Non-critical: if the health check itself fails, just don't show
        // the banner rather than blocking the page.
      });
    return () => { cancelled = true; };
  }, []);

  if (dismissed || !warnings.length) return null;

  return (
    <div className="integrations-warning" role="alert">
      <div className="integrations-warning__body">
        <strong>Some AI integrations aren't configured on this server yet:</strong>
        <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        <p>You can still continue, but the affected step will fail or produce a limited result until the missing key is added.</p>
      </div>
      <button type="button" className="integrations-warning__dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">×</button>
    </div>
  );
}
