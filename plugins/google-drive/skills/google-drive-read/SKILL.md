---
name: google-drive-read
description: "許可フォルダ配下の Google Drive ファイルを読み取り専用で取得する。テキストは内容を返し、PDF・画像・Office・その他のバイナリは利用可能な既存 capability がある場合だけ内容まで確認する。保存できても読めない形式は、形式・内容未確認・保存先を明示する。Triggers on: /google-drive-read, 'DriveのURLを読んで', 'Driveのファイルの内容', 'このDriveファイルを読んで'"
user-invocable: true
arguments: "<fileId または Drive URL> [--format md|txt|csv|pdf] [--out dir] [--force]"
allowed-tools:
  - Bash
  - Read
  - Skill
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

- Google Docs は Markdown、Slides はテキストで stdout に出る
- Google Sheets は現在 CSV として先頭シートのみ stdout に出る。2枚目以降のシートや全シートの取得は未対応なので、ユーザーが求めた場合は現状の制限として伝える
- PDF・画像などのバイナリは既定でカレントディレクトリ配下の `drive-read/` に保存され、同名ファイルが既にある場合だけファイル名末尾に fileId が付く
- ファイルが保存されたことと内容を確認できたことを別の状態として扱う。実際に内容を取得できた場合だけ、内容に基づく要約や回答を返す
- 「許可フォルダ配下ではありません」と拒否された場合、そのファイルは参照対象外。回避を試みない
- 「許可フォルダが設定されていません」の場合は、SETUP.md の `config.json` 作成または `allowedFolderIds` 更新をユーザーに案内する

## 保存したバイナリの内容確認

保存結果がバイナリの場合、ファイル名や metadata だけから内容を推測しない。
利用中の session にすでに公開され、その形式を扱える tool / skill だけを使う。

- PDF は PDF 対応の `Read` tool または PDF tool / skill を使う。10ページを超える場合は、一度に20ページ以下の範囲へ分けて必要なページを確認する
- 画像は画像対応の `Read` / image tool が利用できる場合だけ確認する
- Word、Excel、PowerPoint は、それぞれ document、spreadsheet、presentation を扱う tool / skill が利用できる場合だけ、その公開手順に従う
- 音声、動画、archive、その他の形式も、その形式への対応が明示された capability がある場合だけ確認する
- 汎用的な名前の tool が、すべてのバイナリ形式を読めるとは仮定しない

バイナリ読取 capability を補うために、次の操作は行わない。

- `brew`、`pip`、`uv`、`npm` 等による dependency の install
- parser / renderer / converter script や virtual environment の作成
- plugin cache や runtime 内部 path の探索・hardcode

ファイルをダウンロードできたが、その形式を読む capability がない場合は、次の形式で案内する。

```text
ファイルをダウンロードしましたが、この形式の内容を読み取る手段がないため、
内容は確認していません。
形式: <MIME type>
保存先: <absolute path>
ローカルの対応アプリで確認してください。
```

対応 capability はあるが暗号化、破損、未対応機能、page / size limit 等で失敗した場合は、
ダウンロード済みか、形式、内容未確認、具体的な理由、絶対保存先を伝える。
別の parser / converter の導入や臨時 script の作成には進まない。

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
