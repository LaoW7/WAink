export type TrialStatus = {
  available: boolean;
  model: string | null;
  hourlyLimit: number | null;
};

export const inactiveTrial: TrialStatus = { available: false, model: null, hourlyLimit: null };

export async function requestTrial(init?: RequestInit): Promise<TrialStatus> {
  const response = await fetch("/api/trial", { cache: "no-store", credentials: "same-origin", ...init });
  const payload: unknown = await response.json().catch(() => null);
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  if (!response.ok || typeof data?.available !== "boolean") {
    throw new Error(typeof data?.error === "string" ? data.error : "暂时无法连接体验账户。");
  }
  return {
    available: data.available,
    model: typeof data.model === "string" ? data.model : null,
    hourlyLimit: typeof data.hourlyLimit === "number" ? data.hourlyLimit : null,
  };
}
