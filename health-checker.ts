/**
 * TCP Health Checker Discord Bot for Deno
 *
 * 環境変数:
 *   DISCORD_TOKEN    - Discord Bot Token
 *   TARGET_HOST      - 監視対象のIPアドレスまたはホスト名
 *   TARGET_PORT      - 監視対象のポート番号
 *   NOTIFY_USER_ID   - 状態変化時に通知するユーザーID
 *   CHECK_INTERVAL   - チェック間隔（秒）デフォルト: 60
 *   TIMEOUT          - 接続タイムアウト（ミリ秒）デフォルト: 5000
 *
 * 実行:
 *   deno run --allow-net --allow-env health-checker.ts
 */

import {
  createBot,
  startBot,
  ActivityTypes,
  Intents,
  GatewayOpcodes,
} from "https://deno.land/x/discordeno@18.0.1/mod.ts";

// 設定
const config = {
  token: Deno.env.get("DISCORD_TOKEN") ?? "",
  targetHost: Deno.env.get("TARGET_HOST") ?? "",
  targetPort: parseInt(Deno.env.get("TARGET_PORT") ?? "0"),
  notifyUserId: Deno.env.get("NOTIFY_USER_ID") ?? "",
  checkInterval: parseInt(Deno.env.get("CHECK_INTERVAL") ?? "60") * 1000,
  timeout: parseInt(Deno.env.get("TIMEOUT") ?? "5000"),
};

// 設定検証
function validateConfig(): void {
  const errors: string[] = [];
  if (!config.token) errors.push("DISCORD_TOKEN が設定されていません");
  if (!config.targetHost) errors.push("TARGET_HOST が設定されていません");
  if (!config.targetPort || isNaN(config.targetPort))
    errors.push("TARGET_PORT が正しく設定されていません");
  if (!config.notifyUserId) errors.push("NOTIFY_USER_ID が設定されていません");

  if (errors.length > 0) {
    console.error("設定エラー:");
    errors.forEach((e) => console.error(`  - ${e}`));
    Deno.exit(1);
  }
}

// 状態管理
let previousStatus: boolean | null = null;

// TCP接続チェック
async function checkTcpConnection(): Promise<boolean> {
  try {
    const conn = await Promise.race([
      Deno.connect({
        hostname: config.targetHost,
        port: config.targetPort,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), config.timeout)
      ),
    ]);
    conn.close();
    return true;
  } catch {
    return false;
  }
}

// Activityを更新
function updateActivity(bot: ReturnType<typeof createBot>, isActive: boolean): void {
  const status = isActive ? "Active" : "Inactive";
  const emoji = isActive ? "🟢" : "🔴";

  const presenceData = {
    since: null,
    activities: [
      {
        name: `${emoji} Server - ${status}`,
        type: ActivityTypes.Watching,
      },
    ],
    status: isActive ? "online" : "dnd",
    afk: false,
  };

  // 全シャードにプレゼンス更新を送信
  bot.gateway.manager.shards.forEach((shard) => {
    shard.send({
      op: GatewayOpcodes.PresenceUpdate,
      d: presenceData,
    });
  });
}

// DM送信
async function sendDmNotification(
  bot: ReturnType<typeof createBot>,
  isActive: boolean
): Promise<void> {
  try {
    const userId = BigInt(config.notifyUserId);
    const dmChannel = await bot.helpers.getDmChannel(userId);

    const emoji = isActive ? "🟢" : "🔴";
    const status = isActive ? "Active" : "Inactive";
    const timestamp = new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });

    await bot.helpers.sendMessage(dmChannel.id, {
      embeds: [
        {
          title: `${emoji} ステータス変更`,
          description: `**${config.targetHost}:${config.targetPort}**`,
          fields: [
            { name: "状態", value: status, inline: true },
            { name: "検出時刻", value: timestamp, inline: true },
          ],
          color: isActive ? 0x00ff00 : 0xff0000,
        },
      ],
    });
    console.log(`[${timestamp}] DM通知送信: ${status}`);
  } catch (error) {
    console.error("DM送信エラー:", error);
  }
}

// ヘルスチェック実行
async function performHealthCheck(bot: ReturnType<typeof createBot>): Promise<void> {
  const isActive = await checkTcpConnection();
  const timestamp = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  console.log(
    `[${timestamp}] ${config.targetHost}:${config.targetPort} - ${isActive ? "Active" : "Inactive"}`
  );

  // Activity更新
  updateActivity(bot, isActive);

  // 状態変化時にDM通知
  if (previousStatus !== null && previousStatus !== isActive) {
    await sendDmNotification(bot, isActive);
  }

  previousStatus = isActive;
}

// メイン
async function main(): Promise<void> {
  validateConfig();

  console.log("Health Checker Bot を起動中...");
  console.log(`監視対象: ${config.targetHost}:${config.targetPort}`);
  console.log(`チェック間隔: ${config.checkInterval / 1000}秒`);

  const bot = createBot({
    token: config.token,
    intents: Intents.Guilds,
    events: {
      ready: (_bot, payload) => {
        console.log(`ログイン成功: ${payload.user.username}`);

        // 初回チェック実行
        performHealthCheck(bot);

        // 定期チェック開始
        setInterval(() => performHealthCheck(bot), config.checkInterval);
      },
    },
  });

  await startBot(bot);
}

main();
