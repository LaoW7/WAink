import { readBody, ScanError } from "@/lib/scan";
import { clearTrialCookie, createTrialCookie, hasTrialSession, readTrialConfig, trialPasswordMatches, trialRequestIsSecure } from "@/lib/trial";

function reply(value: unknown, status = 200, setCookie?: string) {
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  if (status === 429) headers.set("Retry-After", "60");
  return Response.json(value, { status, headers });
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site" &&
    (!origin || origin === new URL(request.url).origin) && trialRequestIsSecure(request);
}

export async function GET(request: Request) {
  const config = readTrialConfig();
  if (!config || !trialRequestIsSecure(request)) return reply({ available: false, model: null, hourlyLimit: null });
  const model = await hasTrialSession(request, config) ? config.model : null;
  return reply({ available: true, model, hourlyLimit: config.hourlyLimit });
}

export async function POST(request: Request) {
  if (!allowedOrigin(request)) return reply({ error: "请从本站的模型设置开启体验。" }, 403);
  const config = readTrialConfig();
  if (!config) return reply({ error: "体验账户暂未开启。" }, 503);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return reply({ error: "体验请求需要 JSON 格式。" }, 415);
  }
  try {
    const attempt = await config.loginLimit.limit({ key: request.headers.get("cf-connecting-ip") ?? "local" });
    if (!attempt.success) return reply({ error: "尝试次数过多，请稍后再试。" }, 429);
    const text = await readBody(request.body, 2048, new ScanError("体验密码过长。", 413));
    const input = JSON.parse(text) as { password?: unknown } | null;
    if (typeof input?.password !== "string" || !input.password.length || input.password.length > 256) {
      return reply({ error: "请输入体验密码。" }, 400);
    }
    if (!await trialPasswordMatches(input.password, config)) return reply({ error: "体验密码不正确。" }, 401);
    return reply({ available: true, model: config.model, hourlyLimit: config.hourlyLimit }, 200, await createTrialCookie(request, config));
  } catch (error) {
    if (error instanceof ScanError) return reply({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return reply({ error: "无法读取体验请求。" }, 400);
    return reply({ error: "暂时无法开启体验，请稍后再试。" }, 503);
  }
}

export function DELETE(request: Request) {
  if (!allowedOrigin(request)) return reply({ error: "请从本站的模型设置退出体验。" }, 403);
  const config = readTrialConfig();
  return reply({ available: !!config, model: null, hourlyLimit: config?.hourlyLimit ?? null }, 200, clearTrialCookie(request));
}
