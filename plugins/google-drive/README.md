# Google Drive プラグイン

Google Drive のファイルを読み取り専用で参照するプラグインです。

読み取り専用 scope を使い、ファイルの作成・更新・削除は行いません。
参照できるのは**許可したフォルダの配下のみ**です（設定ファイルでフォルダ ID を指定）。

**[セットアップ手順](SETUP.md)**

## 使い方

### Claude Code

| コマンド | 説明 |
|---|---|
| `/google-drive-login` | Drive / Activity / Labels の読み取り専用 scope で OAuth token を取得 |
| `/google-drive-check` | Google Drive API の接続を確認 |
| `/google-drive-read <URL または fileId>` | 許可フォルダ配下のファイル内容を読む |

自然言語でも利用できます。

```
Google Drive API接続確認して
このDriveのファイルを読んで https://docs.google.com/document/d/xxxx/edit
```

Google Docs は Markdown、Sheets は CSV（先頭シートのみ）、Slides はテキストで取得します。
PDF・画像などは一時ファイルに保存され、エージェントがそのファイルを読みます。

### Codex

`$google-drive` でプラグインを呼び出し、自然言語で指示します。

```
$google-drive Driveにつながるか確認して
```
