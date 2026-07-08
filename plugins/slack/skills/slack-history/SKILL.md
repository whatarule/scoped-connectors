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

## sandbox 外での実行

このスクリプトは macOS Keychain から Slack token record を読み取ります。
Claude Code / Codex の sandbox 内では OS secure store の読み取りに失敗するため、必ず最初から sandbox 外で実行してください。

### Claude Code の場合

Bash tool では `dangerouslyDisableSandbox: true` を指定し、理由として「Slack token を OS secure store から読み取るため」と説明してください。
settings の `sandbox.excludedCommands` にこのスクリプトが登録されている環境では、通常の実行で sandbox 外になります（SETUP.md 参照）。

### Codex の場合

Codex の `exec_command` では `sandbox_permissions: "require_escalated"` を指定し、`justification` には「Slack token を OS secure store から読み取るため」と書いてください。
可能なら `prefix_rule` に `["node", "/a/b/scripts/history.js"]` を指定してください。`/a/b/scripts/history.js` は実際に実行するフルパスに置き換えてください。

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

## 出力の注意

各メッセージの以下の情報は**必ず含めて**ください。省略しないでください。
- 日時
- タイムスタンプ（括弧なしで `1234567890.123456` の形式）
- ユーザー名
- メッセージ件数 `[N件のメッセージ]`

メッセージ本文は要約して構いません。

結果の末尾に「必要ならタイムスタンプを指定して特定の投稿のスレッドも開けます。」と案内してください。
