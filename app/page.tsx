"use client";

import {
  Camera, CameraOff, Check, ChevronDown, Crosshair, Focus, History, ImagePlus,
  LoaderCircle, ScanLine, Settings2, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { ModelSettings } from "@/components/model-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScanHistory } from "@/components/scan-history";
import { sampleRecord, ScanReport, type ScanRecord } from "@/components/scan-report";
import { MOBILE_REPORT_VIEWPORT, ScanResultSheet } from "@/components/scan-result-sheet";
import { defaultScanPreferences, readBrowserSettings, writeModelSettings, writeScanPreferences, writeTrialPreference, type ScanPreferences } from "@/lib/browser-settings";
import { cameraError, captureFrame, loadPhoto, useVehicleDetector } from "@/lib/camera";
import { saveHistoryFrame, saveHistoryOutcome, type ScanOutcome, type ScanSource } from "@/lib/history";
import { providers, resolveProvider, type Credentials } from "@/lib/model-providers";
import { callVision, completionEndpoint, modes, scanReplySchema, scanInputSchema, type ScanMode } from "@/lib/scan";
import { inactiveTrial, requestTrial } from "@/lib/trial-client";
import { HOLD_MS, type TargetBox } from "@/lib/vehicle-lock";

type Frame = { kind: "sample" } | { kind: "live" } | { kind: "photo" | "capture"; data: string };
type ScanJob = { id: string; controller: AbortController; saved: Promise<boolean> };
const SAMPLE: Frame = { kind: "sample" };

export default function ScannerPage() {
  const [config, setConfig] = useState<Credentials | null>(null);
  const [trial, setTrial] = useState(inactiveTrial);
  const [preferTrial, setPreferTrial] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [storageWarning, setStorageWarning] = useState("");
  const [frame, setFrame] = useState<Frame>(SAMPLE);
  const [record, setRecord] = useState<ScanRecord | null>(sampleRecord);
  const [resultSheetOpen, setResultSheetOpen] = useState(false);
  const [preferences, setPreferences] = useState(defaultScanPreferences);
  const { mode, note } = preferences;
  const [openingCamera, setOpeningCamera] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [systemCamera, setSystemCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const scannerHeading = useRef<HTMLHeadingElement>(null);
  const webcam = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef<ScanJob | null>(null);
  const generation = useRef(0);
  const demoTimer = useRef(0);
  const videoActive = frame.kind === "live";
  const captured = frame.kind === "capture";
  const filePreview = frame.kind === "photo" || captured;
  const personalConfig = preferTrial ? null : config;
  const activeModel = preferTrial ? trial.model : personalConfig?.model;
  const modelLabel = personalConfig
    ? providers[resolveProvider(personalConfig.provider, personalConfig.model) ?? personalConfig.provider].label
    : "体验账户";

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    try {
      const saved = readBrowserSettings();
      setConfig(saved.config);
      setPreferences(saved.preferences);
      setPreferTrial(saved.preferTrial);
    } catch {
      setStorageWarning("浏览器暂时无法读取本地设置。");
    }
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    void requestTrial({ signal: controller.signal })
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

  function updateConfig(next: Credentials | null) {
    setConfig(next);
    try {
      writeModelSettings(next);
    } catch {
      setStorageWarning(next ? "当前配置可使用，但浏览器未能保存它。" : "浏览器未能移除已保存的配置，请检查此网站的存储设置。");
    }
  }

  function updatePreferences(next: ScanPreferences) {
    setPreferences(next);
    try {
      writeScanPreferences(next);
    } catch {
      setStorageWarning("浏览器未能保存补充线索和识别类型。");
    }
  }

  function updateTrialPreference(next: boolean) {
    setPreferTrial(next);
    try {
      writeTrialPreference(next);
    } catch {
      setStorageWarning("浏览器未能保存体验账户选项。");
    }
  }

  const stopStream = useCallback(() => {
    const media = stream.current;
    stream.current = null;
    media?.getTracks().forEach((track) => track.stop());
  }, []);

  const dismissResultSheet = useCallback(() => setResultSheetOpen(false), []);

  function presentResult(next: ScanRecord) {
    setRecord(next);
    setResultSheetOpen(window.matchMedia(MOBILE_REPORT_VIEWPORT).matches);
  }

  const finishScan = useCallback((job: ScanJob, outcome: ScanOutcome) => {
    if (request.current !== job) return false;
    request.current = null;
    setBusy(false);
    void job.saved.then(async (saved) => {
      if (!saved) return;
      await saveHistoryOutcome(job.id, outcome);
      setHistoryRevision((revision) => revision + 1);
    }).catch(() => setStorageWarning("关键帧已保存，但浏览器未能保存本次识别结果。"));
    return true;
  }, []);

  const stopScan = useCallback(() => {
    const job = request.current;
    if (job) {
      finishScan(job, { status: "cancelled", message: "本次识别已取消。" });
      job.controller.abort();
    }
    window.clearTimeout(demoTimer.current);
    setDemo(false);
    dismissResultSheet();
  }, [finishScan, dismissResultSheet]);

  useEffect(() => {
    function leavePage() {
      ++generation.current;
      stopStream();
      stopScan();
      setOpeningCamera(false);
      setReadingFile(false);
      setCameraReady(false);
      setFrame(SAMPLE);
      setRecord(sampleRecord);
    }

    window.addEventListener("pagehide", leavePage);
    return () => {
      window.removeEventListener("pagehide", leavePage);
      ++generation.current;
      stopStream();
      const job = request.current;
      request.current = null;
      job?.controller.abort();
      window.clearTimeout(demoTimer.current);
    };
  }, [stopStream, stopScan]);

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
      setRecord(sampleRecord);
      setSystemCamera(true);
      setError("摄像头已断开，请重新开启，或上传图片。");
    }

    video.srcObject = current;
    track?.addEventListener("ended", interrupted);
    void video.play().catch(interrupted);

    return () => {
      video.srcObject = null;
      track?.removeEventListener("ended", interrupted);
    };
  }, [videoActive, stopStream, stopScan]);

  async function openCamera() {
    if (!settingsReady || openingCamera || readingFile || request.current) return;
    setError("");
    setSystemCamera(false);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setSystemCamera(true);
      setError(cameraError(null));
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
      setError(cameraError(cause));
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
    setRecord(sampleRecord);
  }

  async function scanImage(image: string, scanMode: ScanMode, source: ScanSource) {
    if (!activeModel || request.current) return;
    const input = scanInputSchema.safeParse({ image, mode: scanMode, note, model: activeModel });
    if (!input.success) {
      setError("无法发送这张图片。请换一张清晰、较小的照片。");
      return;
    }

    if (source === "camera") {
      stopStream();
      setCameraReady(false);
      setFrame({ kind: "capture", data: image });
    }

    const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16).padStart(8, "0")).join("");
    const controller = new AbortController();
    const saved = saveHistoryFrame({ id, createdAt: Date.now(), source, model: activeModel }, image)
      .then(() => {
        setHistoryRevision((revision) => revision + 1);
        return true;
      }, () => {
        setStorageWarning("浏览器未能保存本次扫描的关键帧。请检查此网站的存储空间或权限。");
        return false;
      });
    const job = { id, controller, saved };
    request.current = job;
    setError("");
    setBusy(true);
    setRecord(null);
    dismissResultSheet();
    const timeout = window.setTimeout(() => {
      const message = "模型识别超时。可以换个角度重新扫描，或切换模型。";
      if (finishScan(job, { status: "failed", message })) {
        controller.abort();
        setError(message);
      }
    }, 60_000);

    try {
      await saved;
      if (request.current !== job) return;
      let result;
      if (personalConfig?.provider === "custom") {
        try {
          result = await callVision({
            endpoint: completionEndpoint(personalConfig.baseUrl), apiKey: personalConfig.apiKey,
            input: input.data, signal: controller.signal, reasoningEffort: "low",
          });
        } catch (cause) {
          if (cause instanceof Error && cause.message.startsWith("连接模型服务失败")) {
            throw new Error("连接自定义接口失败。请检查网络和接口的跨域设置。");
          }
          throw cause;
        }
      } else {
        const query = new URLSearchParams({ provider: personalConfig?.provider ?? "trial" });
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
            ? data.error : "暂时无法调用模型，请稍后重试。";
          throw new Error(message);
        }
        result = scanReplySchema.parse(data);
      }
      if (finishScan(job, { status: "completed", reply: result })) {
        presentResult({ ...result, model: activeModel });
      }
    } catch (cause) {
      const errorMessage = cause instanceof Error && cause.name !== "ZodError" ? cause.message : "无法读取扫描结果。";
      const message = errorMessage === "Failed to fetch" ? "网络连接中断，请重试。" : errorMessage;
      if (finishScan(job, { status: "failed", message })) {
        setError(message);
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function autoCapture(video: HTMLVideoElement, target?: TargetBox) {
    if (!activeModel || settingsOpen || historyOpen || request.current) return;
    try {
      void scanImage(captureFrame(video, target), "vehicle", "camera");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法捕获画面，请稍后再试。");
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
    if (!file || request.current) return;
    const current = ++generation.current;
    setOpeningCamera(false);
    setReadingFile(true);
    setError("");
    try {
      const data = await loadPhoto(file);
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
        setError(cause instanceof Error ? cause.message : "图片读取失败，请重试。");
      }
    } finally {
      if (generation.current === current) setReadingFile(false);
    }
  }

  function runDemo() {
    setError("");
    setDemo(true);
    setRecord(null);
    demoTimer.current = window.setTimeout(() => {
      setDemo(false);
      presentResult(sampleRecord);
    }, HOLD_MS);
  }

  let targetStatus = "把车请进圆心";
  if (videoActive) {
    if (!activeModel) targetStatus = preferTrial ? "请在模型设置重新开启体验" : "配置模型后可自动扫描";
    else if (aim.phase === "loading") targetStatus = "正在加载车辆检测";
    else if (aim.phase === "unavailable") targetStatus = "自动锁定不可用";
    else if (aim.phase === "locking") targetStatus = "稳住，快锁住了";
    else if (aim.phase === "captured") targetStatus = "移开后重新对准";
  }

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <div className="brand">
            <img className="brand-icon" src="/app-icon-64.png" width={40} height={40} alt="" />
            <span>AI爽窥</span>
          </div>
          <div className="topbar-actions">
            {activeModel && <span className="model-status" title={modelLabel}>{modelLabel}</span>}
            <button className="button settings-button" aria-label="历史记录" title="历史记录"
              disabled={!settingsReady} onClick={() => setHistoryOpen(true)}>
              <History size={18} aria-hidden /><span className="toolbar-label">历史记录</span>
            </button>
            <button className="button settings-button" aria-label="模型设置" title="模型设置" disabled={!settingsReady}
              onClick={() => setSettingsOpen(true)}>
              <Settings2 size={18} aria-hidden /><span className="toolbar-label">模型设置</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="shell">
        <div className="intro">
          <h1>AI爽窥</h1>
          <p>偷窥你想知道的一切</p>
        </div>

        <div className="workspace">
          <section className="panel scanner" aria-labelledby="camera-title">
            <div className="panel-heading">
              <h2 id="camera-title" ref={scannerHeading} tabIndex={-1}><Crosshair aria-hidden />取景器</h2>
              <span className={videoActive ? "pill connected" : "pill frame-label"}>
                {videoActive && <span className="indicator" />}
                {videoActive ? "实时画面" : captured ? "摄像头已关闭" : filePreview ? "已载入图片" : "示例画面"}
              </span>
            </div>

            <div className={"viewfinder " + (filePreview ? "uploaded" : "")}>
              {videoActive ? (
                <video ref={webcam} autoPlay muted playsInline aria-label="手机摄像头实时画面"
                  onPlaying={() => setCameraReady(true)} />
              ) : (
                <img src={filePreview ? frame.data : "/coast-gt.webp"}
                  alt={captured ? "当前扫描关键帧" : filePreview ? "待识别图片" : "海岸暮色中一辆珊瑚红双门跑车"} />
              )}
              <div className="finder-overlay" aria-hidden>
                {(!filePreview || (captured && busy)) && (
                  <div className="aim">
                    <span className={"reticle " + (demo ? "demo" : videoActive && aim.phase === "locking" ? "locking" : "")}
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
                {videoActive ? (cameraReady ? "后置优先" : "相机启动中")
                  : captured ? "已锁定关键帧" : filePreview ? "图片预览" : "海岸 GT · 今日陪练"}
                {demo && <span>假装很专业地锁定…</span>}
              </div>
            </div>
            {videoActive && <span className="sr-only" role="status">{targetStatus}</span>}

            {frame.kind === "photo" && (
              <div className="mode-tabs" aria-label="图片识别类型">
                {Object.entries(modes).map(([id, label]) => (
                  <button key={id} disabled={busy} aria-pressed={mode === id}
                    onClick={() => updatePreferences({ ...preferences, mode: id as ScanMode })}>{label}</button>
                ))}
              </div>
            )}

            <div className="scanner-actions">
              {videoActive ? (
                <>
                  <button className="button primary" onClick={closeCamera}><CameraOff size={19} aria-hidden />关闭摄像头</button>
                  {!activeModel && <button className="button secondary" onClick={() => setSettingsOpen(true)}>
                    <Settings2 size={18} aria-hidden />配置 AI
                  </button>}
                  {activeModel && aim.phase === "unavailable" && (
                    <button className="button secondary" disabled={!cameraReady || busy}
                      onClick={() => { if (webcam.current) autoCapture(webcam.current); }}>
                      <Focus size={18} aria-hidden />扫描画面
                    </button>
                  )}
                </>
              ) : (
                <button className="button primary" disabled={!settingsReady || openingCamera || readingFile || busy || demo}
                  onClick={() => void openCamera()}>
                  {openingCamera || busy
                    ? <LoaderCircle className="spin" size={19} aria-hidden />
                    : <Camera size={19} aria-hidden />}
                  {busy ? "正在识别…" : openingCamera ? "开启中…" : "开始扫描"}
                </button>
              )}
              <button className="button secondary" disabled={!settingsReady || readingFile || busy || demo}
                onClick={() => fileInput.current?.click()}>
                {readingFile ? <LoaderCircle className="spin" size={19} aria-hidden /> : <ImagePlus size={19} aria-hidden />}
                {readingFile ? "读取中…" : "上传图片"}
              </button>
              {frame.kind === "sample" && !systemCamera &&
                <button className="button text-button" disabled={!settingsReady || openingCamera || demo || readingFile}
                  onClick={runDemo}><ScanLine size={18} aria-hidden />演示扫描</button>}
              {systemCamera && !videoActive && <button className="button text-button" disabled={readingFile || busy}
                onClick={() => cameraInput.current?.click()}>系统相机</button>}
              {frame.kind === "photo" && !busy && <button className="button text-button"
                onClick={() => activeModel ? void scanImage(frame.data, mode, "photo") : setSettingsOpen(true)}>
                <ScanLine size={18} aria-hidden />{activeModel ? (record ? "重新识别" : "识别图片") : "配置 AI 识别"}
              </button>}
              {busy && <button className="button text-button" onClick={() => {
                stopScan();
                setError("本次识别已取消。");
              }}>
                <X size={17} aria-hidden />取消识别
              </button>}
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => void selectPhoto(event)} />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void selectPhoto(event)} />

            {error && <p className="error-message scan-error" role="alert">{error}</p>}
            {storageWarning && <p className="error-message scan-error" role="status">{storageWarning}</p>}
            <div className="scanner-bottom">
              <p>{videoActive
                ? "把车请进圆心，稳住约 1.5 秒。拍下关键帧后，摄像头自动关闭。"
                : captured && busy ? "摄像头下班了，AI 还在翻档案。"
                : captured ? "下一个？点「开始扫描」。"
                : "点「开始扫描」，把车请进圆心，稳住约 1.5 秒。"}</p>
              <details className="note-field">
                <summary>补充线索 <ChevronDown size={15} aria-hidden /></summary>
                <label htmlFor="scan-note">可补充车型、城市或截图背景。</label>
                <textarea id="scan-note" value={note} maxLength={280} rows={2} disabled={!settingsReady}
                  onChange={(event) => updatePreferences({ ...preferences, note: event.target.value })} />
              </details>
            </div>
          </section>

          <ScanReport record={record} busy={busy || demo}
            awaiting={videoActive ? "对准一辆车，等待圆圈转满。"
              : captured ? "点「开始扫描」，看看下一位。"
              : "上传图片并配置 AI 模型即可识别。"} />
        </div>

        <footer className="footer">
          <span>每次扫描只发一张图 · 历史留在当前浏览器</span>
        </footer>
      </main>

      {settingsOpen && <ModelSettings config={config} trial={trial} preferTrial={preferTrial} onClose={() => setSettingsOpen(false)}
        onTrialChange={(status) => {
          stopScan();
          setTrial(status);
          updateTrialPreference(!!status.model);
          setSettingsOpen(false);
          setError("");
        }}
        onSave={(next) => { updateConfig(next); updateTrialPreference(false); setSettingsOpen(false); setError(""); }}
        onClear={() => { stopScan(); updateConfig(null); setSettingsOpen(false); setError(""); }} />}
      {historyOpen && <ScanHistory revision={historyRevision} activeId={request.current?.id}
        onClose={() => setHistoryOpen(false)} />}
      {resultSheetOpen && record && !settingsOpen && !historyOpen && (
        <ScanResultSheet record={record} onDismiss={dismissResultSheet} onStartScan={startFromResult} />
      )}
    </>
  );
}
