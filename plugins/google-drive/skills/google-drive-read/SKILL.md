---
name: google-drive-read
description: "Google Drive のファイル内容を読む。Triggers on: /google-drive-read, 'DriveのURLを読んで', 'Driveのファイルの内容', 'このDriveファイルを読んで'"
user-invocable: true
arguments: "<fileId または Drive URL> [--format md|txt|csv|pdf]"
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
- PDF・画像などのバイナリは一時ファイルに保存され、保存パスが表示される。**そのパスを Read ツールで読むこと**
- 「許可フォルダ配下ではありません」と拒否された場合、そのファイルは参照対象外。回避を試みない
- 「許可フォルダが設定されていません」の場合は、SETUP.md の許可フォルダ設定をユーザーに案内する

## 認証

優先順は次の通りです。

1. `GOOGLE_DRIVE_ACCESS_TOKEN`
2. `~/.config/drive-api/token.json`

未認証または scope 不足の場合は、`google-drive-login` で読み取り専用 scope の token を取得してください。
