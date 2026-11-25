import type { Locale } from "@/lib/i18n";
import { readBody, ScanError } from "@/lib/scan";
import { clearTrialCookie, createTrialCookie, hasTrialSession, isSameOriginRequest, readTrialConfig, trialPasswordMatches, trialRequestIsSecure } from "@/lib/trial";

function msg(lang: Locale, en: string, zh: string) {
  return lang === "zh" ? zh : en;
}

function getLang(request: Request): Locale {
  return new URL(request.url).searchParams.get("lang") === "zh" ? "zh" : "en";
}

function reply(value: unknown, status = 200, setCookie?: string) {
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  if (status === 429) headers.set("Retry-After", "60");
  return Response.json(value, { status, headers });
}

function allowedOrigin(request: Request) {
  return isSameOriginRequest(request) && trialRequestIsSecure(request);
}

export async function GET(request: Request) {
  const config = readTrialConfig();
  if (!config || !trialRequestIsSecure(request)) return reply({ available: false, model: null, hourlyLimit: null });
  const model = await hasTrialSession(request, config) ? config.model : null;
  return reply({ available: true, model, hourlyLimit: config.hourlyLimit });
}

export async function POST(request: Request) {
  const lang = getLang(request);
  if (!allowedOrigin(request)) return reply({ error: msg(lang, "Please enable the trial from Model Settings on this site.", "请从本站的模型设置开启体验。") }, 403);
  const config = readTrialConfig();
  if (!config) return reply({ error: msg(lang, "Trial account is not enabled.", "体验账户暂未开启。") }, 503);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return reply({ error: msg(lang, "Trial requests require JSON format.", "体验请求需要 JSON 格式。") }, 415);
  }
  try {
    const attempt = await config.loginLimit.limit({ key: request.headers.get("cf-connecting-ip") ?? "local" });
    if (!attempt.success) return reply({ error: msg(lang, "Too many attempts. Please try again later.", "尝试次数过多，请稍后再试。") }, 429);
    const text = await readBody(
      request.body,
      2048,
      new ScanError(msg(lang, "Trial password is too long.", "体验密码过长。"), 413),
    );
    const input = JSON.parse(text) as { password?: unknown } | null;
    if (typeof input?.password !== "string" || !input.password.length || input.password.length > 256) {
      return reply({ error: msg(lang, "Please enter the trial password.", "请输入体验密码。") }, 400);
    }
    if (!await trialPasswordMatches(input.password, config)) {
      return reply({ error: msg(lang, "Incorrect trial password.", "体验密码不正确。") }, 401);
    }
    return reply({ available: true, model: config.model, hourlyLimit: config.hourlyLimit }, 200, await createTrialCookie(request, config));
  } catch (error) {
    if (error instanceof ScanError) return reply({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return reply({ error: msg(lang, "Unable to read trial request.", "无法读取体验请求。") }, 400);
    return reply({ error: msg(lang, "Unable to start trial right now. Try again later.", "暂时无法开启体验，请稍后再试。") }, 503);
  }
}

export function DELETE(request: Request) {
  const lang = getLang(request);
  if (!allowedOrigin(request)) return reply({ error: msg(lang, "Please exit the trial from Model Settings on this site.", "请从本站的模型设置退出体验。") }, 403);
  const config = readTrialConfig();
  return reply({ available: !!config, model: null, hourlyLimit: config?.hourlyLimit ?? null }, 200, clearTrialCookie(request));
}
