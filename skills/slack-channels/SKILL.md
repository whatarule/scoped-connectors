---
name: slack-channels
description: "Slack のパブリックチャンネル一覧を取得してキャッシュ更新。Triggers on: /slack-channels, 'チャンネル一覧', 'slackのチャンネル'"
user-invocable: true
allowed-tools:
  - Bash
---

# slack-channels

パブリックチャンネル一覧を取得して表示します。ページネーション対応で全件取得し、キャッシュも更新します。

## 手順

この SKILL.md があるディレクトリの1つ上の `scripts/channels.js` をフルパスリテラルで実行する。変数展開は使わない。

```bash
node /path/to/skills/scripts/channels.js
```
