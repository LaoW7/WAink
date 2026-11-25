"use client";

import { useState, type FormEvent } from "react";
import { translations, type Locale } from "@/lib/i18n";
import { requestTrial, type TrialStatus } from "@/lib/trial-client";

export function TrialSettings({
  locale, trial, onChange,
}: {
  locale: Locale;
  trial: TrialStatus;
  onChange: (status: TrialStatus) => void;
}) {
  const t = translations[locale].trial;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function changeAccess(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const status = await requestTrial(trial.model ? { method: "DELETE" } : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }, locale);
      onChange(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.connectError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void changeAccess(event)}>
      <p className="muted dialog-intro">
        {trial.model ? `${t.usingPrefix}${trial.model}.` : t.enterPasswordPrompt}
        {trial.hourlyLimit !== null && `${t.hourlyLimitPrefix}${trial.hourlyLimit}${t.hourlyLimitSuffix}`}
      </p>
      {!trial.model && (
        <label className="field">
          <span>{t.passwordLabel}</span>
          <input type="password" autoComplete="off" required maxLength={256}
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? t.wait : trial.model ? t.exit : t.enable}
        </button>
      </div>
    </form>
  );
}
