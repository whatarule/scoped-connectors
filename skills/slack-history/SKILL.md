---
name: slack-history
description: "Slack チャンネルのメッセージ履歴を取得。Triggers on: /slack-history, 'slackのメッセージ', 'slackの履歴', 'チャンネルの会話', '投稿を確認', 'slackを確認'"
user-invocable: true
arguments: "<channel> [limit]"
allowed-tools:
  - Bash
  - Agent
---

# slack-history

指定チャンネルのメッセージ履歴を取得して表示します。チャンネル名でもIDでも指定可能。キャッシュ未取得時は自動取得します。

## 手順

この SKILL.md があるディレクトリの1つ上の `scripts/history.js` をフルパスリテラルで実行する。変数展開は使わない。

```bash
node /path/to/skills/scripts/history.js <channel> [limit]
```

例: `node /path/to/skills/scripts/history.js general 20`

## 出力の注意

結果をユーザーに表示する際、以下の情報を**必ず含めて**ください。省略しないでください。

- **ts（タイムスタンプ）**: スレッド取得（`/slack-thread`）で使う識別子
- **メッセージ件数**（`[N件のメッセージ]`）: スレッドの規模を把握するための情報
