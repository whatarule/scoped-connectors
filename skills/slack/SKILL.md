---
name: slack
description: "Slack からメッセージを取得するスキル。/slack channels, /slack history, /slack thread, /slack search のサブコマンドで操作。Triggers on: /slack, 'slackのメッセージ', 'slackを確認', 'チャンネル一覧'"
user-invocable: true
arguments: "[サブコマンド] [引数]"
allowed-tools:
  - Bash
  - Read
  - Agent
---

# Slack スキル

Slack API を使ってメッセージの取得・検索を行うスキルです。

## サブコマンド一覧

| サブコマンド | 説明 | 例 |
|---|---|---|
| `channels` | チャンネル一覧を取得 | `/slack channels` |
| `history` | チャンネルのメッセージ履歴を取得 | `/slack history #general` |
| `thread` | スレッドのメッセージを取得 | `/slack thread #general 1234567890.123456` |
| `search` | メッセージを検索 | `/slack search キーワード` |

## 共通処理

### 1. SLACK_TOKEN の確認

まず環境変数 `$SLACK_TOKEN` が設定されているか確認してください。
未設定の場合は以下の手順をユーザーに表示して処理を終了してください:

```
SLACK_TOKEN が設定されていません。以下の手順で設定してください:

1. https://api.slack.com/apps からアプリを作成またはアクセス
2. OAuth & Permissions で User Token を取得
3. 環境変数に設定: export SLACK_TOKEN=xoxp-xxxx
```

### 2. API 呼び出し

すべての Slack API 呼び出しは以下の形式で行ってください:

```bash
curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/ENDPOINT?PARAMS"
```

### 3. スクリプト呼び出し

API レスポンスは node スクリプトにパイプして整形します。
**この SKILL.md があるディレクトリを基準に** スクリプトを呼び出してください。

スキルディレクトリの特定方法:
- この SKILL.md のパスから dirname を取得し、そのディレクトリ内の `scripts/` 配下のスクリプトを使用します
- 例: この SKILL.md が `/path/to/skills/slack/SKILL.md` にある場合、スクリプトは `/path/to/skills/slack/scripts/channels.js` です

```bash
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>" && curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/..." | node "$SKILL_DIR/scripts/channels.js"
```

## channels サブコマンド

チャンネル一覧を取得して表示します。ページネーション対応で全件取得し、キャッシュも更新します。

### 手順

スクリプトを実行する（パスはこの SKILL.md があるディレクトリからの絶対パスをリテラルで書くこと。変数展開は使わない）:

```bash
node /path/to/skills/slack/scripts/channels.js
```

## users サブコマンド

ユーザー一覧とユーザーグループ一覧を取得してキャッシュを更新します。メッセージの投稿者名・メンション表示に必要です。

### 手順

スクリプトを実行する:

```bash
node /path/to/skills/slack/scripts/users.js
```

ユーザーとユーザーグループのキャッシュを同時に更新します。

## history サブコマンド

指定チャンネルのメッセージ履歴を取得して表示します（デフォルト20件）。
チャンネル名でもIDでも指定可能。キャッシュ未取得時は自動取得します。

### 手順

スクリプトを実行する:

```bash
node /path/to/skills/slack/scripts/history.js <channel> [limit]
```

例: `node /path/to/skills/slack/scripts/history.js general 20`

### 出力の注意

結果をユーザーに表示する際、以下の情報を**必ず含めて**ください。省略しないでください。

- **ts（タイムスタンプ）**: スレッド取得（`/slack thread`）で使う識別子
- **メッセージ件数**（`[N件のメッセージ]`）: スレッドの規模を把握するための情報

## thread サブコマンド

スレッドの返信メッセージを取得して表示します。

### 引数の指定方法

2つの方法でスレッドを指定できます:

1. **チャンネル + ts**: `node /path/to/scripts/thread.js general 1234567890.123456`
2. **Slack メッセージURL**: `node /path/to/scripts/thread.js https://workspace.slack.com/archives/C01ABC/p1234567890123456`

### 手順

スクリプトを実行する:

```bash
node /path/to/skills/slack/scripts/thread.js <channel> <ts>
node /path/to/skills/slack/scripts/thread.js <slack URL>
```

### 出力の注意

結果をユーザーに表示する際、**ts（タイムスタンプ）を必ず含めて**ください。省略しないでください。

## search サブコマンド

メッセージをキーワード検索します。

### 手順

スクリプトを実行する:

```bash
node /path/to/skills/slack/scripts/search.js <keyword> [count]
```

例: `node /path/to/skills/slack/scripts/search.js deploy 50`

### 出力の注意

結果をユーザーに表示する際、以下の情報を**必ず含めて**ください。省略しないでください。

- **ts（タイムスタンプ）**: スレッド取得（`/slack thread`）で使う識別子
- **チャンネル名**: どのチャンネルのメッセージかを示す情報
