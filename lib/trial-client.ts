import type { Locale } from "./i18n";

export type TrialStatus = {
  available: boolean;
  model: string | null;
  hourlyLimit: number | null;
};

export const inactiveTrial: TrialStatus = { available: false, model: null, hourlyLimit: null };

export async function requestTrial(init?: RequestInit, locale: Locale = "en"): Promise<TrialStatus> {
  const response = await fetch("/api/trial?lang=" + locale, { cache: "no-store", credentials: "same-origin", ...init });
  const payload: unknown = await response.json().catch(() => null);
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  if (!response.ok || typeof data?.available !== "boolean") {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : locale === "zh" ? "暂时无法连接体验账户。" : "Unable to reach the trial account right now.",
    );
  }
  return {
    available: data.available,
    model: typeof data.model === "string" ? data.model : null,
    hourlyLimit: typeof data.hourlyLimit === "number" ? data.hourlyLimit : null,
  };
}
