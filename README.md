# TCP Health Checker Discord Bot

特定のIP:ポートへのTCP接続を定期的にチェックし、状態変化時にDMで通知するDiscord Bot。

## 機能

- TCP接続によるヘルスチェック
- 定期実行（デフォルト60秒間隔）
- Active ↔ Inactive の状態変化時にDM通知
- BotのActivityに現在の状態を表示

## 必要条件

- [Deno](https://deno.land/) v1.30以上

## セットアップ

### 1. Discord Botの作成

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成
2. Bot を追加し、Token を取得
3. OAuth2 > URL Generator で `bot` スコープを選択
4. Bot Permissions で以下を選択:
   - Send Messages（DM送信用）
5. 生成されたURLでサーバーに招待

### 2. 環境変数の設定

```bash
export DISCORD_TOKEN="your_bot_token"
export TARGET_HOST="192.168.1.1"
export TARGET_PORT="8080"
export NOTIFY_USER_ID="your_discord_user_id"
export CHECK_INTERVAL="60"      # オプション（秒、デフォルト: 60）
export TIMEOUT="5000"           # オプション（ミリ秒、デフォルト: 5000）
```

### 3. 実行

```bash
deno run --allow-net --allow-env health-checker.ts
```

## 環境変数一覧

| 変数名 | 必須 | 説明 | デフォルト |
|--------|------|------|------------|
| `DISCORD_TOKEN` | ✅ | Discord Bot Token | - |
| `TARGET_HOST` | ✅ | 監視対象のIPまたはホスト名 | - |
| `TARGET_PORT` | ✅ | 監視対象のポート番号 | - |
| `NOTIFY_USER_ID` | ✅ | 通知先のDiscordユーザーID | - |
| `CHECK_INTERVAL` | ❌ | チェック間隔（秒） | 60 |
| `TIMEOUT` | ❌ | 接続タイムアウト（ミリ秒） | 5000 |

## 動作

1. 起動時に初回チェックを実行
2. 設定間隔で定期的にTCP接続を試行
3. 接続成功 → Active、失敗 → Inactive
4. 状態が変化した時のみDMで通知
5. BotのActivityに常に現在の状態を表示
   - 🟢 Active: オンライン状態
   - 🔴 Inactive: 取り込み中状態
