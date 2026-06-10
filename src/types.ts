import type { Message } from "@earendil-works/pi-ai";

/** 面试设置：开场时固化进 session，决定系统提示词 */
export interface InterviewSetup {
  role: string; // 目标岗位，如 "Agent 开发工程师"
  level: "junior" | "senior" | "staff";
  language: "zh" | "en";
  questionCount: number; // 主问题数量
  jd?: string; // 岗位 JD 原文
  resume?: string; // 候选人简历原文
  focus?: string; // 额外考察重点
}

/** 每道题的结构化评估，由面试官通过 record_evaluation 工具静默写入 */
export interface Evaluation {
  questionNumber: number;
  topic: string;
  question: string;
  dimension: string;
  score: number; // 1-5
  strengths: string;
  weaknesses: string;
  idealAnswerPoints: string;
}

/** 面试结束时的总评，由 end_interview 工具写入 */
export interface Verdict {
  overallScore: number; // 1-5
  recommendation: "strong_hire" | "hire" | "lean_hire" | "no_hire";
  summary: string;
  adviceForCandidate: string;
}

/**
 * Session 是一棵树（致敬 pi 的 JSONL 树设计）：
 * 每条记录有 id/parentId，fork 时新分支从任意历史节点长出，
 * 旧分支保留在文件里。当前对话 = 从最后一条记录回溯到根的路径。
 */
export type SessionEntry =
  | { id: string; parentId: string | null; type: "setup"; setup: InterviewSetup; model: string; createdAt: number }
  | { id: string; parentId: string | null; type: "message"; message: Message }
  | { id: string; parentId: string | null; type: "evaluation"; evaluation: Evaluation }
  | { id: string; parentId: string | null; type: "verdict"; verdict: Verdict };
