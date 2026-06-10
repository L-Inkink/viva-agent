// 脚本化的 OpenAI 兼容 mock 服务器，用于离线冒烟测试 agent loop：
// 第 1 次请求出题 → 第 2 次请求调 record_evaluation → 第 3 次收尾并调 end_interview。
// 用法: node test/mock-llm.mjs [port]
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8787);
let calls = 0;

const SCRIPT = [
  { text: "你好，我是今天的面试官。我们直接开始：请讲讲一个最小可用的 agent loop 由哪几部分组成？" },
  {
    toolCalls: [
      {
        name: "record_evaluation",
        arguments: {
          questionNumber: 1,
          topic: "agent loop 设计",
          question: "最小可用的 agent loop 由哪几部分组成",
          dimension: "基础知识",
          score: 4,
          strengths: "结构清晰，提到了工具分发和停止条件",
          weaknesses: "没有提到错误处理和成本控制",
          idealAnswerPoints: "LLM 调用、工具定义与分发、stopReason 驱动的循环、上下文回填、终止条件",
        },
      },
    ],
  },
  {
    text: "好的，今天的面试就到这里，感谢你的时间！",
    toolCalls: [
      {
        name: "end_interview",
        arguments: {
          overallScore: 4,
          recommendation: "hire",
          summary: "基础扎实，表达清楚，工程细节略有欠缺。",
          adviceForCandidate: "补充 agent 的错误处理、重试与成本控制实践。",
        },
      },
    ],
  },
];

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const step = SCRIPT[Math.min(calls, SCRIPT.length - 1)];
    calls++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const id = `mock-${calls}`;
    const chunk = (delta, finish = null) => ({
      id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "mock",
      choices: [{ index: 0, delta, finish_reason: finish }],
    });

    sse(res, chunk({ role: "assistant" }));
    if (step.text) {
      for (const piece of step.text.match(/.{1,8}/gs) ?? []) sse(res, chunk({ content: piece }));
    }
    if (step.toolCalls) {
      step.toolCalls.forEach((tc, i) => {
        sse(res, chunk({ tool_calls: [{ index: i, id: `call_${calls}_${i}`, type: "function", function: { name: tc.name, arguments: "" } }] }));
        sse(res, chunk({ tool_calls: [{ index: i, function: { arguments: JSON.stringify(tc.arguments) } }] }));
      });
    }
    sse(res, chunk({}, step.toolCalls ? "tool_calls" : "stop"));
    sse(res, {
      id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "mock",
      choices: [],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
    res.write("data: [DONE]\n\n");
    res.end();
  });
}).listen(port, () => console.log(`mock LLM listening on http://localhost:${port}/v1 (calls scripted: ${SCRIPT.length})`));
