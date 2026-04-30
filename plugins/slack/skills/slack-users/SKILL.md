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
