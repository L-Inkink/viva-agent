// 端到端冒烟测试：mock LLM + 完整面试 + fork 重答 + 报告校验，无需任何 API key。
// 用法: npm test
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8790;
const VIVA_HOME = mkdtempSync(join(tmpdir(), "viva-test-"));
const env = { ...process.env, VIVA_HOME, VIVA_BASE_URL: `http://localhost:${PORT}/v1`, VIVA_MODEL: "mock" };

let failed = 0;
function assert(cond, label) {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

/** 启动 CLI，看到出题（含"？"）后作答，进程退出后返回完整输出 */
function runInterview(args, answer) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/cli.js", ...args], { env });
    let out = "";
    let answered = false;
    const onData = (chunk) => {
      out += chunk.toString();
      if (!answered && /[？?]/.test(out)) {
        answered = true;
        child.stdin.write(answer + "\n");
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", () => resolve(out));
    child.on("error", reject);
    setTimeout(() => {
      child.kill();
      reject(new Error(`超时。输出:\n${out}`));
    }, 30000).unref();
  });
}

const mock = spawn(process.execPath, ["test/mock-llm.mjs", String(PORT)]);
await new Promise((r) => mock.stdout.once("data", r));

try {
  // 1. 完整面试
  const out1 = await runInterview(["start", "--n", "1", "--role", "Agent 开发工程师"], "agent loop = LLM 调用 + 工具分发 + stopReason 循环");
  assert(out1.includes("agent loop 由哪几部分组成"), "面试官正常出题");
  assert(out1.includes("第 1 题评估已记录"), "record_evaluation 工具被分发并落盘");
  assert(out1.includes("面试结束"), "end_interview 正常收尾");

  const sessionId = readdirSync(join(VIVA_HOME, "sessions"))[0].replace(/\.jsonl$/, "");
  const reportPath = join(VIVA_HOME, "reports", `${sessionId}.md`);
  assert(existsSync(reportPath), "复盘报告已生成");
  const report = readFileSync(reportPath, "utf8");
  assert(report.includes("agent loop 设计") && report.includes("推荐录用"), "报告包含结构化评估与录用建议");

  // 2. fork 重答第 1 题（mock 脚本停在最后一步，会直接再次收尾）
  const out2 = await runInterview(["fork", "1", sessionId], "重答：还要加上错误处理、重试和成本控制。");
  assert(out2.includes("从第 1 题分叉重答"), "fork 找到第 1 题的提问位置");
  assert(out2.includes("面试结束"), "fork 分支正常走完");

  // 3. session 文件是一棵树：两个 verdict 在不同分支上
  const entries = readFileSync(join(VIVA_HOME, "sessions", `${sessionId}.jsonl`), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const verdicts = entries.filter((e) => e.type === "verdict");
  assert(verdicts.length === 2 && verdicts[0].parentId !== verdicts[1].parentId, "JSONL 树保留了两条分支（原回答 + fork 重答）");
} finally {
  mock.kill();
  rmSync(VIVA_HOME, { recursive: true, force: true });
}

console.log(failed === 0 ? "\n全部通过 🎉" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
