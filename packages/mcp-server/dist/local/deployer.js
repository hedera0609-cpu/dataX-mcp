"use strict";
/**
 * ローカル用デプロイモジュール
 * AWSのECS/ECR/ALBの代わりにローカルのDockerでアプリを実行する
 * アプリはポート 18100〜18199 でlocalhost上に公開される
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextAvailablePort = getNextAvailablePort;
exports.buildAndRunContainer = buildAndRunContainer;
exports.getContainerStatus = getContainerStatus;
exports.stopAndRemoveContainer = stopAndRemoveContainer;
exports.getContainerLogs = getContainerLogs;
const child_process_1 = require("child_process");
const db_js_1 = require("./db.js");
// ローカルアプリに割り当てるポートの範囲
const PORT_RANGE_START = 18100;
const PORT_RANGE_END = 18199;
// =====================================
// ユーティリティ
// =====================================
/** アプリのコンテナ名を生成する */
function getContainerName(nickname, appName) {
    return `datax-${nickname}-${appName}`;
}
/** ローカルイメージ名を生成する */
function getImageName(nickname, appName) {
    return `datax-local/${nickname}/${appName}:latest`;
}
/**
 * 次に使用可能なポートを返す
 * 使用中のポートを避けて割り当てる
 */
function getNextAvailablePort() {
    const usedPorts = new Set((0, db_js_1.getUsedPorts)());
    // DBに記録されているポートだけでなく、実際にDockerで使用中のポートも確認する
    try {
        const output = (0, child_process_1.execSync)('docker ps --format "{{.Ports}}"', { encoding: "utf-8", stdio: "pipe" });
        // "0.0.0.0:18101->8080/tcp" のような形式からポートを抽出する
        for (const match of output.matchAll(/:(\d+)->/g)) {
            usedPorts.add(Number(match[1]));
        }
    }
    catch {
        // Docker が起動していない場合は無視する
    }
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
        if (!usedPorts.has(port))
            return port;
    }
    throw new Error(`使用可能なポートがありません（範囲: ${PORT_RANGE_START}〜${PORT_RANGE_END}）`);
}
// =====================================
// デプロイ操作
// =====================================
/**
 * ソースディレクトリからDockerイメージをビルドしてコンテナを起動する
 * @returns 割り当てたポート番号
 */
async function buildAndRunContainer(nickname, appName, sourceDir) {
    const imageName = getImageName(nickname, appName);
    const containerName = getContainerName(nickname, appName);
    const port = getNextAvailablePort();
    // 既存コンテナが残っている場合は先に削除する
    try {
        (0, child_process_1.execSync)(`docker rm -f ${containerName}`, { stdio: "pipe" });
    }
    catch {
        // コンテナが存在しない場合は無視する
    }
    // Dockerイメージをビルドする（5分タイムアウト）
    (0, child_process_1.execSync)(`docker build -t ${imageName} ${sourceDir}`, {
        stdio: "pipe",
        timeout: 300_000,
    });
    // コンテナをバックグラウンドで起動する
    (0, child_process_1.execSync)(`docker run -d ` +
        `--name ${containerName} ` +
        `-p ${port}:8080 ` +
        `-e PORT=8080 ` +
        `-e DATAX_NICKNAME=${nickname} ` +
        `-e DATAX_APP_NAME=${appName} ` +
        `--restart unless-stopped ` +
        `${imageName}`, { stdio: "pipe" });
    return port;
}
/**
 * コンテナのステータスを取得する
 */
function getContainerStatus(nickname, appName) {
    const containerName = getContainerName(nickname, appName);
    try {
        const output = (0, child_process_1.execSync)(`docker inspect --format "{{.State.Status}}|{{.Id}}|{{.State.StartedAt}}" ${containerName}`, { encoding: "utf-8", stdio: "pipe" }).trim();
        const [state, id, startedAt] = output.split("|");
        return {
            status: state === "running" ? "active" : "stopped",
            containerId: id.slice(0, 12),
            uptime: startedAt,
        };
    }
    catch {
        return { status: "not_found" };
    }
}
/**
 * コンテナを停止・削除する
 */
function stopAndRemoveContainer(nickname, appName) {
    const containerName = getContainerName(nickname, appName);
    const imageName = getImageName(nickname, appName);
    try {
        (0, child_process_1.execSync)(`docker stop ${containerName}`, { stdio: "pipe" });
        (0, child_process_1.execSync)(`docker rm ${containerName}`, { stdio: "pipe" });
    }
    catch {
        // コンテナが存在しない場合は無視する
    }
    // ローカルイメージも削除する
    try {
        (0, child_process_1.execSync)(`docker rmi ${imageName}`, { stdio: "pipe" });
    }
    catch {
        // イメージが存在しない場合は無視する
    }
}
/**
 * コンテナのログを取得する（直近50行）
 */
function getContainerLogs(nickname, appName) {
    const containerName = getContainerName(nickname, appName);
    try {
        return (0, child_process_1.execSync)(`docker logs --tail 50 ${containerName}`, { encoding: "utf-8", stdio: "pipe" });
    }
    catch {
        return "（ログを取得できませんでした）";
    }
}
//# sourceMappingURL=deployer.js.map