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
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>"
curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/..." | node "$SKILL_DIR/scripts/channels.js"
```

## channels サブコマンド

チャンネル一覧を取得して表示します。

### 手順

1. conversations.list API を呼び出す:

```bash
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>"
cursor=""
first=true

while true; do
  if [ -z "$cursor" ]; then
    response=$(curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
      "https://slack.com/api/conversations.list?types=public_channel&limit=1000")
  else
    response=$(curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
      "https://slack.com/api/conversations.list?types=public_channel&limit=1000&cursor=$cursor")
  fi

  if [ "$first" = true ]; then
    echo "$response" | node "$SKILL_DIR/scripts/channels.js"
    first=false
  else
    echo "$response" | node "$SKILL_DIR/scripts/channels.js" --append
  fi

  cursor=$(echo "$response" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const c=j.response_metadata&&j.response_metadata.next_cursor;
      if(c)process.stdout.write(c);
    });
  ")

  if [ -z "$cursor" ]; then
    break
  fi
done
```

2. `scripts/channels.js` がレスポンスをパースし、チャンネル一覧を表示します
3. 同時にキャッシュファイル（`.cache/channels.json`）を更新します

## history サブコマンド

（未実装）

## thread サブコマンド

（未実装）

## search サブコマンド

（未実装）
