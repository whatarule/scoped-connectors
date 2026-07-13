---
name: google-drive-auth
description: "Google Drive OAuth token の取得・状態確認・削除を扱う。Triggers on: /google-drive-auth, /google-drive-auth login, /google-drive-auth status, /google-drive-auth clear, 'Driveにログイン', 'Drive認証状態を確認', 'Driveの保存トークンを削除'"
user-invocable: true
allowed-tools:
  - Bash
---

# google-drive-auth

Google OAuth PKCE で読み取り専用 token を取得し、OS secure store の保存状態確認と削除も行います。

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/google-drive-auth/SKILL.md` なら、スクリプトは `/a/b/scripts/google-drive-auth.js`。

引数なしは login として扱います。

```bash
node /a/b/scripts/google-drive-auth.js
```

ログインを明示する場合:

```bash
node /a/b/scripts/google-drive-auth.js login
```

状態確認:

```bash
node /a/b/scripts/google-drive-auth.js status
```

保存済み token record の削除:

```bash
node /a/b/scripts/google-drive-auth.js clear
```

`clear` は Google 側の token revoke ではなく、OS secure store の保存 token record だけを削除します。
Google 側で無効化するには https://myaccount.google.com/permissions からアクセス権を削除するよう案内してください。

## sandbox 外での実行

このスクリプトは macOS Keychain または Windows Credential Manager に token record を保存・読み取り・削除します。
Claude Code / Codex の sandbox 内では OS secure store 操作に失敗するため、必ず最初から sandbox 外で実行してください。

### Claude Code の場合

Bash tool では `dangerouslyDisableSandbox: true` を指定し、理由として「Google Drive token を OS secure store で管理するため」と説明してください。
settings の `sandbox.excludedCommands` にこのスクリプトが登録されている環境では、通常の実行で sandbox 外になります（SETUP.md 参照）。

### Codex の場合

Codex の `exec_command` では `sandbox_permissions: "require_escalated"` を指定し、`justification` には「Google Drive token を OS secure store で管理するため」と書いてください。
可能なら `prefix_rule` に `["node", "/a/b/scripts/google-drive-auth.js"]` を指定してください。`/a/b/scripts/google-drive-auth.js` は実際に実行するフルパスに置き換えてください。

既定では同梱の共有 client_id（compass-e.com の内部アプリ）を使う。login 前に SETUP.md の「設定ファイルの作成」が完了している前提です。
client secret は login 時にユーザーが対話入力する（値は社内の秘密情報共有先から取得。ファイル・環境変数・CLI 引数には置かない）。
入力待ちには TTY が必要なため、エージェントの Bash からの login は「TTY のあるターミナルで実行してください」エラーになる。
その場合は、この SKILL.md の位置から解決した**実際のフルパス**でコマンドを組み立て、ユーザーがそのままコピーして自分のターミナルで実行できる形で提示する。例:

```
以下をターミナルで実行してください:
node /a/b/scripts/google-drive-auth.js login
```

（`/a/b` は実際のインストールパスに置き換える。相対パスや `plugins/...` 始まりのパスは利用者の環境では動かないので使わない）
別 client を使う場合は config の `clientId`、`GOOGLE_DRIVE_CLIENT_ID`、または `--client-id` で指定する。
token 保存前に `about.get` のメールドメインを allowedDomains（既定: compass-e.com）と照合し、一致しない token は保存しない。
allowedDomains は `~/.config/drive-api/config.json` または `GOOGLE_DRIVE_ALLOWED_DOMAINS` で上書きできる。
token record は macOS Keychain または Windows Credential Manager に保存します。file store と token 用環境変数は使いません。
Windows native と WSL では同じ Windows Credential Manager target `scoped-connectors/google-drive/default` を使います。

## 注意

token 値は出力しないでください。
`status` は保存済み token record を確認したうえで `about.get` を呼び、token 値を表示せず、user、email、scope、有効期限だけを表示します。
認可に失敗した場合は、SETUP.md の通常ユーザー手順を確認し、OAuth client / scope / Google Cloud 側の管理が必要なら ADMIN_SETUP.md を参照するよう案内してください。
