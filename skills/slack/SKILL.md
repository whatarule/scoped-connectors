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

チャンネル一覧を取得して表示します。

### 手順

1. conversations.list API を呼び出す:

```bash
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>"
tmpfile=$(mktemp)
cursor=""
first=true

while true; do
  if [ -z "$cursor" ]; then
    curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
      "https://slack.com/api/conversations.list?types=public_channel&limit=1000" > "$tmpfile"
  else
    encoded_cursor=$(node -e "console.log(encodeURIComponent('$cursor'))")
    curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
      "https://slack.com/api/conversations.list?types=public_channel&limit=1000&cursor=$encoded_cursor" > "$tmpfile"
  fi

  if [ "$first" = true ]; then
    node "$SKILL_DIR/scripts/channels.js" < "$tmpfile"
    first=false
  else
    node "$SKILL_DIR/scripts/channels.js" --append < "$tmpfile"
  fi

  cursor=$(node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const c=j.response_metadata&&j.response_metadata.next_cursor;
      if(c)process.stdout.write(c);
    });
  " < "$tmpfile")

  if [ -z "$cursor" ]; then
    break
  fi
done
rm -f "$tmpfile"
```

2. `scripts/channels.js` がレスポンスをパースし、チャンネル一覧を表示します
3. 同時にキャッシュファイル（`.cache/channels.json`）を更新します

## users サブコマンド

ユーザー一覧を取得してキャッシュを更新します。メッセージの投稿者名を表示するために必要です。

### 手順

1. users.list API を呼び出す（ページネーション対応、channels と同様）:

```bash
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>" && tmpfile=$(mktemp) && cursor="" && first=true && while true; do if [ -z "$cursor" ]; then curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/users.list?limit=1000" > "$tmpfile"; else encoded_cursor=$(node -e "console.log(encodeURIComponent('$cursor'))") && curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/users.list?limit=1000&cursor=$encoded_cursor" > "$tmpfile"; fi; if [ "$first" = true ]; then node "$SKILL_DIR/scripts/users.js" < "$tmpfile"; first=false; else node "$SKILL_DIR/scripts/users.js" --append < "$tmpfile"; fi; cursor=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const c=j.response_metadata&&j.response_metadata.next_cursor;if(c)process.stdout.write(c);});" < "$tmpfile"); if [ -z "$cursor" ]; then break; fi; done && rm -f "$tmpfile"
```

2. `scripts/users.js` がレスポンスをパースし、ユーザー一覧を表示します
3. 同時にキャッシュファイル（`.cache/users.json`）を更新します

### キャッシュの自動取得

history / thread / search の出力でユーザーIDやグループIDが名前に変換されない場合（キャッシュ未取得時）、ユーザーに「ユーザー・グループキャッシュを取得しますか？」と確認し、許可されたら users サブコマンドの手順を実行してください。

ユーザーグループのキャッシュも同時に取得します:

```bash
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>" && curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/usergroups.list" | node -e "const fs=require('fs'),path=require('path');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);if(!j.ok){process.stderr.write('Slack API エラー: '+j.error+'\n');process.exit(1);}const m={};(j.usergroups||[]).forEach(g=>{m[g.id]=g.handle||g.name;});const p=path.join('$SKILL_DIR','.cache','usergroups.json');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n');console.log(Object.keys(m).length+'件のユーザーグループをキャッシュしました');})"
```

## history サブコマンド

指定チャンネルのメッセージ履歴を取得して表示します（デフォルト20件）。

### 手順

1. 引数からチャンネル名または ID を取得する
2. キャッシュの確認（API 呼び出しの前に行うこと）:
   - `$SKILL_DIR/.cache/channels.json` が存在しない場合、チャンネルキャッシュを取得するか確認
   - `$SKILL_DIR/.cache/users.json` が存在しない場合、ユーザー・グループキャッシュを取得するか確認
   - 許可されたら channels サブコマンドと users サブコマンドの手順を実行
3. チャンネル名の解決:
   - `C` で始まる場合はそのまま ID として使用
   - それ以外はキャッシュからチャンネル名→IDを特定
4. conversations.history API を呼び出す:

```bash
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>" && curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/conversations.history?channel=CHANNEL_ID&limit=20" | node "$SKILL_DIR/scripts/history.js"
```

### 出力の注意

結果をユーザーに表示する際、以下の情報を**必ず含めて**ください。省略しないでください。

- **ts（タイムスタンプ）**: スレッド取得（`/slack thread`）で使う識別子
- **メッセージ件数**（`[N件のメッセージ]`）: スレッドの規模を把握するための情報

## thread サブコマンド

スレッドの返信メッセージを取得して表示します。

### 引数の指定方法

2つの方法でスレッドを指定できます:

1. **チャンネル + ts**: `/slack thread #general 1234567890.123456`
2. **Slack メッセージURL**: `/slack thread https://workspace.slack.com/archives/C01ABC/p1234567890123456`

### 手順

1. 引数を確認:
   - `http` で始まる場合は Slack URL として扱い、URL から channelId と ts を抽出:
     - `/archives/CHANNEL_ID/pTIMESTAMP` の形式からパース
     - `p` の後の数字を先頭10桁 + `.` + 残りに変換して ts とする
   - それ以外はチャンネル名/ID + ts の2引数として扱う
2. キャッシュの確認（history と同様、API 呼び出しの前にチャンネル・ユーザー・グループキャッシュの存在を確認し、なければ取得するか確認）
3. チャンネル名の場合はキャッシュでID変換
4. conversations.replies API を呼び出す:

```bash
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>" && curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/conversations.replies?channel=CHANNEL_ID&ts=THREAD_TS" | node "$SKILL_DIR/scripts/thread.js"
```

### 出力の注意

結果をユーザーに表示する際、**ts（タイムスタンプ）を必ず含めて**ください。省略しないでください。

## search サブコマンド

メッセージをキーワード検索します。

### 手順

1. 引数から検索キーワードを取得する
2. キャッシュの確認（history と同様、API 呼び出しの前にユーザー・グループキャッシュの存在を確認し、なければ取得するか確認）
3. search.messages API を呼び出す（キーワードは URL エンコードする）:

```bash
SKILL_DIR="<この SKILL.md があるディレクトリの絶対パス>" && ENCODED_QUERY=$(node -e "console.log(encodeURIComponent('KEYWORD'))") && curl -s -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/search.messages?query=$ENCODED_QUERY" | node "$SKILL_DIR/scripts/search.js"
```

### 出力の注意

結果をユーザーに表示する際、以下の情報を**必ず含めて**ください。省略しないでください。

- **ts（タイムスタンプ）**: スレッド取得（`/slack thread`）で使う識別子
- **チャンネル名**: どのチャンネルのメッセージかを示す情報
