"use client";

import { useState, type FormEvent } from "react";
import { requestTrial, type TrialStatus } from "@/lib/trial-client";

export function TrialSettings({ trial, onChange }: { trial: TrialStatus; onChange: (status: TrialStatus) => void }) {
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
      });
      onChange(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法连接体验账户。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void changeAccess(event)}>
      <p className="muted dialog-intro">
        {trial.model ? `正在体验 ${trial.model}。` : "输入体验密码，即可使用内置模型。"}
        {trial.hourlyLimit !== null && ` 每个 IP 每小时最多 ${trial.hourlyLimit} 次扫描。`}
      </p>
      {!trial.model && (
        <label className="field">
          <span>体验密码</span>
          <input type="password" autoComplete="off" required maxLength={256}
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? "请稍等…" : trial.model ? "退出体验" : "开启体验"}
        </button>
      </div>
    </form>
  );
}
