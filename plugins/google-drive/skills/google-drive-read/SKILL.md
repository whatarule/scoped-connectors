---
name: google-drive-read
description: "Google Drive のファイル内容を読む。Triggers on: /google-drive-read, 'DriveのURLを読んで', 'Driveのファイルの内容', 'このDriveファイルを読んで'"
user-invocable: true
arguments: "<fileId または Drive URL> [--format md|txt|csv|pdf] [--out dir] [--force]"
allowed-tools:
  - Bash
  - Read
---

# google-drive-read

Google Drive のファイル内容を読み取り専用で取得します。
許可フォルダ（`~/.config/drive-api/config.json` の `allowedFolderIds`）配下のファイルだけが対象です。配下でないファイルは拒否されます。

access token は出力しないでください。

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/google-drive-read/SKILL.md` なら、スクリプトは `/a/b/scripts/read.js`。

ユーザーから Drive の URL を渡された場合は、そのまま引数に渡す（ID の抽出はスクリプトが行う）。

```bash
node /a/b/scripts/read.js "https://docs.google.com/document/d/xxxx/edit"
node /a/b/scripts/read.js <fileId>
```

## 出力の扱い

- Google Docs は Markdown、Sheets は CSV（先頭シートのみ）、Slides はテキストで stdout に出る
- PDF・画像などのバイナリは既定でカレントディレクトリ配下の `drive-read/<fileId>/` に保存され、保存パスが表示される。**そのパスを Read ツールで読むこと**
- PDF の視覚確認などで保存済みファイルから PNG などの派生ファイルを作る場合は、実ファイル保存先を変えず、派生ファイルだけ `.codex/tmp/` 配下に置く。確認後、ユーザーが保持を求めていなければその派生ファイルは `trash` で削除する
- 「許可フォルダ配下ではありません」と拒否された場合、そのファイルは参照対象外。回避を試みない
- 「許可フォルダが設定されていません」の場合は、SETUP.md の `config.json` 作成または `allowedFolderIds` 更新をユーザーに案内する

## 認証

token は OS secure store（macOS Keychain または Windows Credential Manager、target `scoped-connectors/google-drive/default`）から読み取ります。file store と token 用環境変数は使いません。
未認証または scope 不足の場合は、`google-drive-auth` で読み取り専用 scope の token を取得してください。

## sandbox 外での実行

このスクリプトは macOS Keychain または Windows Credential Manager から token record を読み取ります（期限切れ時は refresh して上書き保存します）。
Claude Code / Codex の sandbox 内では OS secure store 操作に失敗するため、必ず最初から sandbox 外で実行してください。

### Claude Code の場合

Bash tool では `dangerouslyDisableSandbox: true` を指定し、理由として「Google Drive token を OS secure store で管理するため」と説明してください。
settings の `sandbox.excludedCommands` にこのスクリプトが登録されている環境では、通常の実行で sandbox 外になります（SETUP.md 参照）。

### Codex の場合

Codex の `exec_command` では `sandbox_permissions: "require_escalated"` を指定し、`justification` には「Google Drive token を OS secure store で管理するため」と書いてください。
可能なら `prefix_rule` に `["node", "/a/b/scripts/read.js"]` を指定してください。`/a/b/scripts/read.js` は実際に実行するフルパスに置き換えてください。
