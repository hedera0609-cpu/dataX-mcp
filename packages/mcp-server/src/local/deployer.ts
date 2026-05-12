/**
 * ローカル用デプロイモジュール
 * AWSのECS/ECR/ALBの代わりにローカルのDockerでアプリを実行する
 * アプリはポート 18100〜18199 でlocalhost上に公開される
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getUsedPorts } from "./db.js";

// ローカルアプリに割り当てるポートの範囲
const PORT_RANGE_START = 18100;
const PORT_RANGE_END = 18199;

// =====================================
// ユーティリティ
// =====================================

/** アプリのコンテナ名を生成する */
function getContainerName(nickname: string, appName: string): string {
  return `datax-${nickname}-${appName}`;
}

/** ローカルイメージ名を生成する */
function getImageName(nickname: string, appName: string): string {
  return `datax-local/${nickname}/${appName}:latest`;
}

/**
 * 次に使用可能なポートを返す
 * 使用中のポートを避けて割り当てる
 */
export function getNextAvailablePort(): number {
  const usedPorts = new Set(getUsedPorts());

  // DBに記録されているポートだけでなく、実際にDockerで使用中のポートも確認する
  try {
    const output = execSync(
      'docker ps --format "{{.Ports}}"',
      { encoding: "utf-8", stdio: "pipe" }
    );
    // "0.0.0.0:18101->8080/tcp" のような形式からポートを抽出する
    for (const match of output.matchAll(/:(\d+)->/g)) {
      usedPorts.add(Number(match[1]));
    }
  } catch {
    // Docker が起動していない場合は無視する
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) return port;
  }

  throw new Error(
    `使用可能なポートがありません（範囲: ${PORT_RANGE_START}〜${PORT_RANGE_END}）`
  );
}

// =====================================
// デプロイ操作
// =====================================

/**
 * ソースディレクトリからDockerイメージをビルドしてコンテナを起動する
 * @returns 割り当てたポート番号
 */
export async function buildAndRunContainer(
  nickname: string,
  appName: string,
  sourceDir: string
): Promise<number> {
  const imageName = getImageName(nickname, appName);
  const containerName = getContainerName(nickname, appName);
  const port = getNextAvailablePort();

  // 既存コンテナが残っている場合は先に削除する
  try {
    execSync(`docker rm -f ${containerName}`, { stdio: "pipe" });
  } catch {
    // コンテナが存在しない場合は無視する
  }

  // Dockerイメージをビルドする（5分タイムアウト）
  execSync(`docker build -t ${imageName} ${sourceDir}`, {
    stdio: "pipe",
    timeout: 300_000,
  });

  // コンテナをバックグラウンドで起動する
  execSync(
    `docker run -d ` +
    `--name ${containerName} ` +
    `-p ${port}:8080 ` +
    `-e PORT=8080 ` +
    `-e DATAX_NICKNAME=${nickname} ` +
    `-e DATAX_APP_NAME=${appName} ` +
    `--restart unless-stopped ` +
    `${imageName}`,
    { stdio: "pipe" }
  );

  return port;
}

/**
 * コンテナのステータスを取得する
 */
export function getContainerStatus(
  nickname: string,
  appName: string
): {
  status: "active" | "stopped" | "not_found";
  containerId?: string;
  uptime?: string;
} {
  const containerName = getContainerName(nickname, appName);

  try {
    const output = execSync(
      `docker inspect --format "{{.State.Status}}|{{.Id}}|{{.State.StartedAt}}" ${containerName}`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim();

    const [state, id, startedAt] = output.split("|");

    return {
      status: state === "running" ? "active" : "stopped",
      containerId: id.slice(0, 12),
      uptime: startedAt,
    };
  } catch {
    return { status: "not_found" };
  }
}

/**
 * コンテナを停止・削除する
 */
export function stopAndRemoveContainer(
  nickname: string,
  appName: string
): void {
  const containerName = getContainerName(nickname, appName);
  const imageName = getImageName(nickname, appName);

  try {
    execSync(`docker stop ${containerName}`, { stdio: "pipe" });
    execSync(`docker rm ${containerName}`, { stdio: "pipe" });
  } catch {
    // コンテナが存在しない場合は無視する
  }

  // ローカルイメージも削除する
  try {
    execSync(`docker rmi ${imageName}`, { stdio: "pipe" });
  } catch {
    // イメージが存在しない場合は無視する
  }
}

/**
 * コンテナのログを取得する（直近50行）
 */
export function getContainerLogs(
  nickname: string,
  appName: string
): string {
  const containerName = getContainerName(nickname, appName);

  try {
    return execSync(
      `docker logs --tail 50 ${containerName}`,
      { encoding: "utf-8", stdio: "pipe" }
    );
  } catch {
    return "（ログを取得できませんでした）";
  }
}
