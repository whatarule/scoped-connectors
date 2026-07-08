---
name: slack-thread
description: "Slack スレッドのメッセージを取得。Triggers on: /slack-thread, 'スレッド', 'スレッドを見せて'"
user-invocable: true
arguments: "<channel> <timestamp> or <URL>"
allowed-tools:
  - Bash
---

# slack-thread

スレッドの返信メッセージを取得して表示します。

## 引数の指定方法

2つの方法でスレッドを指定できます:

1. **チャンネル + timestamp**: `node /a/b/scripts/thread.js general 1234567890.123456`
2. **Slack メッセージURL**: `node /a/b/scripts/thread.js https://workspace.slack.com/archives/C01ABC/p1234567890123456`

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/slack-thread/SKILL.md` なら、スクリプトは `/a/b/scripts/thread.js`。

```bash
node /a/b/scripts/thread.js <channel> <timestamp>
node /a/b/scripts/thread.js <slack URL>
```

## sandbox 外での実行

このスクリプトは macOS Keychain から Slack token record を読み取ります。
Claude Code / Codex の sandbox 内では OS secure store の読み取りに失敗するため、必ず最初から sandbox 外で実行してください。

### Claude Code の場合

Bash tool では `dangerouslyDisableSandbox: true` を指定し、理由として「Slack token を OS secure store から読み取るため」と説明してください。
settings の `sandbox.excludedCommands` にこのスクリプトが登録されている環境では、通常の実行で sandbox 外になります（SETUP.md 参照）。

### Codex の場合

Codex の `exec_command` では `sandbox_permissions: "require_escalated"` を指定し、`justification` には「Slack token を OS secure store から読み取るため」と書いてください。
可能なら `prefix_rule` に `["node", "/a/b/scripts/thread.js"]` を指定してください。`/a/b/scripts/thread.js` は実際に実行するフルパスに置き換えてください。

## 出力の注意

## 出力の注意

各メッセージの日時、タイムスタンプ（括弧なしで `1234567890.123456` の形式）、ユーザー名は**必ず含めて**ください。
メッセージ本文は要約して構いません。
