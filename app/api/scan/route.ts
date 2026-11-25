import { isProvider, resolveModelNode } from "@/lib/model-providers";
import { callVision, readScanRequest, ScanError, supportedLookup } from "@/lib/scan";
import { consumeTrialScan, hasTrialSession, readTrialConfig } from "@/lib/trial";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

  try {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" ||
        (origin && origin !== new URL(request.url).origin)) {
      return json({ error: "请从扫描页面发起请求。" }, 403);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
      return json({ error: "扫描请求需要 JSON 格式。" }, 415);
    }

    const query = new URL(request.url).searchParams;
    const provider = query.get("provider");
    if (provider === "trial") {
      const trial = readTrialConfig();
      if (!trial) return json({ error: "体验账户暂未开启。" }, 503);
      if (!await hasTrialSession(request, trial)) {
        return json({ error: "体验已过期，请在模型设置重新输入体验密码。" }, 401);
      }
      const input = await readScanRequest(request);
      const quota = await consumeTrialScan(request, trial);
      if (!quota.allowed) {
        const minutes = Math.ceil(quota.retryAfter / 60);
        return Response.json({ error: `此 IP 最近一小时的 ${trial.hourlyLimit} 次体验扫描已用完，请约 ${minutes} 分钟后再试。` }, {
          status: 429, headers: { ...headers, "Retry-After": String(quota.retryAfter) },
        });
      }
      try {
        return json(await callVision({
          endpoint: trial.endpoint,
          apiKey: trial.apiKey,
          input: { ...input, model: trial.model },
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
          reasoningEffort: "low",
        }));
      } catch (error) {
        if (error instanceof ScanError && error.status === 401) {
          return json({ error: "体验模型的服务密钥不可用，请联系部署者。" }, 502);
        }
        throw error;
      }
    }
    if (!isProvider(provider) || provider === "custom") {
      return json({ error: "请选择支持的模型服务。" }, 400);
    }
    const region = query.get("region") ?? "cn";
    if (region !== "cn" && region !== "international") {
      return json({ error: "请选择有效的官方接入地区。" }, 400);
    }

    const apiKey = request.headers.get("authorization")?.match(/^Bearer ([\x21-\x7E]{1,2048})$/)?.[1];
    if (!apiKey) return json({ error: "请在模型设置中填写 API Key。" }, 400);

    const input = await readScanRequest(request);
    const node = resolveModelNode(provider, input.model, region);
    if (!node) return json({ error: "无法从模型名称匹配节点。请选择模型服务或自定义接口。" }, 400);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]);
    return json(await callVision({
      endpoint: node.endpoint,
      apiKey,
      input,
      signal,
      lookup: supportedLookup(node.provider, input.model),
      reasoningEffort: node.speed === "low" ? "low" : undefined,
      disableThinking: node.speed === "direct",
    }));
  } catch (error) {
    if (error instanceof ScanError) return json({ error: error.message }, error.status);
    return json({ error: "模型调用中断或超时，请稍后重试。" }, 502);
  }
}
