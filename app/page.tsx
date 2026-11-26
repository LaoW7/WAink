"use client";

import {
  Camera, CameraOff, Check, ChevronDown, Crosshair, Focus, History, ImagePlus,
  LoaderCircle, ScanLine, Settings2, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { ModelSettings } from "@/components/model-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScanHistory } from "@/components/scan-history";
import { sampleRecords, ScanReport, type ScanRecord } from "@/components/scan-report";
import { MOBILE_REPORT_VIEWPORT, ScanResultSheet } from "@/components/scan-result-sheet";
import { ShareCardDialog } from "@/components/share-card-dialog";
import { defaultScanPreferences, readBrowserSettings, writeModelSettings, writeScanPreferences, writeTrialPreference, type ScanPreferences } from "@/lib/browser-settings";
import { cameraError, captureFrame, loadPhoto, useVehicleDetector } from "@/lib/camera";
import { computeScanCacheKey, findCachedScan, saveHistoryFrame, saveHistoryOutcome, type ScanOutcome, type ScanSource } from "@/lib/history";
import { DEFAULT_LOCALE, htmlLang, resolveInitialLocale, translations, writeStoredLocale, type Locale } from "@/lib/i18n";
import { resolveProvider, type Credentials } from "@/lib/model-providers";
import { callVision, completionEndpoint, makeScanReplySchema, scanInputSchema, type ScanMode } from "@/lib/scan";
import { inactiveTrial, requestTrial } from "@/lib/trial-client";
import { type TargetBox } from "@/lib/vehicle-lock";

type Frame = { kind: "sample" } | { kind: "live" } | { kind: "photo" | "capture"; data: string };
type ScanJob = { id: string; controller: AbortController; saved: Promise<boolean> };
const SAMPLE: Frame = { kind: "sample" };

export default function ScannerPage() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [config, setConfig] = useState<Credentials | null>(null);
  const [persistKey, setPersistKey] = useState(false);
  const [trial, setTrial] = useState(inactiveTrial);
  const [preferTrial, setPreferTrial] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [storageWarning, setStorageWarning] = useState("");
  const [frame, setFrame] = useState<Frame>(SAMPLE);
  const [record, setRecord] = useState<ScanRecord | null>(sampleRecords[DEFAULT_LOCALE]);
  const [resultSheetOpen, setResultSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [preferences, setPreferences] = useState(defaultScanPreferences);
  const { mode, note } = preferences;
  const [openingCamera, setOpeningCamera] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [systemCamera, setSystemCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const scannerHeading = useRef<HTMLHeadingElement>(null);
  const webcam = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef<ScanJob | null>(null);
  const cacheLookupPending = useRef(false);
  const generation = useRef(0);
  const t = translations[locale];
  const videoActive = frame.kind === "live";
  const captured = frame.kind === "capture";
  const filePreview = frame.kind === "photo" || captured;
  const personalConfig = preferTrial ? null : config;
  const activeModel = preferTrial ? trial.model : personalConfig?.model;
  const modelLabel = personalConfig
    ? t.providers[resolveProvider(personalConfig.provider, personalConfig.model) ?? personalConfig.provider]
    : t.trialAccountLabel;
  const displayRecord = frame.kind === "sample" && record ? sampleRecords[locale] : record;
  const shareImage = filePreview ? frame.data : "/sample-tesla.jpg";
  const canShare = Boolean(displayRecord && !busy);

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    document.title = translations[locale].pageTitle;
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const initialLocale = resolveInitialLocale();
    setLocale(initialLocale);
    try {
      const saved = readBrowserSettings();
      setConfig(saved.config);
      setPersistKey(saved.persistKey);
      setPreferences(saved.preferences);
      setPreferTrial(saved.preferTrial);
    } catch {
      setStorageWarning(translations[initialLocale].warnReadSettings);
    }
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    void requestTrial({ signal: controller.signal }, initialLocale)
      .then((status) => {
        if (!mounted) return;
        setTrial(status);
        if (status.model) setPreferTrial(true);
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timeout);
        if (mounted) setSettingsReady(true);
      });
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  function toggleLocale() {
    const next: Locale = locale === "en" ? "zh" : "en";
    setLocale(next);
    writeStoredLocale(next);
    setError("");
    setStorageWarning("");
  }

  function updateConfig(next: Credentials | null, persist = persistKey) {
    setConfig(next);
    setPersistKey(next ? persist : false);
    try {
      writeModelSettings(next, persist);
    } catch {
      setStorageWarning(next ? t.warnSaveConfigOk : t.warnClearConfigFail);
    }
  }

  function updatePreferences(next: ScanPreferences) {
    setPreferences(next);
    try {
      writeScanPreferences(next);
    } catch {
      setStorageWarning(t.warnSavePrefsFail);
    }
  }

  function updateTrialPreference(next: boolean) {
    setPreferTrial(next);
    try {
      writeTrialPreference(next);
    } catch {
      setStorageWarning(t.warnSaveTrialFail);
    }
  }

  const stopStream = useCallback(() => {
    const media = stream.current;
    stream.current = null;
    media?.getTracks().forEach((track) => track.stop());
  }, []);

  const dismissResultSheet = useCallback(() => {
    setResultSheetOpen(false);
    setShareOpen(false);
  }, []);

  function presentResult(next: ScanRecord) {
    setShareOpen(false);
    setRecord(next);
    setResultSheetOpen(window.matchMedia(MOBILE_REPORT_VIEWPORT).matches);
  }

  const finishScan = useCallback((job: ScanJob, outcome: ScanOutcome, activeLocale: Locale) => {
    if (request.current !== job) return false;
    request.current = null;
    setBusy(false);
    void job.saved.then(async (saved) => {
      if (!saved) return;
      await saveHistoryOutcome(job.id, outcome);
      setHistoryRevision((revision) => revision + 1);
    }).catch(() => setStorageWarning(translations[activeLocale].warnSaveOutcomeFail));
    return true;
  }, []);

  const stopScan = useCallback(() => {
    const job = request.current;
    if (job) {
      finishScan(job, { status: "cancelled", message: t.scanCancelled }, locale);
      job.controller.abort();
    }
    dismissResultSheet();
  }, [finishScan, dismissResultSheet, locale, t.scanCancelled]);

  useEffect(() => {
    function leavePage() {
      ++generation.current;
      stopStream();
      stopScan();
      setOpeningCamera(false);
      setReadingFile(false);
      setCameraReady(false);
      setFrame(SAMPLE);
      setRecord(sampleRecords[locale]);
    }

    window.addEventListener("pagehide", leavePage);
    return () => {
      window.removeEventListener("pagehide", leavePage);
      ++generation.current;
      stopStream();
      const job = request.current;
      request.current = null;
      job?.controller.abort();
    };
  }, [stopStream, stopScan, locale]);

  useEffect(() => {
    const video = webcam.current;
    const current = stream.current;
    if (!videoActive || !video || !current) return;
    const track = current.getVideoTracks()[0];

    function interrupted() {
      if (stream.current !== current) return;
      stopScan();
      stopStream();
      setCameraReady(false);
      setFrame(SAMPLE);
      setRecord(sampleRecords[locale]);
      setSystemCamera(true);
      setError(t.cameraDisconnected);
    }

    video.srcObject = current;
    track?.addEventListener("ended", interrupted);
    void video.play().catch(interrupted);

    return () => {
      video.srcObject = null;
      track?.removeEventListener("ended", interrupted);
    };
  }, [videoActive, stopStream, stopScan, locale, t.cameraDisconnected]);

  async function openCamera() {
    if (!settingsReady || openingCamera || readingFile || request.current) return;
    if (!activeModel) {
      setSettingsOpen(true);
      return;
    }
    setError("");
    setSystemCamera(false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setSystemCamera(true);
      setError(cameraError(null, locale));
      return;
    }
    const current = ++generation.current;
    setOpeningCamera(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      if (generation.current !== current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stopScan();
      stopStream();
      stream.current = media;
      setCameraReady(false);
      setFrame({ kind: "live" });
      setRecord(null);
    } catch (cause) {
      if (generation.current !== current) return;
      setSystemCamera(true);
      setError(cameraError(cause, locale));
    } finally {
      if (generation.current === current) setOpeningCamera(false);
    }
  }

  function startFromResult() {
    dismissResultSheet();
    scannerHeading.current?.focus({ preventScroll: true });
    scannerHeading.current?.scrollIntoView({ block: "start" });
    void openCamera();
  }

  function closeCamera() {
    ++generation.current;
    stopScan();
    stopStream();
    setCameraReady(false);
    setError("");
    setFrame(SAMPLE);
    setRecord(sampleRecords[locale]);
  }

  async function scanImage(image: string, scanMode: ScanMode, source: ScanSource, bypassCache = false) {
    if (!activeModel || request.current || cacheLookupPending.current) return;
    const scanLocale = locale;
    const copy = translations[scanLocale];
    const input = scanInputSchema.safeParse({ image, mode: scanMode, note, model: activeModel, lang: scanLocale });
    if (!input.success) {
      setError(copy.errInvalidPhoto);
      return;
    }

    if (source === "camera") {
      stopStream();
      setCameraReady(false);
      setFrame({ kind: "capture", data: image });
    }

    const scanGeneration = generation.current;
    cacheLookupPending.current = true;
    let cacheKey: string | undefined;
    try {
      cacheKey = await computeScanCacheKey({ image, mode: scanMode, lang: scanLocale, note }).catch(() => undefined);
      if (!bypassCache && cacheKey) {
        const cached = await findCachedScan(cacheKey).catch(() => null);
        if (cached && generation.current === scanGeneration) {
          setError("");
          presentResult({ ...cached.reply, model: cached.model, lang: cached.lang ?? scanLocale });
          return;
        }
      }
      if (generation.current !== scanGeneration || request.current) return;
    } finally {
      cacheLookupPending.current = false;
    }

    const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16).padStart(8, "0")).join("");
    const controller = new AbortController();
    const saved = saveHistoryFrame({ id, createdAt: Date.now(), source, model: activeModel, lang: scanLocale, cacheKey }, image)
      .then(() => {
        setHistoryRevision((revision) => revision + 1);
        return true;
      }, () => {
        setStorageWarning(copy.warnSaveFrameFail);
        return false;
      });
    const job = { id, controller, saved };
    request.current = job;
    setError("");
    setBusy(true);
    setRecord(null);
    dismissResultSheet();
    const timeout = window.setTimeout(() => {
      if (finishScan(job, { status: "failed", message: copy.errTimeout }, scanLocale)) {
        controller.abort();
        setError(copy.errTimeout);
      }
    }, 60_000);

    try {
      await saved;
      if (request.current !== job) return;
      let result;
      if (personalConfig?.provider === "custom") {
        try {
          result = await callVision({
            endpoint: completionEndpoint(personalConfig.baseUrl, scanLocale), apiKey: personalConfig.apiKey,
            input: input.data, signal: controller.signal, reasoningEffort: "low",
          });
        } catch (cause) {
          if (cause instanceof Error && (cause.message.startsWith("连接模型服务失败") || cause.message.startsWith("Failed to connect to the model service"))) {
            throw new Error(copy.errCustomCors);
          }
          throw cause;
        }
      } else {
        const query = new URLSearchParams({ provider: personalConfig?.provider ?? "trial", lang: scanLocale });
        if (personalConfig?.region) query.set("region", personalConfig.region);
        const response = await fetch("/api/scan?" + query, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(personalConfig ? { authorization: "Bearer " + personalConfig.apiKey } : {}),
          },
          body: JSON.stringify(input.data),
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          if (!personalConfig && response.status === 401) setTrial((current) => ({ ...current, model: null }));
          const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error : copy.errCallFailed;
          throw new Error(message);
        }
        result = makeScanReplySchema(scanLocale).parse(data);
      }
      if (finishScan(job, { status: "completed", reply: result }, scanLocale)) {
        presentResult({ ...result, model: activeModel, lang: scanLocale });
      }
    } catch (cause) {
      const errorMessage = cause instanceof Error && cause.name !== "ZodError" ? cause.message : copy.errReadResult;
      const message = errorMessage === "Failed to fetch" ? copy.errNetworkDown : errorMessage;
      if (finishScan(job, { status: "failed", message }, scanLocale)) {
        setError(message);
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function autoCapture(video: HTMLVideoElement, target?: TargetBox) {
    if (!activeModel || settingsOpen || historyOpen || request.current) return;
    try {
      void scanImage(captureFrame(video, target, locale), "vehicle", "camera");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errCaptureFail);
    }
  }

  const aim = useVehicleDetector({
    video: webcam,
    active: videoActive && cameraReady,
    armed: !!activeModel && !busy && !settingsOpen && !historyOpen && !readingFile,
    onCapture: autoCapture,
  });

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || request.current || cacheLookupPending.current) return;
    const current = ++generation.current;
    setOpeningCamera(false);
    setReadingFile(true);
    setError("");
    try {
      const data = await loadPhoto(file, locale);
      if (generation.current !== current) return;
      stopScan();
      stopStream();
      setCameraReady(false);
      setSystemCamera(false);
      setFrame({ kind: "photo", data });
      setRecord(null);
      if (activeModel) void scanImage(data, mode, "photo");
    } catch (cause) {
      if (generation.current === current) {
        setError(cause instanceof Error ? cause.message : t.errLoadPhotoFail);
      }
    } finally {
      if (generation.current === current) setReadingFile(false);
    }
  }

  let targetStatus: string = t.aimWaiting;
  if (videoActive) {
    if (!activeModel) targetStatus = preferTrial ? t.aimNeedsTrial : t.aimNeedsModel;
    else if (aim.phase === "loading") targetStatus = t.aimLoading;
    else if (aim.phase === "unavailable") targetStatus = t.aimUnavailable;
    else if (aim.phase === "locking") targetStatus = t.aimLocking;
    else if (aim.phase === "captured") targetStatus = t.aimCaptured;
  }

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <div className="brand">
            <img className="brand-icon" src="/app-icon-64.png" width={40} height={40} alt="" />
            <span>{t.brand}</span>
          </div>
          <div className="topbar-actions">
            {activeModel && <span className="model-status" title={modelLabel}>{modelLabel}</span>}
            <button className="button settings-button" aria-label={t.historyButton} title={t.historyButton}
              disabled={!settingsReady} onClick={() => setHistoryOpen(true)}>
              <History size={18} aria-hidden /><span className="toolbar-label">{t.historyButton}</span>
            </button>
            <button className="button settings-button" aria-label={t.settingsButton} title={t.settingsButton} disabled={!settingsReady}
              onClick={() => setSettingsOpen(true)}>
              <Settings2 size={18} aria-hidden /><span className="toolbar-label">{t.settingsButton}</span>
            </button>
            <LanguageToggle locale={locale} onToggle={toggleLocale} />
            <ThemeToggle locale={locale} />
          </div>
        </div>
      </header>

      <main className="shell">
        <div className="intro">
          <h1>{t.brand}</h1>
          <p>{t.tagline}</p>
        </div>

        <div className="workspace">
          <section className="panel scanner" aria-labelledby="camera-title">
            <div className="panel-heading">
              <h2 id="camera-title" ref={scannerHeading} tabIndex={-1}><Crosshair aria-hidden />{t.viewfinderTitle}</h2>
              {(videoActive || captured || filePreview) && (
                <span className={videoActive ? "pill connected" : "pill frame-label"}>
                  {videoActive && <span className="indicator" />}
                  {videoActive ? t.liveFeed : captured ? t.cameraOff : t.photoLoaded}
                </span>
              )}
            </div>

            <div className={"viewfinder " + (filePreview ? "uploaded" : "")}>
              {videoActive ? (
                <video ref={webcam} autoPlay muted playsInline aria-label={t.liveCameraAria}
                  onPlaying={() => setCameraReady(true)} />
              ) : (
                <img src={filePreview ? frame.data : "/sample-tesla.jpg"}
                  alt={captured ? t.altCaptured : filePreview ? t.altPhoto : t.altSample} />
              )}
              <div className="finder-overlay" aria-hidden>
                {(videoActive || (captured && busy)) && (
                  <div className="aim">
                    <span className={"reticle " + (videoActive && aim.phase === "locking" ? "locking" : "")}
                      style={{ "--ring-angle": (busy && captured ? 360 : videoActive ? aim.progress * 360 : 0) + "deg" } as CSSProperties}>
                      <span className="reticle-progress" />
                      {busy ? <LoaderCircle className="spin" size={26} /> :
                        videoActive && aim.phase === "captured" && !error ? <Check size={28} /> : <Crosshair size={25} />}
                    </span>
                    {videoActive && <span className="aim-label">{targetStatus}</span>}
                  </div>
                )}
                {busy && frame.kind === "photo" && <span className="scanning-line" />}
              </div>
              <div className="viewfinder-caption">
                {videoActive ? (cameraReady ? t.captionRearPreferred : t.captionStarting)
                  : captured ? t.captionLocked : filePreview ? t.captionPreview : t.captionSample}
              </div>
            </div>
            {videoActive && <span className="sr-only" role="status">{targetStatus}</span>}

            {frame.kind === "photo" && (
              <div className="mode-tabs" aria-label={t.scanModeAria}>
                {(Object.keys(t.modes) as ScanMode[]).map((id) => (
                  <button key={id} disabled={busy} aria-pressed={mode === id}
                    onClick={() => updatePreferences({ ...preferences, mode: id })}>{t.modes[id]}</button>
                ))}
              </div>
            )}

            <div className="scanner-actions">
              {videoActive ? (
                <>
                  <button className="button primary" onClick={closeCamera}><CameraOff size={19} aria-hidden />{t.closeCamera}</button>
                  {!activeModel && <button className="button secondary" onClick={() => setSettingsOpen(true)}>
                    <Settings2 size={18} aria-hidden />{t.configureAi}
                  </button>}
                  {activeModel && aim.phase === "unavailable" && (
                    <button className="button secondary" disabled={!cameraReady || busy}
                      onClick={() => { if (webcam.current) autoCapture(webcam.current); }}>
                      <Focus size={18} aria-hidden />{t.scanFrame}
                    </button>
                  )}
                </>
              ) : (
                <button className="button primary" disabled={!settingsReady || openingCamera || readingFile || busy}
                  onClick={() => void openCamera()}>
                  {openingCamera || busy
                    ? <LoaderCircle className="spin" size={19} aria-hidden />
                    : <Camera size={19} aria-hidden />}
                  {busy ? t.scanning : openingCamera ? t.openingCamera : t.startScan}
                </button>
              )}
              <button className="button secondary" disabled={!settingsReady || readingFile || busy}
                onClick={() => fileInput.current?.click()}>
                {readingFile ? <LoaderCircle className="spin" size={19} aria-hidden /> : <ImagePlus size={19} aria-hidden />}
                {readingFile ? t.readingPhoto : t.uploadPhoto}
              </button>
              {systemCamera && !videoActive && <button className="button text-button" disabled={readingFile || busy}
                onClick={() => cameraInput.current?.click()}>{t.systemCamera}</button>}
              {frame.kind === "photo" && !busy && <button className="button text-button"
                onClick={() => activeModel ? void scanImage(frame.data, mode, "photo", Boolean(record)) : setSettingsOpen(true)}>
                <ScanLine size={18} aria-hidden />{activeModel ? (record ? t.rescanPhoto : t.scanPhoto) : t.configureAiScan}
              </button>}
              {busy && <button className="button text-button" onClick={() => {
                stopScan();
                setError(t.scanCancelled);
              }}>
                <X size={17} aria-hidden />{t.cancelScan}
              </button>}
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => void selectPhoto(event)} />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void selectPhoto(event)} />

            {error && <p className="error-message scan-error" role="alert">{error}</p>}
            {storageWarning && <p className="error-message scan-error" role="status">{storageWarning}</p>}
            <div className="scanner-bottom">
              <p>{videoActive ? t.hintLive : captured && busy ? t.hintCapturedBusy : captured ? t.hintCapturedIdle : t.hintDefault}</p>
              <details className="note-field">
                <summary>{t.extraClues} <ChevronDown size={15} aria-hidden /></summary>
                <label htmlFor="scan-note">{t.extraCluesHelp}</label>
                <textarea id="scan-note" value={note} maxLength={280} rows={2} disabled={!settingsReady}
                  onChange={(event) => updatePreferences({ ...preferences, note: event.target.value })} />
              </details>
            </div>
          </section>

          <ScanReport
            locale={locale}
            record={displayRecord}
            busy={busy}
            awaiting={videoActive ? t.awaitingLive : captured ? t.awaitingCaptured : t.awaitingDefault}
            onShare={canShare ? () => setShareOpen(true) : undefined}
          />
        </div>

        <footer className="footer">
          <span>{t.footerPrivacy}</span>
        </footer>
      </main>

      {settingsOpen && <ModelSettings locale={locale} config={config} persistKey={persistKey} trial={trial} preferTrial={preferTrial} onClose={() => setSettingsOpen(false)}
        onTrialChange={(status) => {
          stopScan();
          setTrial(status);
          updateTrialPreference(!!status.model);
          setSettingsOpen(false);
          setError("");
        }}
        onSave={(next, persist) => { updateConfig(next, persist); updateTrialPreference(false); setSettingsOpen(false); setError(""); }}
        onClear={() => { stopScan(); updateConfig(null, false); setSettingsOpen(false); setError(""); }} />}
      {historyOpen && <ScanHistory locale={locale} revision={historyRevision} activeId={request.current?.id}
        onClose={() => setHistoryOpen(false)} />}
      {resultSheetOpen && displayRecord && !settingsOpen && !historyOpen && (
        <ScanResultSheet
          locale={locale}
          record={displayRecord}
          onDismiss={dismissResultSheet}
          onStartScan={startFromResult}
          onShare={canShare ? () => setShareOpen(true) : undefined}
        />
      )}
      {shareOpen && displayRecord && canShare && (
        <ShareCardDialog
          locale={locale}
          record={displayRecord}
          image={shareImage}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}
