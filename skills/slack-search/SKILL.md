---
name: slack-search
description: "Slack メッセージをキーワード検索。Triggers on: /slack-search, 'メッセージ検索', 'slack検索', 'slackで検索'"
user-invocable: true
arguments: "<keyword> [count]"
allowed-tools:
  - Bash
---

# slack-search

メッセージをキーワード検索します。

## 手順

この SKILL.md があるディレクトリの1つ上の `scripts/search.js` をフルパスリテラルで実行する。変数展開は使わない。

```bash
node /path/to/skills/scripts/search.js <keyword> [count]
```

例: `node /path/to/skills/scripts/search.js deploy 50`

## 出力の注意

結果をユーザーに表示する際、以下の情報を**必ず含めて**ください。省略しないでください。

- **ts（タイムスタンプ）**: スレッド取得（`/slack-thread`）で使う識別子
- **チャンネル名**: どのチャンネルのメッセージかを示す情報
