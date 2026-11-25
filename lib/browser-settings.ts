import { z } from "zod";
import { isProvider, regions, resolveProvider, type Credentials, type Provider } from "./model-providers";
import { completionEndpoint, scanInputSchema, type ScanMode } from "./scan";

export type ScanPreferences = { mode: ScanMode; note: string };

export const defaultScanPreferences: ScanPreferences = { mode: "auto", note: "" };

const MODEL_KEY = "ai-shuang-kui:model";
const PREFERENCES_KEY = "ai-shuang-kui:scan-preferences";
const TRIAL_PREFERENCE_KEY = "ai-shuang-kui:use-trial";
const modelSchema = z.object({
  provider: z.custom<Provider>(isProvider),
  model: scanInputSchema.shape.model,
  apiKey: z.string().regex(/^[\x21-\x7E]{1,2048}$/),
  baseUrl: z.string().max(500),
  region: z.enum(regions).optional(),
});
const preferencesSchema = z.object({
  mode: scanInputSchema.shape.mode,
  note: z.string().max(280),
});

function parseStoredModel(raw: string): Credentials | null {
  const parsed = modelSchema.parse(JSON.parse(raw));
  if (parsed.provider === "custom") completionEndpoint(parsed.baseUrl);
  if (parsed.provider === "custom" || resolveProvider(parsed.provider, parsed.model)) return parsed;
  return null;
}

export function readBrowserSettings() {
  let config: Credentials | null = null;
  let persistKey = false;
  let preferences = defaultScanPreferences;
  try {
    const sessionModel = sessionStorage.getItem(MODEL_KEY);
    const localModel = localStorage.getItem(MODEL_KEY);
    if (sessionModel) {
      config = parseStoredModel(sessionModel);
      persistKey = false;
    } else if (localModel) {
      config = parseStoredModel(localModel);
      persistKey = !!config;
    }
  } catch {
    // Ignore invalid or obsolete entries while allowing the model to be configured again.
  }
  try {
    const savedPreferences = localStorage.getItem(PREFERENCES_KEY);
    if (savedPreferences) preferences = preferencesSchema.parse(JSON.parse(savedPreferences));
  } catch {
    // A broken scan preference should not prevent the model configuration from loading.
  }
  let preferTrial = false;
  try {
    preferTrial = localStorage.getItem(TRIAL_PREFERENCE_KEY) === "1";
  } catch {
    // Ignore storage access failure.
  }
  return { config, persistKey, preferences, preferTrial };
}

export function writeModelSettings(config: Credentials | null, persistKey = false) {
  try {
    sessionStorage.removeItem(MODEL_KEY);
  } catch {
    // Ignore when sessionStorage is unavailable.
  }
  try {
    localStorage.removeItem(MODEL_KEY);
  } catch (error) {
    if (!config) throw error;
  }
  if (!config) return;
  const payload = JSON.stringify(config);
  if (persistKey) localStorage.setItem(MODEL_KEY, payload);
  else sessionStorage.setItem(MODEL_KEY, payload);
}

export function writeScanPreferences(preferences: ScanPreferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function writeTrialPreference(preferTrial: boolean) {
  if (preferTrial) localStorage.setItem(TRIAL_PREFERENCE_KEY, "1");
  else localStorage.removeItem(TRIAL_PREFERENCE_KEY);
}
