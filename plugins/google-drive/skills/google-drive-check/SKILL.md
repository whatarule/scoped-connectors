---
name: google-drive-check
description: "Google Drive API の接続確認。Triggers on: /google-drive-check, 'Google Drive API接続確認', 'Driveにつながるか確認'"
user-invocable: true
allowed-tools:
  - Bash
---

# google-drive-check

Google Drive API に接続できるか確認します。

このスキルは読み取り専用の接続確認だけを行います。通常は Drive files / Activity / Labels の読み取り専用 scope を持つ access token で `about.get` を呼び出します。
access token は出力しないでください。

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/google-drive-check/SKILL.md` なら、スクリプトは `/a/b/scripts/check-connection.js`。

```bash
node /a/b/scripts/check-connection.js
```

## 認証

優先順は次の通りです。

1. `GOOGLE_DRIVE_ACCESS_TOKEN`
2. `~/.config/drive-api/token.json`

未認証または scope 不足の場合は、`google-drive-login` で読み取り専用 scope の token を取得してください。
