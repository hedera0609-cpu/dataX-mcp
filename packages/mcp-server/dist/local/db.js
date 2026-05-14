"use strict";
/**
 * ローカル用データベース
 * AWSのDynamoDBの代わりに ~/.datax/apps.json にアプリ状態を保存する
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApp = getApp;
exports.putApp = putApp;
exports.listApps = listApps;
exports.updateAppStatus = updateAppStatus;
exports.softDeleteApp = softDeleteApp;
exports.getUsedPorts = getUsedPorts;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const DATAX_DIR = path.join(os.homedir(), ".datax");
const DB_PATH = path.join(DATAX_DIR, "apps.json");
// =====================================
// DB読み書きのユーティリティ
// =====================================
function readDb() {
    if (!fs.existsSync(DB_PATH))
        return [];
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    }
    catch {
        return [];
    }
}
function writeDb(records) {
    fs.mkdirSync(DATAX_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2), "utf-8");
}
// =====================================
// CRUD 操作
// =====================================
function getApp(nickname, appName) {
    const records = readDb();
    return (records.find((r) => r.nickname === nickname && r.appName === appName) ?? null);
}
function putApp(record) {
    const records = readDb();
    const index = records.findIndex((r) => r.nickname === record.nickname && r.appName === record.appName);
    if (index >= 0) {
        records[index] = record;
    }
    else {
        records.push(record);
    }
    writeDb(records);
}
function listApps(nickname) {
    return readDb().filter((r) => r.nickname === nickname && r.status !== "deleted");
}
function updateAppStatus(nickname, appName, status, serviceUrl, deployLogs, extra) {
    const records = readDb();
    const index = records.findIndex((r) => r.nickname === nickname && r.appName === appName);
    if (index < 0)
        return;
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
function softDeleteApp(nickname, appName) {
    updateAppStatus(nickname, appName, "deleted");
}
/** 使用中のポート一覧を返す（ポート割り当て時の重複チェック用） */
function getUsedPorts() {
    return readDb()
        .filter((r) => r.status === "active" && r.localPort)
        .map((r) => r.localPort);
}
//# sourceMappingURL=db.js.map