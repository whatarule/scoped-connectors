---
name: slack-search
description: "Slack のパブリックチャンネル投稿を Real-time Search API で検索。Triggers on: /slack-search, 'メッセージ検索', 'slack検索', 'slackで検索'"
user-invocable: true
arguments: "<keyword> [count] [期間]"
allowed-tools:
  - Bash
---

# slack-search

パブリックチャンネルの投稿をキーワード検索して表示します。

このプラグインの検索は `search:read.public` scope の Real-time Search API で実装しています。
Slack の `search.messages` は認可ユーザーが閲覧できるプライベートチャンネルの結果を返す可能性があるため、`search:read` は付与しません。

検索 request では `channel_types: ["public_channel"]` と `content_types: ["messages"]` を固定します。

Real-time Search API が利用できない場合は fallback せず、検索を実行しません。

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/slack-search/SKILL.md` なら、スクリプトは `/a/b/scripts/search.js`。

```bash
node /a/b/scripts/search.js <keyword...> [count] [--after YYYY-MM-DD] [--before YYYY-MM-DD]
```

例: `node /a/b/scripts/search.js aipo 10`

## sandbox 外での実行

このスクリプトは macOS Keychain から Slack token record を読み取ります。
Claude Code / Codex の sandbox 内では OS secure store の読み取りに失敗するため、必ず最初から sandbox 外で実行してください。

### Claude Code の場合

Bash tool では `dangerouslyDisableSandbox: true` を指定し、理由として「Slack token を OS secure store から読み取るため」と説明してください。
settings の `sandbox.excludedCommands` にこのスクリプトが登録されている環境では、通常の実行で sandbox 外になります（SETUP.md 参照）。

### Codex の場合

Codex の `exec_command` では `sandbox_permissions: "require_escalated"` を指定し、`justification` には「Slack token を OS secure store から読み取るため」と書いてください。
可能なら `prefix_rule` に `["node", "/a/b/scripts/search.js"]` を指定してください。`/a/b/scripts/search.js` は実際に実行するフルパスに置き換えてください。

## 検索条件

semantic search は無効化し、キーワード検索として実行します。
件数指定がなければデフォルト3件、最大100件です。1回の API 呼び出しは最大20件のため、20件を超える場合は最大5ページまで取得します。

ユーザーが期間を指定した場合（「先週」「4/1から4/15まで」「直近3日」等）、
日付を YYYY-MM-DD 形式に変換して --after / --before オプションに設定してください。

例:
- 「先週」→ --after 2026-04-14 --before 2026-04-20
- 「4/1から4/15」→ --after 2026-04-01 --before 2026-04-15
- 「直近3日」→ --after 2026-04-21（--before は省略＝現在まで）

## 出力の注意

各結果の以下の情報は**必ず含めて**ください。省略しないでください。
- 日時
- チャンネル名
- タイムスタンプまたは permalink
- ユーザー名
- メッセージ本文

private channel、DM、MPIM の投稿は検索対象に含めないでください。
