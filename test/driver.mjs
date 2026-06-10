// 脚本化面试驱动：起一场 CLI 面试，按回答队列自动应答（队列耗尽后 /end），
// 结束后返回完整输出与 session 树记录。数据写入临时 VIVA_HOME，用后即焚。
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function runScriptedInterview({ args = [], answers = [], env = process.env, timeoutMs = 300000, echo = false }) {
  return new Promise((resolve, reject) => {
    const VIVA_HOME = mkdtempSync(join(tmpdir(), "viva-run-"));
    const queue = [...answers];
    const child = spawn(process.execPath, ["dist/cli.js", "start", ...args], { env: { ...env, VIVA_HOME } });
    let out = "";
    let lastLen = 0;
    const onData = (c) => {
      if (echo) process.stdout.write(c);
      out += c.toString();
      // CLI 输出 "你  " 提示符（带 ANSI 加粗）即轮到候选人作答；同一提示符只答一次
      if (/你\x1b\[0m\s+$/.test(out) && out.length > lastLen) {
        lastLen = out.length;
        const reply = queue.shift() ?? "/end";
        setTimeout(() => child.stdin.write(reply + "\n"), 300);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`面试超时。输出:\n${out}`));
    }, timeoutMs);
    timer.unref();
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const f = readdirSync(join(VIVA_HOME, "sessions"))[0];
        const entries = readFileSync(join(VIVA_HOME, "sessions", f), "utf8")
          .split("\n").filter(Boolean).map((l) => JSON.parse(l));
        resolve({ output: out, entries });
      } catch (err) {
        reject(err);
      } finally {
        rmSync(VIVA_HOME, { recursive: true, force: true });
      }
    });
    child.on("error", reject);
  });
}
