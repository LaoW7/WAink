"use client";

import { ChevronDown, Eye, EyeOff, KeyRound, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  hasInternationalNode, presets, providers, resolveModelNode, resolveProvider,
  type Credentials, type Provider, type ModelRegion,
} from "@/lib/model-providers";
import { completionEndpoint } from "@/lib/scan";
import type { TrialStatus } from "@/lib/trial-client";
import { TrialSettings } from "./trial-settings";

export function ModelSettings({
  config, trial, preferTrial, onTrialChange, onClose, onSave, onClear,
}: {
  config: Credentials | null;
  trial: TrialStatus;
  preferTrial: boolean;
  onTrialChange: (status: TrialStatus) => void;
  onClose: () => void;
  onSave: (config: Credentials) => void;
  onClear: () => void;
}) {
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
      setError("请输入有效的 API Key。");
      return;
    }
    if (!/^[\w.:/@+-]{1,180}$/.test(model)) {
      setError("请输入模型服务提供的模型名称。");
      return;
    }
    if (draft.provider === "auto" && !resolveProvider("auto", model)) {
      setError("无法从此模型名称匹配节点。请选择服务商或使用自定义接口。");
      return;
    }
    const baseUrl = draft.baseUrl.trim();
    try {
      if (draft.provider === "custom") completionEndpoint(baseUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请检查接口地址。");
      return;
    }
    onSave({ ...draft, apiKey, model, baseUrl });
  }

  return (
    <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dialog-heading">
        <div className="dialog-icon"><Settings2 size={22} aria-hidden /></div>
        <button type="button" className="icon-button" aria-label="关闭模型设置" onClick={onClose}>
          <X size={21} aria-hidden />
        </button>
      </div>
      <h2 id="settings-title">配置你的 AI</h2>
      {trial.available && !trial.model && (
        <div className="mode-tabs settings-modes" aria-label="模型接入方式">
          <button type="button" aria-pressed={!trialTab} onClick={() => setTrialTab(false)}>自己的 API</button>
          <button type="button" aria-pressed={trialTab} onClick={() => setTrialTab(true)}>体验账户</button>
        </div>
      )}
      {trial.available && (trialTab || trial.model) ? <TrialSettings trial={trial} onChange={onTrialChange} /> : (
      <form onSubmit={save}>
        <p className="muted dialog-intro">先找个眼神好的。选支持图片输入的模型，再填 API Key。</p>
        <label className="field">
          <span>模型服务</span>
          <span className="select-shell">
            <select value={draft.provider} onChange={(event) => changeProvider(event.target.value as Provider)}>
              {Object.entries(providers).map(([id, provider]) => <option key={id} value={id}>{provider.label}</option>)}
            </select>
            <ChevronDown size={18} aria-hidden />
          </span>
        </label>
        {draft.provider === "custom" && (
          <label className="field">
            <span>接口地址</span>
            <input type="url" value={draft.baseUrl} placeholder="https://api.example.com/v1"
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              maxLength={500} required autoComplete="off" spellCheck={false} />
            <small>使用 Chat Completions 接口。图片和 Key 由浏览器发往此地址，接口需允许跨域请求。</small>
          </label>
        )}
        <label className="field">
          <span>模型名称</span>
          <input value={draft.model} placeholder="输入可识别图片的模型 ID" maxLength={180}
            list={draft.provider === "auto" ? "vision-model-presets" : undefined}
            onChange={(event) => changeModel(event.target.value)}
            required autoComplete="off" autoCapitalize="off" spellCheck={false} />
          {draft.provider === "auto" && (
            <datalist id="vision-model-presets">
              {Object.values(presets).map((preset) => <option key={preset.model} value={preset.model} label={preset.label} />)}
            </datalist>
          )}
          {node && <small>{draft.provider === "auto" ? providers[node.provider].label + " · " : "官方节点 · "}
            {new URL(node.endpoint).hostname}</small>}
          {draft.provider === "auto" && !node && <small>可选择预设视觉模型，或为此模型手动选择服务商。</small>}
          {draft.provider === "custom" && <small>可换成接口支持的视觉模型。接口支持时自动使用低思考。</small>}
        </label>
        {showRegion && (
          <label className="field">
            <span>API Key 所属地区</span>
            <span className="select-shell">
              <select value={draft.region ?? "cn"} onChange={(event) => changeRegion(event.target.value as ModelRegion)}>
                <option value="cn">中国内地</option>
                <option value="international">{node?.provider === "qwen" ? "国际站（新加坡）" : "国际站"}</option>
              </select>
              <ChevronDown size={18} aria-hidden />
            </span>
          </label>
        )}
        <div className="field">
          <label htmlFor="api-key">API Key</label>
          <div className="secret-field">
            <input id="api-key" type={showKey ? "text" : "password"} value={draft.apiKey}
              placeholder="粘贴你的 API Key" required maxLength={2048}
              autoComplete="off" autoCapitalize="off" spellCheck={false}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} />
            <button type="button" className="icon-button" aria-label={showKey ? "隐藏 Key" : "显示 Key"}
              onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff size={19} aria-hidden /> : <Eye size={19} aria-hidden />}
            </button>
          </div>
        </div>
        <p className="privacy-note"><KeyRound size={15} aria-hidden /> Key 保存在当前浏览器，可在此清除。</p>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="dialog-actions">
          {config && <button type="button" className="button text-button" onClick={onClear}>清除配置</button>}
          <button className="button primary" type="submit">启用模型</button>
        </div>
      </form>
      )}
    </dialog>
  );
}
