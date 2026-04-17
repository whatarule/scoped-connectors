---
name: slack-thread
description: "Slack スレッドのメッセージを取得。Triggers on: /slack-thread, 'スレッド', 'スレッドを見せて'"
user-invocable: true
arguments: "<channel> <ts> or <URL>"
allowed-tools:
  - Bash
---

# slack-thread

スレッドの返信メッセージを取得して表示します。

## 引数の指定方法

2つの方法でスレッドを指定できます:

1. **チャンネル + ts**: `node scripts/thread.js general 1234567890.123456`
2. **Slack メッセージURL**: `node scripts/thread.js https://workspace.slack.com/archives/C01ABC/p1234567890123456`

## 手順

この SKILL.md があるディレクトリの1つ上の `scripts/thread.js` をフルパスリテラルで実行する。変数展開は使わない。

```bash
node /path/to/skills/scripts/thread.js <channel> <ts>
node /path/to/skills/scripts/thread.js <slack URL>
```

## 出力の注意

結果をユーザーに表示する際、**ts（タイムスタンプ）を必ず含めて**ください。省略しないでください。
