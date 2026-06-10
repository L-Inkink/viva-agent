import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VIVA_HOME } from "./store.js";
import type { Evaluation, InterviewSetup, SessionEntry, Verdict } from "./types.js";

const REPORTS_DIR = join(VIVA_HOME, "reports");

const RECOMMENDATION_LABEL: Record<Verdict["recommendation"], string> = {
  strong_hire: "强烈推荐录用 ✅✅",
  hire: "推荐录用 ✅",
  lean_hire: "倾向录用（有保留）🤔",
  no_hire: "暂不推荐 ❌",
};

function bar(score: number): string {
  const filled = Math.round(score);
  return "★".repeat(filled) + "☆".repeat(5 - filled) + ` ${score.toFixed(1)}`;
}

/** 复盘报告完全由工具写入的结构化数据生成，不重新调用 LLM，零成本、可复现 */
export function generateReport(sessionId: string, branch: SessionEntry[]): { markdown: string; path: string } {
  const setup = branch.find((e): e is Extract<SessionEntry, { type: "setup" }> => e.type === "setup")?.setup;
  const evaluations = branch.filter((e): e is Extract<SessionEntry, { type: "evaluation" }> => e.type === "evaluation").map((e) => e.evaluation);
  const verdict = branch.find((e): e is Extract<SessionEntry, { type: "verdict" }> => e.type === "verdict")?.verdict;
  const cost = branch.reduce((sum, e) => (e.type === "message" && e.message.role === "assistant" ? sum + e.message.usage.cost.total : sum), 0);

  const lines: string[] = [];
  lines.push(`# 面试复盘报告`);
  lines.push("");
  lines.push(`- **岗位**：${setup?.role ?? "未知"}（${setup?.level ?? "?"}）`);
  lines.push(`- **Session**：\`${sessionId}\``);
  lines.push(`- **完成题数**：${evaluations.length}${setup ? ` / ${setup.questionCount}` : ""}`);
  if (verdict) {
    lines.push(`- **总评分**：${bar(verdict.overallScore)}`);
    lines.push(`- **录用建议**：${RECOMMENDATION_LABEL[verdict.recommendation] ?? verdict.recommendation}`);
  }
  lines.push(`- **本场 token 成本**：$${cost.toFixed(4)}`);
  lines.push("");

  if (evaluations.length > 0) {
    lines.push(`## 分题评估`);
    lines.push("");
    lines.push(`| # | 主题 | 维度 | 得分 |`);
    lines.push(`|---|------|------|------|`);
    for (const e of evaluations) {
      lines.push(`| ${e.questionNumber} | ${e.topic} | ${e.dimension} | ${bar(e.score)} |`);
    }
    lines.push("");

    const byDimension = new Map<string, number[]>();
    for (const e of evaluations) {
      byDimension.set(e.dimension, [...(byDimension.get(e.dimension) ?? []), e.score]);
    }
    lines.push(`## 维度画像`);
    lines.push("");
    for (const [dim, scores] of byDimension) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      lines.push(`- **${dim}**：${bar(avg)}`);
    }
    lines.push("");

    lines.push(`## 逐题详解`);
    lines.push("");
    for (const e of evaluations) {
      lines.push(`### Q${e.questionNumber}：${e.question}`);
      lines.push("");
      lines.push(`- 得分：${bar(e.score)}（${e.dimension}）`);
      lines.push(`- ✅ 亮点：${e.strengths}`);
      lines.push(`- ⚠️ 不足：${e.weaknesses}`);
      lines.push(`- 💡 理想答案要点：${e.idealAnswerPoints}`);
      lines.push("");
      lines.push(`> 想重答这道题：\`viva fork ${e.questionNumber} ${sessionId}\``);
      lines.push("");
    }
  }

  if (verdict) {
    lines.push(`## 面试官总评`);
    lines.push("");
    lines.push(verdict.summary);
    lines.push("");
    lines.push(`## 给你的改进建议`);
    lines.push("");
    lines.push(verdict.adviceForCandidate);
    lines.push("");
  }

  const markdown = lines.join("\n");
  mkdirSync(REPORTS_DIR, { recursive: true });
  const path = join(REPORTS_DIR, `${sessionId}.md`);
  writeFileSync(path, markdown, "utf8");
  return { markdown, path };
}
