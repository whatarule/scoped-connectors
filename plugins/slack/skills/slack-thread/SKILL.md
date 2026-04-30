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

1. **チャンネル + ts**: `node /a/b/scripts/thread.js general 1234567890.123456`
2. **Slack メッセージURL**: `node /a/b/scripts/thread.js https://workspace.slack.com/archives/C01ABC/p1234567890123456`

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/slack-thread/SKILL.md` なら、スクリプトは `/a/b/scripts/thread.js`。

```bash
node /a/b/scripts/thread.js <channel> <ts>
node /a/b/scripts/thread.js <slack URL>
```

## 出力の注意

結果をユーザーに表示する際、**ts（タイムスタンプ）を必ず含めて**ください。省略しないでください。
