import { useEffect, useRef, useState, type RefObject } from "react";
import type { Detection, ObjectDetector } from "@mediapipe/tasks-vision";
import { VehicleLock, type AimState, type TargetBox } from "./vehicle-lock";

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const DETECTION_INTERVAL_MS = 190;
const INITIAL_AIM: AimState = { phase: "loading", progress: 0 };

async function loadVehicleDetector() {
  const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
  const wasm = await FilesetResolver.forVisionTasks("/vision");
  return ObjectDetector.createFromOptions(wasm, {
    baseOptions: { modelAssetPath: "/vehicle-detector.tflite", delegate: "CPU" },
    runningMode: "VIDEO",
    scoreThreshold: 0.49,
    categoryAllowlist: ["car", "truck", "bus", "motorcycle"],
    maxResults: 8,
  });
}

export function cameraError(error: unknown) {
  if (!window.isSecureContext) return "实时取景需要 HTTPS。你仍可拍照或上传图片。";
  if (error instanceof DOMException && /NotAllowed|Security/.test(error.name)) {
    return "浏览器没有授予摄像头权限。请在地址栏允许访问，或上传图片。";
  }
  if (error instanceof DOMException && error.name === "NotReadableError") {
    return "摄像头正被占用。关闭正在使用相机的应用，再试一次。";
  }
  return "无法开启实时取景。你可以用系统相机拍照，或上传图片。";
}

function makeJpeg(source: CanvasImageSource, width: number, height: number, target?: TargetBox) {
  if (!width || !height) throw new Error("画面还没准备好，请稍后再试。");
  const pad = 0.22;
  const left = target ? Math.max(0, target.x - target.width * pad) : 0;
  const top = target ? Math.max(0, target.y - target.height * pad) : 0;
  const right = target ? Math.min(1, target.x + target.width * (1 + pad)) : 1;
  const bottom = target ? Math.min(1, target.y + target.height * (1 + pad)) : 1;
  const sourceWidth = (right - left) * width;
  const sourceHeight = (bottom - top) * height;
  const scale = Math.min(1, 1440 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("浏览器无法处理这张图片。");
  context.fillStyle = "#16161c";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    source, left * width, top * height, sourceWidth, sourceHeight,
    0, 0, canvas.width, canvas.height,
  );
  const data = canvas.toDataURL("image/jpeg", 0.86);
  return data.length <= 2_800_024 ? data : canvas.toDataURL("image/jpeg", 0.64);
}

export function captureFrame(video: HTMLVideoElement, target?: TargetBox) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error("画面还没准备好，请稍后再试。");
  }
  return makeJpeg(video, video.videoWidth, video.videoHeight, target);
}

export async function loadPhoto(file: File) {
  if (file.size > MAX_IMAGE_SIZE) throw new Error("请选择 20 MB 以内的图片。");
  if ((file.type && !file.type.startsWith("image/")) || file.type === "image/svg+xml") {
    throw new Error("请选择相机照片或 JPG、PNG、WebP 等图片。");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("浏览器无法读取这张图片。请试试 JPG、PNG 或 WebP。");
    }
    return makeJpeg(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function centeredVehicle(detections: Detection[], width: number, height: number) {
  let closest: { box: TargetBox; distance: number } | null = null;
  for (const { boundingBox } of detections) {
    if (!boundingBox) continue;
    const box = {
      x: boundingBox.originX / width,
      y: boundingBox.originY / height,
      width: boundingBox.width / width,
      height: boundingBox.height / height,
    };
    if (box.width * box.height < 0.018) continue;
    if (box.x > 0.5 || box.y > 0.5 || box.x + box.width < 0.5 || box.y + box.height < 0.5) continue;
    const distance = Math.hypot(box.x + box.width / 2 - 0.5, box.y + box.height / 2 - 0.5);
    if (!closest || distance < closest.distance) closest = { box, distance };
  }
  return closest?.box ?? null;
}

export function useVehicleDetector({
  video, active, armed, onCapture,
}: {
  video: RefObject<HTMLVideoElement | null>;
  active: boolean;
  armed: boolean;
  onCapture: (element: HTMLVideoElement, target: TargetBox) => void;
}) {
  const [aim, setAim] = useState<AimState>(INITIAL_AIM);
  const control = useRef({ armed, onCapture });
  const loadedDetector = useRef<Promise<ObjectDetector> | null>(null);

  useEffect(() => {
    control.current = { armed, onCapture };
  }, [armed, onCapture]);

  useEffect(() => () => {
    const loaded = loadedDetector.current;
    loadedDetector.current = null;
    void loaded?.then((instance) => instance.close()).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let detector: ObjectDetector | undefined;
    let timer: number | undefined;
    let lastFrameTime = -1;
    let lastAim = INITIAL_AIM;
    const lock = new VehicleLock();
    const sample = document.createElement("canvas");
    const context = sample.getContext("2d", { alpha: false });
    setAim(INITIAL_AIM);

    function display(next: AimState) {
      if (lastAim.phase !== next.phase || lastAim.progress !== next.progress) {
        lastAim = next;
        setAim(next);
      }
    }

    function detect() {
      const element = video.current;
      if (disposed || !context || !detector) return;
      if (!document.hidden && element && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          element.currentTime !== lastFrameTime && element.videoWidth && element.videoHeight) {
        try {
          lastFrameTime = element.currentTime;
          const scale = Math.min(1, 512 / Math.max(element.videoWidth, element.videoHeight));
          const width = Math.max(1, Math.round(element.videoWidth * scale));
          const height = Math.max(1, Math.round(element.videoHeight * scale));
          if (sample.width !== width) sample.width = width;
          if (sample.height !== height) sample.height = height;
          context.drawImage(element, 0, 0, width, height);
          const time = performance.now();
          const { detections } = detector.detectForVideo(sample, time);
          const target = centeredVehicle(detections, width, height);
          const next = lock.update(target, time, control.current.armed);
          if (next.phase === "captured" && lastAim.phase !== "captured" && target) {
            control.current.onCapture(element, target);
          }
          display(next);
        } catch {
          display({ phase: "unavailable", progress: 0 });
          return;
        }
      }

      timer = window.setTimeout(detect, DETECTION_INTERVAL_MS);
    }

    async function start() {
      if (!context) {
        display({ phase: "unavailable", progress: 0 });
        return;
      }
      const loaded = loadedDetector.current ??= loadVehicleDetector();
      try {
        detector = await loaded;
        if (disposed) return;
        display({ phase: "waiting", progress: 0 });
        detect();
      } catch {
        if (loadedDetector.current === loaded) loadedDetector.current = null;
        if (!disposed) display({ phase: "unavailable", progress: 0 });
      }
    }

    void start();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [active, video]);

  return aim;
}
