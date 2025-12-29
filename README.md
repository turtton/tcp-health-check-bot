# TCP Health Checker Discord Bot

特定のIP:ポートへのTCP接続を定期的にチェックし、状態変化時にDMで通知するDiscord Bot。

## 機能

- TCP接続によるヘルスチェック
- 定期実行（デフォルト60秒間隔）
- Active ↔ Inactive の状態変化時にDM通知
- BotのActivityに現在の状態を表示
- **Azure仮想マシンの起動コマンド** (`/startvm`)
- **Dockerコンテナの再起動コマンド** (`/restartcontainer`)

## 必要条件

- [Deno](https://deno.land/) v1.30以上

## セットアップ

### 1. Discord Botの作成

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成
2. Bot を追加し、Token を取得
3. OAuth2 > URL Generator で以下のスコープを選択:
   - `bot`
   - `applications.commands`（スラッシュコマンド用）
4. Bot Permissions で以下を選択:
   - Send Messages（DM送信用）
   - Use Slash Commands（スラッシュコマンド実行用）
5. 生成されたURLでサーバーに招待

### 2. 環境変数の設定

```bash
# 基本設定
export DISCORD_TOKEN="your_bot_token"
export TARGET_HOST="192.168.1.1"
export TARGET_PORT="8080"
export NOTIFY_USER_ID="your_discord_user_id"
export CHECK_INTERVAL="60"      # オプション（秒、デフォルト: 60）
export TIMEOUT="5000"           # オプション（ミリ秒、デフォルト: 5000）

# Azure VM起動機能（オプション）
export AZURE_SUBSCRIPTION_ID="your_subscription_id"
export AZURE_RESOURCE_GROUP="your_resource_group"
export AZURE_VM_NAME="your_vm_name"
export AZURE_TENANT_ID="your_tenant_id"
export AZURE_CLIENT_ID="your_client_id"
export AZURE_CLIENT_SECRET="your_client_secret"

# Dockerコンテナ再起動機能（オプション）
export DOCKER_CONTAINER_NAME="your_container_name"
```

### 3. 実行

```bash
deno run --allow-net --allow-env --allow-run health-checker.ts
```

## 環境変数一覧

### 基本設定

| 変数名 | 必須 | 説明 | デフォルト |
|--------|------|------|------------|
| `DISCORD_TOKEN` | ✅ | Discord Bot Token | - |
| `TARGET_HOST` | ✅ | 監視対象のIPまたはホスト名 | - |
| `TARGET_PORT` | ✅ | 監視対象のポート番号 | - |
| `NOTIFY_USER_ID` | ✅ | 通知先のDiscordユーザーID | - |
| `CHECK_INTERVAL` | ❌ | チェック間隔（秒） | 60 |
| `TIMEOUT` | ❌ | 接続タイムアウト（ミリ秒） | 5000 |

### Azure VM起動機能（オプション）

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `AZURE_SUBSCRIPTION_ID` | ❌ | AzureサブスクリプションID |
| `AZURE_RESOURCE_GROUP` | ❌ | Azureリソースグループ名 |
| `AZURE_VM_NAME` | ❌ | Azure仮想マシン名 |
| `AZURE_TENANT_ID` | ❌ | AzureテナントID |
| `AZURE_CLIENT_ID` | ❌ | サービスプリンシパルのクライアントID |
| `AZURE_CLIENT_SECRET` | ❌ | サービスプリンシパルのクライアントシークレット |

**注**: Azure VM起動機能を使用する場合は、上記のすべてのAzure関連環境変数が必要です。

### Dockerコンテナ再起動機能（オプション）

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `DOCKER_CONTAINER_NAME` | ❌ | 再起動対象のDockerコンテナ名 |

## 動作

### ヘルスチェック機能

1. 起動時に初回チェックを実行
2. 設定間隔で定期的にTCP接続を試行
3. 接続成功 → Active、失敗 → Inactive
4. 状態が変化した時のみDMで通知
5. BotのActivityに常に現在の状態を表示
   - 🟢 Active: オンライン状態
   - 🔴 Inactive: 取り込み中状態

### Azure VM起動コマンド

Discord上で `/startvm` コマンドを実行すると、設定されたAzure仮想マシンを起動します。

**使い方:**
1. Discordのチャンネルまたは DM で `/startvm` と入力
2. Bot が Azure API を使用してVMを起動
3. 結果（成功/失敗）が埋め込みメッセージで返される

**必要な設定:**
- Azure サービスプリンシパルの作成
- VM への起動権限の付与
- すべてのAzure関連環境変数の設定

**Azure サービスプリンシパルの作成方法:**
```bash
# サービスプリンシパルを作成
az ad sp create-for-rbac --name "discord-bot-vm-starter" --role "Virtual Machine Contributor" --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group}

# 出力から以下の値を環境変数に設定
# - appId → AZURE_CLIENT_ID
# - password → AZURE_CLIENT_SECRET
# - tenant → AZURE_TENANT_ID
```

### Dockerコンテナ再起動コマンド

Discord上で `/restartcontainer` コマンドを実行すると、設定されたDockerコンテナを再起動します。

**使い方:**
1. Discordのチャンネルまたは DM で `/restartcontainer` と入力
2. Bot がローカルの `docker restart` コマンドを実行
3. 結果（成功/失敗）が埋め込みメッセージで返される

**必要な設定:**
- `DOCKER_CONTAINER_NAME` 環境変数の設定
- Botを実行するユーザーがDockerコマンドを実行できる権限を持っていること
