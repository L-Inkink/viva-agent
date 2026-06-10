#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import type { Context, Message } from "@earendil-works/pi-ai";
import { resolveModel } from "./config.js";
import { runTurn } from "./loop.js";
import { buildSystemPrompt, KICKOFF_MESSAGE, REQUEST_END_MESSAGE } from "./prompts.js";
import { generateReport } from "./report.js";
import { newEntryId, SessionStore } from "./store.js";
import { interviewTools } from "./tools.js";
import type { InterviewSetup, SessionEntry } from "./types.js";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const HELP = `viva — AI 模拟面试官（基于 pi-ai 的薄 agent loop）

用法:
  viva [start] [选项]          开始一场新面试
  viva fork <题号> [session]   从某道题之前分叉，重答该题（默认最近一场）
  viva report [session]        生成/重新生成复盘报告（默认最近一场）
  viva list                    列出历史面试

start 选项:
  --role <岗位>        目标岗位（默认 "Agent 开发工程师"）
  --level <级别>       junior | senior | staff（默认 senior）
  --n <数量>           主问题数量（默认 5）
  --jd <文件>          岗位 JD 文本文件
  --resume <文件>      简历文本文件
  --focus <重点>       额外考察重点
  --lang <语言>        zh | en（默认 zh）

模型配置（环境变量）:
  DEEPSEEK_API_KEY 等任一厂商 key 即可自动探测；
  或 VIVA_MODEL="provider/model-id" 指定；
  或 VIVA_BASE_URL + VIVA_MODEL + VIVA_API_KEY 接任意 OpenAI 兼容端点。

面试中: 直接输入回答；/end 提前结束；/quit 退出（进度已实时落盘）`;

function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags.set(argv[i].slice(2), argv[i + 1] ?? "");
  }
  return flags;
}

function messagesFromBranch(branch: SessionEntry[]): Message[] {
  return branch.filter((e): e is Extract<SessionEntry, { type: "message" }> => e.type === "message").map((e) => e.message);
}

async function interviewLoop(store: SessionStore, setup: InterviewSetup, messages: Message[], headId: string): Promise<void> {
  const { model, apiKey } = resolveModel();
  console.log(dim(`session: ${store.sessionId}  |  模型: ${model.provider}/${model.id}`));
  console.log(dim(`岗位: ${setup.role}（${setup.level}）  |  ${setup.questionCount} 道主问题  |  /end 提前结束  /quit 退出\n`));

  const context: Context = { systemPrompt: buildSystemPrompt(setup), messages, tools: interviewTools };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let totalCost = 0;

  const hooks = {
    onTurnStart: () => process.stdout.write(`\n${cyan(bold("面试官"))}  `),
    onTextDelta: (delta: string) => process.stdout.write(delta),
    onEvaluation: (e: { questionNumber: number }) => process.stdout.write(dim(`\n  📋 第 ${e.questionNumber} 题评估已记录`)),
  };

  try {
    while (true) {
      const result = await runTurn(model, context, store, headId, hooks, apiKey);
      headId = result.headId;
      totalCost += result.costSoFar;

      if (result.verdict) {
        const { path } = generateReport(store.sessionId, store.branch(headId));
        console.log(`\n\n${bold("✅ 面试结束")}  ${dim(`总成本 $${totalCost.toFixed(4)}`)}`);
        console.log(`复盘报告: ${path}`);
        return;
      }

      let answer = "";
      while (!answer.trim()) {
        answer = await rl.question(`\n\n${bold("你")}  `);
      }
      if (answer.trim() === "/quit") {
        console.log(dim(`\n进度已保存。继续重答可用 viva fork，查看报告用 viva report ${store.sessionId}`));
        return;
      }
      const text = answer.trim() === "/end" ? REQUEST_END_MESSAGE : answer;
      const userMessage: Message = { role: "user", content: text, timestamp: Date.now() };
      context.messages.push(userMessage);
      const id = newEntryId();
      store.append({ id, parentId: headId, type: "message", message: userMessage });
      headId = id;
    }
  } finally {
    rl.close();
  }
}

async function cmdStart(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  const setup: InterviewSetup = {
    role: flags.get("role") ?? "Agent 开发工程师",
    level: (flags.get("level") as InterviewSetup["level"]) ?? "senior",
    language: (flags.get("lang") as InterviewSetup["language"]) ?? "zh",
    questionCount: Number(flags.get("n") ?? 5),
    jd: flags.has("jd") ? readFileSync(flags.get("jd")!, "utf8") : undefined,
    resume: flags.has("resume") ? readFileSync(flags.get("resume")!, "utf8") : undefined,
    focus: flags.get("focus"),
  };

  const store = SessionStore.create();
  const { model } = resolveModel(); // 提前解析，配置错误在开场前暴露
  const setupId = newEntryId();
  store.append({ id: setupId, parentId: null, type: "setup", setup, model: `${model.provider}/${model.id}`, createdAt: Date.now() });

  const kickoff: Message = { role: "user", content: KICKOFF_MESSAGE, timestamp: Date.now() };
  const kickoffId = newEntryId();
  store.append({ id: kickoffId, parentId: setupId, type: "message", message: kickoff });

  await interviewLoop(store, setup, [kickoff], kickoffId);
}

/** fork：从第 n 题被提出的那条 assistant 消息处分叉，旧分支原样保留在 JSONL 树里 */
async function cmdFork(argv: string[]): Promise<void> {
  const n = Number(argv[0]);
  if (!Number.isInteger(n) || n < 1) throw new Error("用法: viva fork <题号> [sessionId]");
  const sessionId = argv[1] ?? SessionStore.latestId();
  if (!sessionId) throw new Error("没有历史 session");

  const store = SessionStore.open(sessionId);
  const branch = store.branch();
  const setup = branch.find((e): e is Extract<SessionEntry, { type: "setup" }> => e.type === "setup")?.setup;
  if (!setup) throw new Error("session 缺少 setup 记录");

  // 第 1 题在开场后的第一条 assistant 消息里；第 n 题在第 n-1 题评估之后的第一条 assistant 消息里
  let searchFrom = 0;
  if (n > 1) {
    searchFrom = branch.findIndex((e) => e.type === "evaluation" && e.evaluation.questionNumber === n - 1);
    if (searchFrom < 0) throw new Error(`这场面试还没进行到第 ${n} 题`);
  }
  const forkPoint = branch
    .slice(searchFrom + 1)
    .find((e) => e.type === "message" && e.message.role === "assistant" && e.message.content.some((b) => b.type === "text"));
  if (!forkPoint) throw new Error(`找不到第 ${n} 题的提问位置`);

  const forkBranch = store.branch(forkPoint.id);
  const lastQuestion = (forkPoint as Extract<SessionEntry, { type: "message" }>).message;
  const questionText = lastQuestion.role === "assistant" ? lastQuestion.content.filter((b) => b.type === "text").map((b) => b.text).join("") : "";

  console.log(dim(`从第 ${n} 题分叉重答（原回答保留在 session 树里）`));
  console.log(`\n${cyan(bold("面试官"))}  ${questionText}`);
  await interviewLoopResumed(store, setup, forkBranch, forkPoint.id);
}

async function interviewLoopResumed(store: SessionStore, setup: InterviewSetup, branch: SessionEntry[], headId: string): Promise<void> {
  await interviewLoop(store, setup, messagesFromBranch(branch), headId);
}

function cmdReport(argv: string[]): void {
  const sessionId = argv[0] ?? SessionStore.latestId();
  if (!sessionId) throw new Error("没有历史 session");
  const store = SessionStore.open(sessionId);
  const { markdown, path } = generateReport(sessionId, store.branch());
  console.log(markdown);
  console.log(dim(`\n已保存: ${path}`));
}

function cmdList(): void {
  const ids = SessionStore.listIds();
  if (ids.length === 0) {
    console.log("还没有面试记录，运行 viva 开始第一场。");
    return;
  }
  for (const id of ids) {
    const branch = SessionStore.open(id).branch();
    const setup = branch.find((e): e is Extract<SessionEntry, { type: "setup" }> => e.type === "setup")?.setup;
    const evals = branch.filter((e) => e.type === "evaluation").length;
    const done = branch.some((e) => e.type === "verdict") ? "✅" : "⏸ ";
    console.log(`${done} ${id}  ${setup?.role ?? "?"}（${setup?.level ?? "?"}）  ${evals} 题已评估`);
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === "list") cmdList();
    else if (cmd === "report") cmdReport(rest);
    else if (cmd === "fork") await cmdFork(rest);
    else if (cmd === "help" || cmd === "--help" || cmd === "-h") console.log(HELP);
    else if (cmd === "start" || cmd === undefined || cmd.startsWith("--")) await cmdStart(cmd?.startsWith("--") ? [cmd, ...rest] : rest);
    else {
      console.error(`未知命令: ${cmd}\n`);
      console.log(HELP);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

main();
