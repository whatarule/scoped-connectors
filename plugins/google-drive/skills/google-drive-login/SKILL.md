---
name: google-drive-login
description: "Google Drive API 用に読み取り専用 OAuth token を取得。Triggers on: /google-drive-login, 'Driveにログイン', 'Google Drive OAuth'"
user-invocable: true
arguments: "[--client-secret path] [--token-path path]"
allowed-tools:
  - Bash
---

# google-drive-login

Google Drive API 用に読み取り専用 scope だけで OAuth 認証します。
gcloud ADC は `cloud-platform` scope を要求するため、このスキルでは使いません。

要求する scope:

- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/drive.activity.readonly`
- `https://www.googleapis.com/auth/drive.labels.readonly`

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/google-drive-login/SKILL.md` なら、スクリプトは `/a/b/scripts/oauth-login.js`。

```bash
node /a/b/scripts/oauth-login.js --client-secret ~/.config/drive-api/client_secret.json
```

出力された URL をブラウザで開き、Google Drive の読み取り専用権限を許可してください。
token はデフォルトで `~/.config/drive-api/token.json` に保存されます。

token や client secret の中身は出力しないでください。
