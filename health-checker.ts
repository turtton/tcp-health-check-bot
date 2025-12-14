/**
 * TCP Health Checker Discord Bot for Deno
 *
 * 環境変数:
 *   DISCORD_TOKEN         - Discord Bot Token
 *   TARGET_HOST           - 監視対象のIPアドレスまたはホスト名
 *   TARGET_PORT           - 監視対象のポート番号
 *   NOTIFY_USER_ID        - 状態変化時に通知するユーザーID
 *   CHECK_INTERVAL        - チェック間隔（秒）デフォルト: 60
 *   TIMEOUT               - 接続タイムアウト（ミリ秒）デフォルト: 5000
 *   AZURE_SUBSCRIPTION_ID - AzureサブスクリプションID
 *   AZURE_RESOURCE_GROUP  - AzureリソースグループName
 *   AZURE_VM_NAME         - Azure仮想マシン名
 *   AZURE_TENANT_ID       - AzureテナントID
 *   AZURE_CLIENT_ID       - AzureクライアントID（サービスプリンシパル）
 *   AZURE_CLIENT_SECRET   - Azureクライアントシークレット
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
  InteractionTypes,
  ApplicationCommandTypes,
} from "https://deno.land/x/discordeno@18.0.1/mod.ts";

// 設定
const config = {
  token: Deno.env.get("DISCORD_TOKEN") ?? "",
  targetHost: Deno.env.get("TARGET_HOST") ?? "",
  targetPort: parseInt(Deno.env.get("TARGET_PORT") ?? "0"),
  notifyUserId: Deno.env.get("NOTIFY_USER_ID") ?? "",
  checkInterval: parseInt(Deno.env.get("CHECK_INTERVAL") ?? "60") * 1000,
  timeout: parseInt(Deno.env.get("TIMEOUT") ?? "5000"),
  azure: {
    subscriptionId: Deno.env.get("AZURE_SUBSCRIPTION_ID") ?? "",
    resourceGroup: Deno.env.get("AZURE_RESOURCE_GROUP") ?? "",
    vmName: Deno.env.get("AZURE_VM_NAME") ?? "",
    tenantId: Deno.env.get("AZURE_TENANT_ID") ?? "",
    clientId: Deno.env.get("AZURE_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("AZURE_CLIENT_SECRET") ?? "",
  },
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

// Azureアクセストークン取得
async function getAzureAccessToken(): Promise<string> {
  const tokenEndpoint = `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: config.azure.clientId,
    client_secret: config.azure.clientSecret,
    scope: "https://management.azure.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Azure access token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Azure VM起動
async function startAzureVM(): Promise<{ success: boolean; message: string }> {
  try {
    // Azure設定のバリデーション
    if (!config.azure.subscriptionId || !config.azure.resourceGroup || !config.azure.vmName ||
        !config.azure.tenantId || !config.azure.clientId || !config.azure.clientSecret) {
      return {
        success: false,
        message: "Azure設定が不完全です。環境変数を確認してください。",
      };
    }

    // アクセストークンを取得
    const accessToken = await getAzureAccessToken();

    // VM起動API呼び出し
    const vmStartUrl = `https://management.azure.com/subscriptions/${config.azure.subscriptionId}/resourceGroups/${config.azure.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${config.azure.vmName}/start?api-version=2023-03-01`;

    const response = await fetch(vmStartUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 202 || response.status === 200) {
      return {
        success: true,
        message: `Azure VM **${config.azure.vmName}** の起動を開始しました。`,
      };
    } else if (response.status === 204) {
      return {
        success: true,
        message: `Azure VM **${config.azure.vmName}** は既に起動しています。`,
      };
    } else {
      const errorText = await response.text();
      return {
        success: false,
        message: `VM起動に失敗しました: ${response.status} - ${errorText}`,
      };
    }
  } catch (error) {
    console.error("Azure VM起動エラー:", error);
    return {
      success: false,
      message: `エラーが発生しました: ${error.message}`,
    };
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
      ready: async (_bot, payload) => {
        console.log(`ログイン成功: ${payload.user.username}`);

        // スラッシュコマンドを登録
        try {
          await bot.helpers.upsertGlobalApplicationCommands([
            {
              name: "startvm",
              description: "Azure仮想マシンを起動します",
              type: ApplicationCommandTypes.ChatInput,
            },
          ]);
          console.log("スラッシュコマンド登録完了");
        } catch (error) {
          console.error("スラッシュコマンド登録エラー:", error);
        }

        // 初回チェック実行
        performHealthCheck(bot);

        // 定期チェック開始
        setInterval(() => performHealthCheck(bot), config.checkInterval);
      },
      interactionCreate: async (_bot, interaction) => {
        // スラッシュコマンドの処理
        if (interaction.type === InteractionTypes.ApplicationCommand) {
          if (interaction.data?.name === "startvm") {
            // 処理中を表示
            await bot.helpers.sendInteractionResponse(
              interaction.id,
              interaction.token,
              {
                type: 5, // DeferredChannelMessageWithSource
              }
            );

            // Azure VM起動
            const result = await startAzureVM();
            const timestamp = new Date().toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
            });

            // 結果を返信
            await bot.helpers.editOriginalInteractionResponse(
              interaction.token,
              {
                embeds: [
                  {
                    title: result.success ? "✅ VM起動" : "❌ エラー",
                    description: result.message,
                    fields: [
                      {
                        name: "実行時刻",
                        value: timestamp,
                        inline: true,
                      },
                    ],
                    color: result.success ? 0x00ff00 : 0xff0000,
                  },
                ],
              }
            );

            console.log(
              `[${timestamp}] /startvm コマンド実行: ${result.success ? "成功" : "失敗"}`
            );
          }
        }
      },
    },
  });

  await startBot(bot);
}

main();
