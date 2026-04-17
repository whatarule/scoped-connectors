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

この SKILL.md があるディレクトリの1つ上の `scripts/users.js` をフルパスリテラルで実行する。変数展開は使わない。

```bash
node /path/to/skills/scripts/users.js
```
