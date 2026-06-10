import { Type, type Tool } from "@earendil-works/pi-ai";

/**
 * 面试官的工具集只有两个。设计原则（也是与 pi 一脉相承的取舍）：
 * 自然对话走文本通道，结构化评估走工具通道——复盘报告完全由工具
 * 写入的结构化数据生成，不靠事后解析聊天记录。
 */

export const recordEvaluation: Tool = {
  name: "record_evaluation",
  description:
    "候选人答完一道主问题（含追问）后，静默记录这道题的结构化评估。候选人看不到评估内容，面试中绝不向候选人透露分数。",
  parameters: Type.Object({
    questionNumber: Type.Number({ description: "第几道主问题，从 1 开始" }),
    topic: Type.String({ description: "考察主题，如 'agent loop 设计'" }),
    question: Type.String({ description: "题目简述" }),
    dimension: Type.String({
      description: "主要考察维度，取值：基础知识 | 系统设计 | 工程权衡 | 实战经验 | 沟通表达",
    }),
    score: Type.Number({
      minimum: 1,
      maximum: 5,
      description:
        "严格对照锚点打分，只看回答内容，不受语气和篇幅影响：" +
        "1=答不上来或方向错误；2=只有零散概念，缺乏结构；3=方向正确、结构完整，但缺乏深度或实战细节；" +
        "4=结构清晰且给出具体工程方案与权衡；5=在 4 的基础上还有踩坑经验、量化结果或超出问题本身的洞察。同样质量的回答必须得到同样的分。",
    }),
    strengths: Type.String({ description: "回答中的亮点" }),
    weaknesses: Type.String({ description: "回答中的不足或遗漏" }),
    idealAnswerPoints: Type.String({ description: "理想答案的关键要点，写进复盘报告供候选人学习" }),
  }),
};

export const endInterview: Tool = {
  name: "end_interview",
  description:
    "全部主问题完成（或候选人主动要求结束）时调用，给出总评并结束面试。调用前先用文本向候选人礼貌收尾。",
  parameters: Type.Object({
    overallScore: Type.Number({ minimum: 1, maximum: 5 }),
    recommendation: Type.Unsafe<string>({
      type: "string",
      enum: ["strong_hire", "hire", "lean_hire", "no_hire"],
      description: "录用建议",
    }),
    summary: Type.String({ description: "面试官内部总评：整体水平、突出优势、主要风险" }),
    adviceForCandidate: Type.String({ description: "给候选人的具体改进建议，写进复盘报告" }),
  }),
};

export const interviewTools: Tool[] = [recordEvaluation, endInterview];
