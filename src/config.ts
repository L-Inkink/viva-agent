import { getEnvApiKey, getModels, type Api, type KnownProvider, type Model } from "@earendil-works/pi-ai";

/**
 * 模型解析顺序：
 * 1. VIVA_BASE_URL（+ VIVA_MODEL 为模型 id）→ 任意 OpenAI 兼容端点（vLLM/Ollama/中转）
 * 2. VIVA_MODEL = "provider/model-id" → pi-ai 内置注册表
 * 3. 自动探测：按候选顺序找第一个配了 API key 的厂商
 * API key 一律走各厂商标准环境变量（DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / ...），
 * 自定义端点用 VIVA_API_KEY。
 */

const AUTO_PROVIDERS: KnownProvider[] = ["deepseek", "zai", "moonshotai", "anthropic", "openai", "google", "groq", "openrouter"];

/** 自动探测时每个厂商的偏好模型（按 id 子串匹配，匹配不到就用注册表第一个） */
const PREFERRED: Partial<Record<KnownProvider, string[]>> = {
  deepseek: ["deepseek-chat"],
  zai: ["glm-4.6", "glm"],
  moonshotai: ["kimi-k2"],
  anthropic: ["sonnet"],
  openai: ["gpt-5-mini", "gpt-4o-mini"],
  google: ["flash"],
};

export interface ResolvedModel {
  model: Model<Api>;
  apiKey?: string; // 仅自定义端点需要显式传入
}

export function resolveModel(): ResolvedModel {
  const spec = process.env.VIVA_MODEL?.trim();
  const baseUrl = process.env.VIVA_BASE_URL?.trim();

  if (baseUrl) {
    const id = spec || "default";
    return {
      model: {
        id,
        name: `${id} (custom)`,
        api: "openai-completions",
        provider: "viva-custom",
        baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
      apiKey: process.env.VIVA_API_KEY || "dummy",
    };
  }

  if (spec) {
    const slash = spec.indexOf("/");
    if (slash < 0) throw new Error(`VIVA_MODEL 格式应为 "provider/model-id"，收到: ${spec}`);
    const provider = spec.slice(0, slash) as KnownProvider;
    const id = spec.slice(slash + 1);
    const models = getModels(provider);
    const model = models.find((m) => m.id === id);
    if (!model) {
      const available = models.map((m) => m.id).slice(0, 20).join(", ");
      throw new Error(`未找到模型 ${spec}。${provider} 可用模型: ${available}`);
    }
    return { model };
  }

  for (const provider of AUTO_PROVIDERS) {
    if (!getEnvApiKey(provider)) continue;
    const models = getModels(provider);
    if (models.length === 0) continue;
    for (const hint of PREFERRED[provider] ?? []) {
      const hit = models.find((m) => m.id.includes(hint));
      if (hit) return { model: hit };
    }
    return { model: models[0] };
  }

  throw new Error(
    "未找到可用的 LLM。请任选其一：\n" +
      "  1) 设置任一厂商 API key 环境变量（如 DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY）\n" +
      '  2) 设置 VIVA_MODEL="provider/model-id" 指定模型\n' +
      "  3) 设置 VIVA_BASE_URL + VIVA_MODEL(+VIVA_API_KEY) 使用任意 OpenAI 兼容端点",
  );
}
