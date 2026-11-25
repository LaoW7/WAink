"use client";

import { ChevronDown, Eye, EyeOff, KeyRound, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { translations, type Locale } from "@/lib/i18n";
import {
  hasInternationalNode, presets, providers, resolveModelNode, resolveProvider,
  type Credentials, type Provider, type ModelRegion,
} from "@/lib/model-providers";
import { completionEndpoint } from "@/lib/scan";
import type { TrialStatus } from "@/lib/trial-client";
import { TrialSettings } from "./trial-settings";

export function ModelSettings({
  locale, config, trial, preferTrial, onTrialChange, onClose, onSave, onClear,
}: {
  locale: Locale;
  config: Credentials | null;
  trial: TrialStatus;
  preferTrial: boolean;
  onTrialChange: (status: TrialStatus) => void;
  onClose: () => void;
  onSave: (config: Credentials) => void;
  onClear: () => void;
}) {
  const t = translations[locale].settings;
  const providerLabels = translations[locale].providers;
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Credentials>(
    () => config ?? { provider: "auto", model: providers.auto.model, apiKey: "", baseUrl: "" },
  );
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [trialTab, setTrialTab] = useState(preferTrial || !config);
  const node = resolveModelNode(draft.provider, draft.model, draft.region);
  const showRegion = hasInternationalNode(node?.provider);

  useEffect(() => {
    const current = dialog.current;
    current?.showModal();
    return () => { current?.close(); };
  }, []);

  function changeProvider(provider: Provider) {
    setError("");
    setDraft((old) => {
      if (config?.provider === provider) return config;
      const useCurrentModel = provider === "auto" && old.provider !== "custom" && resolveProvider("auto", old.model);
      const model = useCurrentModel ? old.model : providers[provider].model;
      const previous = resolveProvider(old.provider, old.model);
      const sameProvider = previous && previous === resolveProvider(provider, model);
      return {
        provider,
        model,
        apiKey: sameProvider ? old.apiKey : "",
        baseUrl: "",
        region: sameProvider ? old.region : undefined,
      };
    });
  }

  function changeModel(model: string) {
    setError("");
    setDraft((old) => {
      const changedProvider = old.provider === "auto" && resolveProvider("auto", old.model) !== resolveProvider("auto", model);
      return changedProvider ? { ...old, model, apiKey: "", region: undefined } : { ...old, model };
    });
  }

  function changeRegion(region: ModelRegion) {
    setError("");
    setDraft((old) => ({ ...old, region, apiKey: "" }));
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const apiKey = draft.apiKey.trim();
    const model = draft.model.trim();
    if (!/^[\x21-\x7E]{1,2048}$/.test(apiKey)) {
      setError(t.errInvalidKey);
      return;
    }
    if (!/^[\w.:/@+-]{1,180}$/.test(model)) {
      setError(t.errInvalidModel);
      return;
    }
    if (draft.provider === "auto" && !resolveProvider("auto", model)) {
      setError(t.errUnmatchedAuto);
      return;
    }
    const baseUrl = draft.baseUrl.trim();
    try {
      if (draft.provider === "custom") completionEndpoint(baseUrl, locale);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errCheckEndpoint);
      return;
    }
    onSave({ ...draft, apiKey, model, baseUrl });
  }

  return (
    <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dialog-heading">
        <div className="dialog-icon"><Settings2 size={22} aria-hidden /></div>
        <button type="button" className="icon-button" aria-label={t.closeAria} onClick={onClose}>
          <X size={21} aria-hidden />
        </button>
      </div>
      <h2 id="settings-title">{t.title}</h2>
      {trial.available && !trial.model && (
        <div className="mode-tabs settings-modes" aria-label={t.modeAria}>
          <button type="button" aria-pressed={!trialTab} onClick={() => setTrialTab(false)}>{t.tabOwn}</button>
          <button type="button" aria-pressed={trialTab} onClick={() => setTrialTab(true)}>{t.tabTrial}</button>
        </div>
      )}
      {trial.available && (trialTab || trial.model) ? (
        <TrialSettings locale={locale} trial={trial} onChange={onTrialChange} />
      ) : (
      <form onSubmit={save}>
        <p className="muted dialog-intro">{t.intro}</p>
        <label className="field">
          <span>{t.providerLabel}</span>
          <span className="select-shell">
            <select value={draft.provider} onChange={(event) => changeProvider(event.target.value as Provider)}>
              {(Object.keys(providers) as Provider[]).map((id) => (
                <option key={id} value={id}>{providerLabels[id]}</option>
              ))}
            </select>
            <ChevronDown size={18} aria-hidden />
          </span>
        </label>
        {draft.provider === "custom" && (
          <label className="field">
            <span>{t.endpointLabel}</span>
            <input type="url" value={draft.baseUrl} placeholder={t.endpointPlaceholder}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              maxLength={500} required autoComplete="off" spellCheck={false} />
            <small>{t.endpointHelp}</small>
          </label>
        )}
        <label className="field">
          <span>{t.modelLabel}</span>
          <input value={draft.model} placeholder={t.modelPlaceholder} maxLength={180}
            list={draft.provider === "auto" ? "vision-model-presets" : undefined}
            onChange={(event) => changeModel(event.target.value)}
            required autoComplete="off" autoCapitalize="off" spellCheck={false} />
          {draft.provider === "auto" && (
            <datalist id="vision-model-presets">
              {(Object.entries(presets) as [keyof typeof presets, (typeof presets)[keyof typeof presets]][]).map(([id, preset]) => (
                <option key={preset.model} value={preset.model} label={providerLabels[id]} />
              ))}
            </datalist>
          )}
          {node && <small>{draft.provider === "auto" ? providerLabels[node.provider] + " · " : t.officialNode}
            {new URL(node.endpoint).hostname}</small>}
          {draft.provider === "auto" && !node && <small>{t.autoHint}</small>}
          {draft.provider === "custom" && <small>{t.customHint}</small>}
        </label>
        {showRegion && (
          <label className="field">
            <span>{t.regionLabel}</span>
            <span className="select-shell">
              <select value={draft.region ?? "cn"} onChange={(event) => changeRegion(event.target.value as ModelRegion)}>
                <option value="cn">{t.regionCn}</option>
                <option value="international">{node?.provider === "qwen" ? t.regionIntlSg : t.regionIntl}</option>
              </select>
              <ChevronDown size={18} aria-hidden />
            </span>
          </label>
        )}
        <div className="field">
          <label htmlFor="api-key">API Key</label>
          <div className="secret-field">
            <input id="api-key" type={showKey ? "text" : "password"} value={draft.apiKey}
              placeholder={t.apiKeyPlaceholder} required maxLength={2048}
              autoComplete="off" autoCapitalize="off" spellCheck={false}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} />
            <button type="button" className="icon-button" aria-label={showKey ? t.hideKey : t.showKey}
              onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff size={19} aria-hidden /> : <Eye size={19} aria-hidden />}
            </button>
          </div>
        </div>
        <p className="privacy-note"><KeyRound size={15} aria-hidden /> {t.privacyNote}</p>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="dialog-actions">
          {config && <button type="button" className="button text-button" onClick={onClear}>{t.clearButton}</button>}
          <button className="button primary" type="submit">{t.saveButton}</button>
        </div>
      </form>
      )}
    </dialog>
  );
}
