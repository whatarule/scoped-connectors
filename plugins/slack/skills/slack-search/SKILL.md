---
name: slack-search
description: "Slack メッセージをキーワード検索。Triggers on: /slack-search, 'メッセージ検索', 'slack検索', 'slackで検索'"
user-invocable: true
arguments: "<keyword> [count] [期間]"
allowed-tools:
  - Bash
---

# slack-search

メッセージをキーワード検索します。

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/slack-search/SKILL.md` なら、スクリプトは `/a/b/scripts/search.js`。

```bash
node /a/b/scripts/search.js <keyword> [count] [--after YYYY-MM-DD] [--before YYYY-MM-DD]
```

例: `node /a/b/scripts/search.js deploy 50`

## 期間指定

ユーザーが期間を指定した場合（「今月」「先週」「4/1以降」等）、
日付を YYYY-MM-DD 形式に変換して --after / --before オプションに設定してください。

例:
- 「今月」→ --after 2026-04-01 --before 2026-04-30
- 「先週」→ --after 2026-04-14 --before 2026-04-20
- 「4/1以降」→ --after 2026-04-01

例: `node /a/b/scripts/search.js deploy 50 --after 2026-04-01 --before 2026-04-30`

## 件数指定

ユーザーが数字のみの引数を指定した場合、取得件数として扱い count に設定してください。
指定がなければデフォルト20件。API の上限は100件。

## 出力の注意

結果をユーザーに表示する際、以下の情報を**必ず含めて**ください。省略しないでください。

- **ts（タイムスタンプ）**: スレッドの取得に使う識別子
- **チャンネル名**: どのチャンネルのメッセージかを示す情報
