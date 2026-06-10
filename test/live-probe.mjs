// 真实模型连通性探针：跑一场 1 题微型面试，验证流式输出 + 工具调用全链路。
// 数据写入临时 VIVA_HOME，不污染真实面试记录。用法: node test/live-probe.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VIVA_HOME = mkdtempSync(join(tmpdir(), "viva-live-"));
const env = { ...process.env, VIVA_HOME };

// 预置的多轮回答队列（真实面试官会追问 1-2 轮），耗尽后请求结束
const answers = [
  "一个最小 agent loop：调用 LLM、按 stopReason 判断是否有工具调用、本地执行工具、结果回填上下文继续循环，直到模型给出纯文本回复。生产上还要加错误重试和成本上限。",
  "任务拆解我会让模型先产出结构化 plan 并落盘，每步执行后对照 plan 更新状态，避免遗忘目标。工具失败先指数退避重试 2 次，再失败就降级：能换数据源就换，不能就把失败上下文交给模型重新规划，最后兜底转人工确认。",
  "死循环防护用三层：单 session 步数上限、相同工具+参数的重复调用检测、token 成本预算熔断。",
];
const child = spawn(process.execPath, ["dist/cli.js", "start", "--n", "1", "--role", "Agent 开发工程师"], { env });
let out = "";
let lastLen = 0;
child.stdout.on("data", (c) => {
  process.stdout.write(c);
  out += c.toString();
  // CLI 输出 "你  " 提示符（带 ANSI 加粗）即轮到候选人作答；同一提示符只答一次
  if (/你\x1b\[0m\s+$/.test(out) && out.length > lastLen) {
    lastLen = out.length;
    const reply = answers.shift() ?? "/end";
    setTimeout(() => child.stdin.write(reply + "\n"), 500);
  }
});
child.stderr.pipe(process.stderr);

const timeout = setTimeout(() => { console.error("\n⏰ 超时"); child.kill(); }, 180000);
child.on("close", () => {
  clearTimeout(timeout);
  try {
    const sessions = readdirSync(join(VIVA_HOME, "sessions"));
    const entries = readFileSync(join(VIVA_HOME, "sessions", sessions[0]), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const hasEval = entries.some((e) => e.type === "evaluation");
    const hasVerdict = entries.some((e) => e.type === "verdict");
    console.log(`\n--- 探针结果: 评估落盘=${hasEval} 总评落盘=${hasVerdict} ${hasEval && hasVerdict ? "✅ 工具调用全链路正常" : "❌ 工具调用异常"}`);
    process.exitCode = hasEval && hasVerdict ? 0 : 1;
  } finally {
    rmSync(VIVA_HOME, { recursive: true, force: true });
  }
});
