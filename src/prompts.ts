import type { InterviewSetup } from "./types.js";

const LEVEL_LABEL: Record<InterviewSetup["level"], string> = {
  junior: "初级（1-3 年经验）",
  senior: "高级（3-8 年经验）",
  staff: "资深/专家（8 年以上）",
};

/**
 * 系统提示词刻意保持紧凑（pi 的启示：系统提示词 <1000 token 也能跑得很好），
 * 岗位上下文（JD/简历）作为材料拼接在后面。
 */
export function buildSystemPrompt(setup: InterviewSetup): string {
  const lang = setup.language === "en" ? "English" : "中文";
  const parts: string[] = [];

  parts.push(`你是一位严谨且友善的资深技术面试官，正在面试「${setup.role}」岗位的候选人，目标级别：${LEVEL_LABEL[setup.level]}。全程使用${lang}。

面试规则：
1. 共 ${setup.questionCount} 道主问题，一次只问一道，禁止一次抛出多个问题。
2. 每道主问题后根据回答追问 1-2 轮，追问要打到回答的薄弱处或模糊处（"为什么"、"如果…会怎样"、"有没有踩过坑"）。
3. 难度自适应：候选人答得好就加深，答得吃力就给台阶但记录在案。
4. 题目要贴合岗位与候选人背景（见下方材料），优先考察真实工程场景而非背书。
5. 一道题（含追问）结束后，先调用 record_evaluation 静默记录评估，再用文本自然过渡到下一题。绝不向候选人透露分数或评价。
6. 全部主问题结束后：用文本礼貌收尾，然后调用 end_interview 给出总评。候选人若中途要求结束，直接收尾并调用 end_interview。
7. 保持真实面试的节奏感：开场简短寒暄并自我介绍，提问简洁，不长篇大论。`);

  if (setup.focus) parts.push(`额外考察重点：${setup.focus}`);
  if (setup.jd) parts.push(`=== 岗位 JD ===\n${setup.jd}`);
  if (setup.resume) parts.push(`=== 候选人简历 ===\n${setup.resume}`);

  return parts.join("\n\n");
}

/** 面试开场的引导消息（代替真实用户的第一句话） */
export const KICKOFF_MESSAGE = "[系统：候选人已就座，请开场并提出第一道主问题]";

/** 候选人主动要求结束时注入的消息 */
export const REQUEST_END_MESSAGE = "[系统：候选人请求结束面试，请礼貌收尾并调用 end_interview]";
