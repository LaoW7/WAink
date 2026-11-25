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

export function readBrowserSettings() {
  const savedModel = localStorage.getItem(MODEL_KEY);
  const savedPreferences = localStorage.getItem(PREFERENCES_KEY);
  let config: Credentials | null = null;
  let preferences = defaultScanPreferences;
  try {
    if (savedModel) {
      const parsed = modelSchema.parse(JSON.parse(savedModel));
      if (parsed.provider === "custom") completionEndpoint(parsed.baseUrl);
      if (parsed.provider === "custom" || resolveProvider(parsed.provider, parsed.model)) config = parsed;
    }
  } catch {
    // Ignore invalid or obsolete entries while allowing the model to be configured again.
  }
  try {
    if (savedPreferences) preferences = preferencesSchema.parse(JSON.parse(savedPreferences));
  } catch {
    // A broken scan preference should not prevent the model configuration from loading.
  }
  return { config, preferences, preferTrial: localStorage.getItem(TRIAL_PREFERENCE_KEY) === "1" };
}

export function writeModelSettings(config: Credentials | null) {
  if (config) localStorage.setItem(MODEL_KEY, JSON.stringify(config));
  else localStorage.removeItem(MODEL_KEY);
}

export function writeScanPreferences(preferences: ScanPreferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function writeTrialPreference(preferTrial: boolean) {
  if (preferTrial) localStorage.setItem(TRIAL_PREFERENCE_KEY, "1");
  else localStorage.removeItem(TRIAL_PREFERENCE_KEY);
}
