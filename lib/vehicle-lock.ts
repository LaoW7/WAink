export type TargetBox = { x: number; y: number; width: number; height: number };

export const HOLD_MS = 1500;
const RELEASE_MS = 550;
const MAX_GAP_MS = 600;

export type AimState =
  | { phase: "loading" | "waiting" | "captured" | "unavailable"; progress: 0 | 1 }
  | { phase: "locking"; progress: number };

function overlap(a: TargetBox, b: TargetBox) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}

export class VehicleLock {
  private candidate: { box: TargetBox; since: number; lastSeen: number } | null = null;
  private latched: TargetBox | null = null;
  private leftAt: number | null = null;

  update(target: TargetBox | null, time: number, armed: boolean): AimState {
    if (this.latched) {
      const stillAimed = target && overlap(this.latched, target) >= 0.30;
      if (stillAimed) {
        this.leftAt = null;
        return { phase: "captured", progress: 1 };
      }
      this.leftAt ??= time;
      if (time - this.leftAt < RELEASE_MS) return { phase: "captured", progress: 1 };
      this.latched = null;
      this.leftAt = null;
    }

    if (!target || !armed) {
      this.candidate = null;
      return { phase: "waiting", progress: 0 };
    }

    if (!this.candidate || time - this.candidate.lastSeen > MAX_GAP_MS ||
        overlap(this.candidate.box, target) < 0.40) {
      this.candidate = { box: target, since: time, lastSeen: time };
      return { phase: "locking", progress: 0 };
    }

    this.candidate.lastSeen = time;
    const progress = (time - this.candidate.since) / HOLD_MS;
    if (progress < 1) return { phase: "locking", progress };

    this.latched = target;
    this.candidate = null;
    return { phase: "captured", progress: 1 };
  }
}
