# Google Drive プラグイン

Google Drive のファイルを読み取り専用で参照するプラグインです。

読み取り専用権限を使い、ファイルの作成・更新・削除は行いません。
参照できるのは**許可したフォルダの配下のみ**です（設定ファイルでフォルダ ID を指定）。

**[セットアップ手順](SETUP.md)**

セットアップでは `~/.config/drive-api/config.json` を作成し、読み取りを許可する `allowedFolderIds` を設定してから認証します。client secret は login 時の対話入力で受け取ります（ファイルには置きません）。
Google Cloud 側の管理は [管理者向けセットアップ](ADMIN_SETUP.md) を参照してください。

## 使い方

### Claude Code

| コマンド | 説明 |
|---|---|
| `/google-drive-auth` または `/google-drive-auth login` | Drive / Activity / Labels の読み取り専用権限で OAuth token を取得し OS secure store に保存 |
| `/google-drive-auth status` | 保存済み token の状態確認（about.get の live check 込み。token 値は表示しない） |
| `/google-drive-auth clear` | OS secure store から保存済み token record を削除 |
| `/google-drive-read <URL または fileId>` | 許可フォルダ配下のファイル内容を読む |

自然言語でも利用できます。

```
Drive認証状態を確認して
このDriveのファイルを読んで https://docs.google.com/document/d/xxxx/edit
```

Google Docs は Markdown、Sheets は CSV（先頭シートのみ）、Slides はテキストで取得します。
PDF・画像などはカレントディレクトリ配下の `drive-read/<fileId>/` に保存され、エージェントがそのファイルを読みます。

### Codex

`$google-drive` でプラグインを呼び出し、自然言語で指示します。

```
$google-drive Driveにつながるか確認して
```

## 参考: 認証

このプラグインは共有の Google OAuth client_id を使い、client secret は login 時の対話入力で受け取って OS secure store にのみ保存します。
token record は macOS Keychain または Windows Credential Manager に保存します。
Windows native と WSL では同じ Windows Credential Manager target `scoped-connectors/google-drive/default` を使います。
file store と token 用環境変数は使いません。

Google Cloud 側の管理は [管理者向けセットアップ](ADMIN_SETUP.md) に分けています。
