# Google Drive プラグイン

Google Drive API に読み取り専用で接続するプラグインです。

Drive 上のファイル、Activity 履歴、Labels を参照できる読み取り専用 scope を使います。ファイルの作成・更新・削除は行いません。

**[セットアップ手順](SETUP.md)**

## 使い方

### Claude Code

| コマンド | 説明 |
|---|---|
| `/google-drive-login` | Drive / Activity / Labels の読み取り専用 scope で OAuth token を取得 |
| `/google-drive-check` | Google Drive API の接続を確認 |

自然言語でも利用できます。

```
Google Drive API接続確認して
```

### Codex

`$google-drive` でプラグインを呼び出し、自然言語で指示します。

```
$google-drive Driveにつながるか確認して
```
