import { stream, type Api, type Context, type Model, type ToolCall } from "@earendil-works/pi-ai";
import { newEntryId, type SessionStore } from "./store.js";
import type { Evaluation, Verdict } from "./types.js";

export interface TurnHooks {
  onTextDelta: (delta: string) => void;
  onTurnStart?: () => void;
  onEvaluation?: (e: Evaluation) => void;
}

export interface TurnResult {
  headId: string;
  verdict?: Verdict; // 面试官调用了 end_interview
  costSoFar: number;
}

/**
 * 薄 agent loop——整个项目的心脏，不到 80 行：
 * 流式调用 LLM → 文本直出终端 → 工具调用本地分发 → 结果回填 context →
 * 只要 stopReason 还是 toolUse 就继续，否则把回合交还给用户。
 * 没有计划器、没有子代理、没有重试编排——面试场景用不上，就不建（pi 的纪律）。
 */
export async function runTurn(
  model: Model<Api>,
  context: Context,
  store: SessionStore,
  headId: string,
  hooks: TurnHooks,
  apiKey?: string,
): Promise<TurnResult> {
  let verdict: Verdict | undefined;
  let costSoFar = 0;

  while (true) {
    hooks.onTurnStart?.();
    const s = stream(model, context, { apiKey, sessionId: store.sessionId });
    for await (const event of s) {
      if (event.type === "text_delta") hooks.onTextDelta(event.delta);
      if (event.type === "error") throw new Error(event.error.errorMessage ?? "LLM 请求失败");
    }
    const message = await s.result();
    costSoFar += message.usage.cost.total;
    context.messages.push(message);
    headId = appendEntry(store, headId, { type: "message", message });

    if (message.stopReason !== "toolUse") return { headId, verdict, costSoFar };

    for (const call of message.content.filter((b): b is ToolCall => b.type === "toolCall")) {
      let resultText = "已记录。";
      let isError = false;

      if (call.name === "record_evaluation") {
        const evaluation = call.arguments as unknown as Evaluation;
        headId = appendEntry(store, headId, { type: "evaluation", evaluation });
        hooks.onEvaluation?.(evaluation);
      } else if (call.name === "end_interview") {
        verdict = call.arguments as unknown as Verdict;
        headId = appendEntry(store, headId, { type: "verdict", verdict });
        resultText = "面试已结束，总评已记录。";
      } else {
        resultText = `未知工具: ${call.name}`;
        isError = true;
      }

      const toolResult = {
        role: "toolResult" as const,
        toolCallId: call.id,
        toolName: call.name,
        content: [{ type: "text" as const, text: resultText }],
        isError,
        timestamp: Date.now(),
      };
      context.messages.push(toolResult);
      headId = appendEntry(store, headId, { type: "message", message: toolResult });
    }

    // 总评已落盘，面试结束，不再让模型续写
    if (verdict) return { headId, verdict, costSoFar };
  }
}

function appendEntry(
  store: SessionStore,
  parentId: string | null,
  partial: { type: "message"; message: import("@earendil-works/pi-ai").Message } | { type: "evaluation"; evaluation: Evaluation } | { type: "verdict"; verdict: Verdict },
): string {
  const id = newEntryId();
  store.append({ id, parentId, ...partial } as never);
  return id;
}
