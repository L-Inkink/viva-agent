// 面试官回归评测：强/弱两个脚本化候选人各跑 N 场同题面试，验证
//   1. 区分度：强候选人平均分应显著高于弱候选人（>= 1 分）
//   2. 稳定性：同一候选人多次运行的分差应 <= 1.5 分
//   3. 健壮性：每场都必须产出 evaluation 和 verdict（工具调用不掉链子）
// 需要真实模型（读取 VIVA_* 环境变量）。用法: node eval/run.mjs [--runs N]
import { readFileSync } from "node:fs";
import { runScriptedInterview } from "../test/driver.mjs";

const runs = Number(process.argv[process.argv.indexOf("--runs") + 1] || 1);
const candidates = JSON.parse(readFileSync(new URL("./candidates.json", import.meta.url), "utf8"));
const ARGS = ["--n", "1", "--role", "Agent 开发工程师", "--focus", "agent loop 设计与工程化"];

const results = {}; // candidate -> [{score, recommendation}]
for (const [name, answers] of Object.entries(candidates)) {
  results[name] = [];
  for (let i = 1; i <= runs; i++) {
    process.stdout.write(`${name} #${i} 面试中... `);
    const t0 = Date.now();
    const { entries } = await runScriptedInterview({ args: ARGS, answers });
    const evals = entries.filter((e) => e.type === "evaluation");
    const verdict = entries.find((e) => e.type === "verdict")?.verdict;
    const score = evals[0]?.evaluation.score ?? NaN;
    results[name].push({ score, recommendation: verdict?.recommendation ?? "missing", ok: evals.length > 0 && !!verdict });
    console.log(`得分 ${score}  建议 ${verdict?.recommendation ?? "?"}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}

let failed = 0;
function assert(cond, label) {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

console.log("\n=== 回归结论 ===");
const avg = (name) => results[name].reduce((s, r) => s + r.score, 0) / results[name].length;
const spread = (name) => Math.max(...results[name].map((r) => r.score)) - Math.min(...results[name].map((r) => r.score));

assert(Object.values(results).flat().every((r) => r.ok), "健壮性：每场都产出 evaluation + verdict");
assert(avg("strong") - avg("weak") >= 1, `区分度：strong 均分 ${avg("strong").toFixed(1)} vs weak 均分 ${avg("weak").toFixed(1)}（要求差距 >= 1）`);
if (runs > 1) {
  assert(spread("strong") <= 1.5 && spread("weak") <= 1.5, `稳定性：strong 分差 ${spread("strong")} / weak 分差 ${spread("weak")}（要求 <= 1.5）`);
}

console.log(failed === 0 ? "\n回归通过 🎉" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
