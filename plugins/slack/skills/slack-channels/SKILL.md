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

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/slack-channels/SKILL.md` なら、スクリプトは `/a/b/scripts/channels.js`。

```bash
node /a/b/scripts/channels.js
```
