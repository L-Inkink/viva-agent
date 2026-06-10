import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionEntry } from "./types.js";

// VIVA_HOME 让测试与真实数据隔离，默认 ~/.viva
export const VIVA_HOME = process.env.VIVA_HOME ?? join(homedir(), ".viva");
const SESSIONS_DIR = join(VIVA_HOME, "sessions");

export function newEntryId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * JSONL 树形 session 存储。一行一条记录，只追加、不修改。
 * fork 不复制文件——新分支的记录带着指向历史节点的 parentId 追加在文件尾部，
 * 整棵树（包括被放弃的分支）永远可回溯。
 */
export class SessionStore {
  readonly sessionId: string;
  private readonly file: string;

  private constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.file = join(SESSIONS_DIR, `${sessionId}.jsonl`);
  }

  static create(): SessionStore {
    mkdirSync(SESSIONS_DIR, { recursive: true });
    const ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-");
    return new SessionStore(`viva-${ts}-${newEntryId().slice(0, 4)}`);
  }

  static open(sessionId: string): SessionStore {
    const store = new SessionStore(sessionId);
    if (!existsSync(store.file)) throw new Error(`session 不存在: ${sessionId}`);
    return store;
  }

  /** 最近一次面试的 sessionId（按文件名时间排序） */
  static latestId(): string | undefined {
    return SessionStore.listIds().at(-1);
  }

  static listIds(): string[] {
    if (!existsSync(SESSIONS_DIR)) return [];
    return readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(/\.jsonl$/, ""))
      .sort();
  }

  append(entry: SessionEntry): void {
    appendFileSync(this.file, JSON.stringify(entry) + "\n", "utf8");
  }

  loadAll(): SessionEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as SessionEntry);
  }

  /** 当前分支 = 从 head（默认最后一条记录）回溯 parentId 到根，再反转 */
  branch(headId?: string): SessionEntry[] {
    const entries = this.loadAll();
    if (entries.length === 0) return [];
    const byId = new Map(entries.map((e) => [e.id, e]));
    let cursor = headId ? byId.get(headId) : entries.at(-1);
    if (!cursor) throw new Error(`记录不存在: ${headId}`);
    const path: SessionEntry[] = [];
    while (cursor) {
      path.push(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return path.reverse();
  }
}
