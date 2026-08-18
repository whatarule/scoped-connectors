# Google Drive プラグイン

Google Drive のファイルを読み取り専用で参照するプラグインです。

読み取り専用権限を使い、ファイルの作成・更新・削除は行いません。
参照できるのは**許可したフォルダの配下のみ**です（設定ファイルでフォルダ ID を指定）。
複数の Google Workspace アカウントは profile ごとに OAuth client、許可フォルダ、OS secure store の token を分離して同時利用できます。

**[セットアップ手順](SETUP.md)**

セットアップでは `~/.config/drive-api/config.json` を作成し、読み取りを許可する `allowedFolderIds` を設定してから認証します。client secret は login 時の対話入力で受け取ります（ファイルには置きません）。
Google Cloud 側の管理は [管理者向けセットアップ](ADMIN_SETUP.md) を参照してください。

## 使い方

### Claude Code

| コマンド | 説明 |
|---|---|
| `/google-drive-auth login [--profile name]` | Drive / Activity / Labels の読み取り専用権限で OAuth token を profile 専用の OS secure store に保存 |
| `/google-drive-auth status [--profile name]` | profile の token 状態確認（about.get の live check 込み。token 値は表示しない） |
| `/google-drive-auth clear [--profile name]` | profile の token record を削除 |
| `/google-drive-read <URL または fileId> [--profile name]` | profile の許可フォルダ配下にあるファイル内容を読む |

自然言語でも利用できます。

```
Drive認証状態を確認して
SasaeL profile の Drive 認証状態を確認して
このDriveのファイルを読んで https://docs.google.com/document/d/xxxx/edit
```

Google Docs は Markdown、Slides はテキストで取得します。
Google Sheets は現在 CSV として**先頭シートのみ**取得します。2枚目以降のシートや全シートの取得は未対応です。
PDF・画像・Officeなどのバイナリはカレントディレクトリ配下の `drive-read/` に保存され、同名ファイルが既にある場合だけファイル名末尾に fileId を付けます。
保存後は、その形式に対応する既存の読取機能が利用できる場合だけ内容まで確認します。
読取機能がない場合は、ダウンロード済みであること、形式、内容未確認、保存先を明示します。
このプラグインはバイナリ解析・変換ライブラリを同梱せず、実行時の依存関係インストールも行いません。

### Codex

`$google-drive` でプラグインを呼び出し、自然言語で指示します。

```
$google-drive Driveにつながるか確認して
```

## 参考: 認証

このプラグインは共有の Google OAuth client_id を使い、client secret は login 時の対話入力で受け取って OS secure store にのみ保存します。
token record は profile ごとに macOS Keychain または Windows Credential Manager に保存します。
保存先の account / target は `scoped-connectors/google-drive/<profile>` です。profile 未設定の従来構成は `default` を使います。
file store と token 用環境変数は使いません。

Google Cloud 側の管理は [管理者向けセットアップ](ADMIN_SETUP.md) に分けています。
