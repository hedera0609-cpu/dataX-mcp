/**
 * ローカル用データベース
 * AWSのDynamoDBの代わりに ~/.datax/apps.json にアプリ状態を保存する
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DATAX_DIR = path.join(os.homedir(), ".datax");
const DB_PATH = path.join(DATAX_DIR, "apps.json");

// =====================================
// 型定義（AWS版と共通）
// =====================================

export type AppStatus = "deploying" | "active" | "failed" | "deleted";
export type Runtime = "python" | "java" | "nodejs" | "static" | "custom";

export interface AppRecord {
  nickname: string;
  appName: string;
  status: AppStatus;
  serviceUrl?: string;
  localPort?: number;
  createdAt: string;
  updatedAt: string;
  description: string;
  runtime: Runtime;
  deployLogs?: string;
}

// =====================================
// DB読み書きのユーティリティ
// =====================================

function readDb(): AppRecord[] {
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as AppRecord[];
  } catch {
    return [];
  }
}

function writeDb(records: AppRecord[]): void {
  fs.mkdirSync(DATAX_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2), "utf-8");
}

// =====================================
// CRUD 操作
// =====================================

export function getApp(nickname: string, appName: string): AppRecord | null {
  const records = readDb();
  return (
    records.find(
      (r) => r.nickname === nickname && r.appName === appName
    ) ?? null
  );
}

export function putApp(record: AppRecord): void {
  const records = readDb();
  const index = records.findIndex(
    (r) => r.nickname === record.nickname && r.appName === record.appName
  );
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  writeDb(records);
}

export function listApps(nickname: string): AppRecord[] {
  return readDb().filter(
    (r) => r.nickname === nickname && r.status !== "deleted"
  );
}

export function updateAppStatus(
  nickname: string,
  appName: string,
  status: AppStatus,
  serviceUrl?: string,
  deployLogs?: string,
  extra?: Partial<AppRecord>
): void {
  const records = readDb();
  const index = records.findIndex(
    (r) => r.nickname === nickname && r.appName === appName
  );
  if (index < 0) return;

  records[index] = {
    ...records[index],
    status,
    updatedAt: new Date().toISOString(),
    ...(serviceUrl !== undefined && { serviceUrl }),
    // ログは最新1000文字のみ保持する
    ...(deployLogs !== undefined && { deployLogs: deployLogs.slice(-1000) }),
    ...(extra ?? {}),
  };
  writeDb(records);
}

export function softDeleteApp(nickname: string, appName: string): void {
  updateAppStatus(nickname, appName, "deleted");
}

/** 使用中のポート一覧を返す（ポート割り当て時の重複チェック用） */
export function getUsedPorts(): number[] {
  return readDb()
    .filter((r) => r.status === "active" && r.localPort)
    .map((r) => r.localPort as number);
}
