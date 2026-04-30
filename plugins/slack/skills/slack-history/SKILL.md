---
name: slack-history
description: "Slack チャンネルのメッセージ履歴を取得。Triggers on: /slack-history, 'slackのメッセージ', 'slackの履歴', 'チャンネルの会話', '投稿を確認', 'slackを確認'"
user-invocable: true
arguments: "<channel> [limit] [期間]"
allowed-tools:
  - Bash
  - Agent
---

# slack-history

指定チャンネルのメッセージ履歴を取得して表示します。チャンネル名でもIDでも指定可能。キャッシュ未取得時は自動取得します。

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/slack-history/SKILL.md` なら、スクリプトは `/a/b/scripts/history.js`。

```bash
node /a/b/scripts/history.js <channel> [limit] [--after YYYY-MM-DD] [--before YYYY-MM-DD]
```

例: `node /a/b/scripts/history.js general 20`

## 期間指定

ユーザーが期間を指定した場合（「先週」「4/1から4/15まで」「直近3日」等）、
日付を YYYY-MM-DD 形式に変換して --after / --before オプションに設定してください。

例:
- 「先週」→ --after 2026-04-14 --before 2026-04-20
- 「4/1から4/15」→ --after 2026-04-01 --before 2026-04-15
- 「直近3日」→ --after 2026-04-21（--before は省略＝現在まで）

例: `node /a/b/scripts/history.js general 50 --after 2026-04-01 --before 2026-04-15`

## 件数指定

ユーザーが数字のみの引数を指定した場合、取得件数として扱い limit に設定してください。
指定がなければデフォルト20件。API の上限は1000件。

例: `node /a/b/scripts/history.js general 50`

## 出力の注意

結果をユーザーに表示する際、以下の情報を**必ず含めて**ください。省略しないでください。

- **ts（タイムスタンプ）**: スレッド取得（`/slack-thread`）で使う識別子
- **メッセージ件数**（`[N件のメッセージ]`）: スレッドの規模を把握するための情報
