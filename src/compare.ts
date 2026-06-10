import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionStore, VIVA_HOME } from "./store.js";
import type { Evaluation, SessionEntry } from "./types.js";

const REPORTS_DIR = join(VIVA_HOME, "reports");

interface Attempt {
  evaluation: Evaluation;
  answers: string[]; // 候选人在这道题上的全部回答（含追问轮次）
}

function bar(score: number): string {
  return "★".repeat(Math.round(score)) + "☆".repeat(5 - Math.round(score)) + ` ${score.toFixed(1)}`;
}

/**
 * 同一道题在树上不同分支的尝试对比：
 * 找到所有 questionNumber 匹配的评估节点（每个分支最多一个），
 * 沿各自分支回溯出候选人的回答，按时间顺序并排展示。
 */
export function generateCompare(sessionId: string, questionNumber: number): { markdown: string; path: string } {
  const store = SessionStore.open(sessionId);
  const entries = store.loadAll();

  const evalEntries = entries.filter(
    (e): e is Extract<SessionEntry, { type: "evaluation" }> => e.type === "evaluation" && e.evaluation.questionNumber === questionNumber,
  );
  if (evalEntries.length === 0) throw new Error(`第 ${questionNumber} 题还没有任何已评估的回答`);
  if (evalEntries.length === 1) {
    throw new Error(`第 ${questionNumber} 题只有一次回答。先 viva fork ${questionNumber} ${sessionId} 重答一次再对比`);
  }

  const attempts: Attempt[] = evalEntries.map((evalEntry) => {
    const branch = store.branch(evalEntry.id);
    // 这道题的回答 = 分支上「上一题评估（或起点）之后」的非系统用户消息
    const prevEvalIdx = branch.findLastIndex((e) => e.type === "evaluation" && e.evaluation.questionNumber !== questionNumber);
    const answers = branch
      .slice(prevEvalIdx + 1)
      .filter((e): e is Extract<SessionEntry, { type: "message" }> => e.type === "message" && e.message.role === "user")
      .map((e) => (typeof e.message.content === "string" ? e.message.content : e.message.content.filter((b) => b.type === "text").map((b) => b.text).join("")))
      .filter((t) => !t.startsWith("[系统："));
    return { evaluation: evalEntry.evaluation, answers };
  });

  const lines: string[] = [];
  lines.push(`# 第 ${questionNumber} 题重答对比`);
  lines.push("");
  lines.push(`- **题目**：${attempts[0].evaluation.question}`);
  lines.push(`- **Session**：\`${sessionId}\``);
  lines.push("");
  lines.push(`| 尝试 | 得分 | 维度 |`);
  lines.push(`|------|------|------|`);
  attempts.forEach((a, i) => lines.push(`| 第 ${i + 1} 次 | ${bar(a.evaluation.score)} | ${a.evaluation.dimension} |`));
  lines.push("");

  const delta = attempts.at(-1)!.evaluation.score - attempts[0].evaluation.score;
  lines.push(delta > 0 ? `**进步：+${delta.toFixed(1)} 分** 📈` : delta < 0 ? `**退步：${delta.toFixed(1)} 分** 📉` : `**得分持平**`);
  lines.push("");

  attempts.forEach((a, i) => {
    lines.push(`## 第 ${i + 1} 次尝试（${bar(a.evaluation.score)}）`);
    lines.push("");
    lines.push(`**你的回答：**`);
    lines.push("");
    a.answers.forEach((ans) => lines.push(`> ${ans.replaceAll("\n", "\n> ")}`));
    lines.push("");
    lines.push(`- ✅ 亮点：${a.evaluation.strengths}`);
    lines.push(`- ⚠️ 不足：${a.evaluation.weaknesses}`);
    lines.push("");
  });

  lines.push(`## 理想答案要点`);
  lines.push("");
  lines.push(attempts.at(-1)!.evaluation.idealAnswerPoints);
  lines.push("");

  const markdown = lines.join("\n");
  mkdirSync(REPORTS_DIR, { recursive: true });
  const path = join(REPORTS_DIR, `${sessionId}-compare-q${questionNumber}.md`);
  writeFileSync(path, markdown, "utf8");
  return { markdown, path };
}
