// 真实模型连通性探针：跑一场 1 题微型面试，验证流式输出 + 工具调用全链路。
// 读取 VIVA_* 环境变量指向的真实模型。用法: node test/live-probe.mjs
import { readFileSync } from "node:fs";
import { runScriptedInterview } from "./driver.mjs";

const answers = JSON.parse(readFileSync(new URL("../eval/candidates.json", import.meta.url), "utf8")).strong;

const { entries } = await runScriptedInterview({
  args: ["--n", "1", "--role", "Agent 开发工程师"],
  answers,
  echo: true,
});

const hasEval = entries.some((e) => e.type === "evaluation");
const hasVerdict = entries.some((e) => e.type === "verdict");
console.log(`\n--- 探针结果: 评估落盘=${hasEval} 总评落盘=${hasVerdict} ${hasEval && hasVerdict ? "✅ 工具调用全链路正常" : "❌ 工具调用异常"}`);
process.exitCode = hasEval && hasVerdict ? 0 : 1;
