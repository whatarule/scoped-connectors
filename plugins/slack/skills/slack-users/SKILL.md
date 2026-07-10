---
name: slack-users
description: "Slack のユーザー・グループ一覧を取得してキャッシュ更新。Triggers on: /slack-users, 'ユーザー一覧', 'ユーザーキャッシュ'"
user-invocable: true
allowed-tools:
  - Bash
---

# slack-users

ユーザー一覧とユーザーグループ一覧を取得してキャッシュを更新します。メッセージの投稿者名・メンション表示に必要です。

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/slack-users/SKILL.md` なら、スクリプトは `/a/b/scripts/users.js`。

```bash
node /a/b/scripts/users.js
```

## sandbox 外での実行

このスクリプトは macOS Keychain または Windows Credential Manager から Slack token record を読み取ります。
Claude Code / Codex の sandbox 内では OS secure store の読み取りに失敗するため、必ず最初から sandbox 外で実行してください。

### Claude Code の場合

Bash tool では `dangerouslyDisableSandbox: true` を指定し、理由として「Slack token を OS secure store から読み取るため」と説明してください。
settings の `sandbox.excludedCommands` にこのスクリプトが登録されている環境では、通常の実行で sandbox 外になります（SETUP.md 参照）。

### Codex の場合

Codex の `exec_command` では `sandbox_permissions: "require_escalated"` を指定し、`justification` には「Slack token を OS secure store から読み取るため」と書いてください。
可能なら `prefix_rule` に `["node", "/a/b/scripts/users.js"]` を指定してください。`/a/b/scripts/users.js` は実際に実行するフルパスに置き換えてください。
