# viva — AI 模拟面试官

> *viva voce*（拉丁语：口试）。一个跑在终端里的 AI 技术面试官：出题、追问、静默打分、生成复盘报告，还能从任意一道题"时光回溯"重答。
>
> 设计灵感来自 [pi coding agent](https://github.com/earendil-works/pi)：**小内核、少抽象、一切可读**。整个 agent loop 不到 80 行。

## 它长什么样

```
$ viva start --role "Agent 开发工程师" --jd examples/jd-agent-engineer.md --resume my-resume.md

面试官  你好，我是今天的面试官。看到你简历里提到自研 NLU 服务，
        我们从一个实际问题开始：如果让你给这个服务加一层 LLM 兜底，
        你会怎么设计降级和成本控制？

你  （输入你的回答……）

面试官  你提到用置信度阈值路由——这个阈值怎么定？拍脑袋还是有数据支撑？
  📋 第 1 题评估已记录
...

✅ 面试结束  总成本 $0.0214
复盘报告: ~/.viva/reports/viva-20260610-xxxx.md
```

复盘报告含：分题评分表、能力维度画像、每题的亮点/不足/理想答案要点、面试官总评与改进建议。

答砸了某道题？**fork 回去重答**，原回答完整保留：

```
$ viva fork 3            # 从第 3 题被提出的瞬间分叉，重新作答
$ viva compare 3         # 并排对比第 3 题的原回答与重答：得分变化、各自的亮点/不足
$ viva report            # 重新生成当前分支的复盘报告
$ viva list              # 历史面试一览
```

## 快速开始

```bash
npm install && npm run build

# 任选一种模型配置（API key 走各厂商标准环境变量）：
export DEEPSEEK_API_KEY=sk-...                 # 1) 自动探测，按成本优先
export VIVA_MODEL="anthropic/claude-sonnet-4-6" # 2) 显式指定 provider/model
export VIVA_BASE_URL=http://localhost:11434/v1  # 3) 任意 OpenAI 兼容端点
                                                #    （vLLM / Ollama / 中转），配合 VIVA_MODEL + VIVA_API_KEY

node dist/cli.js start --role "你的目标岗位" --level senior --n 5
```

离线跑通整条链路（无需任何 key）：`npm test` —— 用脚本化的 mock LLM 服务器走完「出题 → 作答 → 工具评估 → 收尾 → fork 重答 → compare 对比 → 报告校验」全流程。

## 面试官本身也要被评测

`npm run eval`（需真实模型）：强/弱两个脚本化候选人各跑 N 场同题面试，回归三件事——

- **区分度**：强候选人均分必须比弱候选人高至少 1 分
- **稳定性**：同一候选人多次运行的分差 ≤ 1.5 分（`--runs N` 控制重复次数）
- **健壮性**：每场都必须完整产出结构化评估和总评（工具调用不掉链子）

改提示词、换模型之前先跑一遍，面试官"变笨"了立刻暴露。

## 架构与设计决策

```
src/
  cli.ts      命令行入口与 REPL（~230 行）
  loop.ts     agent loop（~80 行，整个项目的心脏）
  tools.ts    面试官的两个工具：record_evaluation / end_interview
  prompts.ts  系统提示词（刻意 <1000 token，pi 的启示）
  store.ts    JSONL 树形 session 存储（append-only，支持 fork）
  report.ts   复盘报告生成（纯数据变换，零 LLM 调用）
  compare.ts  同一道题跨分支的重答对比
  config.ts   多厂商模型解析（pi-ai 注册表 + 自定义端点）
test/         mock LLM 服务器、脚本化面试驱动、离线冒烟测试、真实模型探针
eval/         面试官回归评测（强/弱候选人区分度与打分稳定性）
```

四个值得说道的决策：

1. **双通道输出**。自然对话走文本流（候选人看到的），结构化评估走工具调用（候选人看不到的）。复盘报告 100% 由工具写入的结构化数据生成，不靠事后解析聊天记录——可复现、零额外成本，且面试中绝不泄露分数。

2. **session 是一棵 append-only 的 JSONL 树**（直接借鉴 pi）。每条记录带 `id/parentId`，fork 不复制文件，新分支从历史节点长出来，旧分支永久可回溯。"当前对话"只是"从最后一条记录回溯到根的路径"。

3. **薄 loop，刻意不建的东西**：没有计划器、没有子代理、没有重试编排、没有 RAG。面试场景用不上，就不建——pi 的纪律：*if I don't need it, it won't be built*。

4. **供应商无关**。底座是 [@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) 统一 LLM API：30+ 厂商一行切换，token/成本自动统计；测试时换成 mock 端点，agent 代码零改动。

## Roadmap

- [x] 评测回归：脚本化强/弱候选人，验证面试官的区分度、稳定性与健壮性（`npm run eval`）
- [x] `viva compare`：fork 前后两次回答的对比报告
- [ ] 语音模式（流式 TTS/ASR，更接近真实面试）
- [ ] Web 报告页与付费题库（盈利方向）

## License

MIT
