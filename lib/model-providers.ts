type PresetDefinition = {
  label: string;
  model: string;
  endpoint: string;
  internationalEndpoint?: string;
  matches: RegExp;
  speed?: "low" | "direct";
};

export const presets = {
  deepseek: {
    label: "DeepSeek",
    model: "deepseek-flash",
    endpoint: "https://api.deepseek.com/chat/completions",
    matches: /^deepseek(?:-|$)/i,
    speed: "direct",
  },
  qwen: {
    label: "通义千问（阿里云百炼）",
    model: "qwen3.8-flash",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    internationalEndpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    matches: /^(?:qwen[\d.-]|qvq(?:-|$))/i,
  },
  hunyuan: {
    label: "腾讯混元",
    model: "hunyuan-vision-1.5-instruct",
    endpoint: "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
    matches: /^hunyuan(?:-|$)/i,
  },
  doubao: {
    label: "豆包（火山方舟）",
    model: "doubao-seed-2-1-lite-260915",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    matches: /^(?:doubao|ep)-/i,
    speed: "direct",
  },
  kimi: {
    label: "Kimi（月之暗面）",
    model: "kimi-k3.1-pro",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    internationalEndpoint: "https://api.moonshot.ai/v1/chat/completions",
    matches: /^(?:kimi-|moonshot-)/i,
    speed: "low",
  },
  glm: {
    label: "智谱 GLM",
    model: "glm-4.6v-flash",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    internationalEndpoint: "https://api.z.ai/api/paas/v4/chat/completions",
    matches: /^glm-/i,
  },
  openai: {
    label: "OpenAI",
    model: "gpt-6.2-sol",
    endpoint: "https://api.openai.com/v1/chat/completions",
    matches: /^(?:gpt-|chatgpt-|o[134](?:-|$))/i,
  },
  gemini: {
    label: "Google Gemini",
    model: "gemini-4-hydrogen",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    matches: /^gemini-/i,
  },
} as const satisfies Record<string, PresetDefinition>;

export const providers = {
  auto: { label: "按模型自动匹配", model: presets.deepseek.model },
  ...presets,
  custom: { label: "自定义 OpenAI 兼容接口", model: "gemini-3.8-flash" },
} as const;

export const regions = ["cn", "international"] as const;
export type ModelRegion = typeof regions[number];
export type PresetProvider = keyof typeof presets;
export type Provider = keyof typeof providers;
export type Credentials = {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl: string;
  region?: ModelRegion;
};

const presetIds = Object.keys(presets) as PresetProvider[];

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && Object.hasOwn(providers, value);
}

export function resolveProvider(provider: Provider, model: string): PresetProvider | undefined {
  if (provider === "custom") return;
  if (provider !== "auto") return provider;

  const name = model.trim();
  // An organization prefix identifies a gateway model, not a direct provider model.
  if (name.includes("/")) return;
  return presetIds.find((id) => presets[id].matches.test(name));
}

export function hasInternationalNode(provider: PresetProvider | undefined) {
  return !!provider && "internationalEndpoint" in presets[provider];
}

export function resolveModelNode(provider: Provider, model: string, region: ModelRegion = "cn") {
  const id = resolveProvider(provider, model);
  if (!id) return;

  const preset: PresetDefinition = presets[id];
  const endpoint = region === "international" ? preset.internationalEndpoint ?? preset.endpoint : preset.endpoint;
  return { provider: id, endpoint, speed: preset.speed };
}
