import { env } from "cloudflare:workers";
import { completionEndpoint, scanInputSchema } from "./scan";
import type { TrialQuota } from "../worker/trial-quota";

type TrialBindings = {
  TRIAL_PASSWORD?: string;
  TRIAL_SESSION_SECRET?: string;
  TRIAL_API_KEY?: string;
  TRIAL_BASE_URL?: string;
  TRIAL_MODEL?: string;
  TRIAL_SCANS_PER_IP_PER_HOUR?: string;
  TRIAL_LOGIN_LIMIT?: RateLimit;
  TRIAL_SCAN_QUOTA?: DurableObjectNamespace<TrialQuota>;
};

const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

export function readTrialConfig() {
  const bindings = env as TrialBindings;
  const password = bindings.TRIAL_PASSWORD;
  const secret = bindings.TRIAL_SESSION_SECRET?.trim();
  const apiKey = bindings.TRIAL_API_KEY?.trim();
  const baseUrl = bindings.TRIAL_BASE_URL?.trim();
  const model = scanInputSchema.shape.model.safeParse(bindings.TRIAL_MODEL);
  const hourlyLimit = Number(bindings.TRIAL_SCANS_PER_IP_PER_HOUR ?? "20");
  const loginLimit = bindings.TRIAL_LOGIN_LIMIT;
  const scanQuota = bindings.TRIAL_SCAN_QUOTA;
  if (!password?.trim() || password.length > 256 || !secret || secret.length < 32 ||
      !apiKey || !/^[\x21-\x7E]{1,2048}$/.test(apiKey) || !baseUrl || !model.success || !loginLimit || !scanQuota ||
      !Number.isSafeInteger(hourlyLimit) || hourlyLimit < 1) {
    return null;
  }
  try {
    return { password, secret, apiKey, endpoint: completionEndpoint(baseUrl), model: model.data, hourlyLimit, loginLimit, scanQuota };
  } catch {
    return null;
  }
}

type TrialConfig = NonNullable<ReturnType<typeof readTrialConfig>>;

export function trialRequestIsSecure(request: Request) {
  const url = new URL(request.url);
  return url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function cookieName(request: Request) {
  return new URL(request.url).protocol === "https:" ? "__Host-ai-shuang-kui-trial" : "ai-shuang-kui-trial";
}

function cookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return cookieName(request) + "=" + value + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; SameSite=Strict" + secure;
}

function signingKey(config: TrialConfig) {
  return crypto.subtle.importKey("raw", encoder.encode(config.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function encodeSignature(signature: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function consumeTrialScan(request: Request, config: TrialConfig) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const identifier = await crypto.subtle.sign("HMAC", await signingKey(config), encoder.encode("trial-quota:" + ip));
  return config.scanQuota.getByName(encodeSignature(identifier)).consume(config.hourlyLimit);
}

export async function trialPasswordMatches(password: string, config: TrialConfig) {
  const key = await signingKey(config);
  const proof = await crypto.subtle.sign("HMAC", key, encoder.encode("password:" + config.password));
  return crypto.subtle.verify("HMAC", key, proof, encoder.encode("password:" + password));
}

function sessionData(payload: string, password: string) {
  // Changing the shared password also invalidates existing session cookies.
  return encoder.encode(JSON.stringify(["ai-shuang-kui-trial", payload, password]));
}

export async function createTrialCookie(request: Request, config: TrialConfig) {
  const payload = Math.floor(Date.now() / 1000 + SESSION_SECONDS) + "." + crypto.randomUUID();
  const signature = await crypto.subtle.sign("HMAC", await signingKey(config), sessionData(payload, config.password));
  return cookie(request, payload + "." + encodeSignature(signature), SESSION_SECONDS);
}

export async function hasTrialSession(request: Request, config: TrialConfig) {
  if (!trialRequestIsSecure(request)) return false;
  const prefix = cookieName(request) + "=";
  const entry = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  const token = entry?.slice(prefix.length);
  const match = token?.match(/^(\d{10,13})\.([a-f\d-]{36})\.([A-Za-z0-9_-]{43})$/);
  if (!match || Number(match[1]) <= Date.now() / 1000) return false;
  const [, expiry, id, signature] = match;
  const bytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/") + "="), (char) => char.charCodeAt(0));
  return crypto.subtle.verify("HMAC", await signingKey(config), bytes, sessionData(expiry + "." + id, config.password));
}

export function clearTrialCookie(request: Request) {
  return cookie(request, "", 0);
}
