# セットアップ手順

## 1. Slack App の作成

1. [api.slack.com/apps](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From a manifest」を選択
3. ワークスペースを選択
4. 本リポジトリの [`slack-app-manifest.json`](slack-app-manifest.json) の内容を貼り付けて作成

## 2. ワークスペースにインストールして User Token を取得

1. 作成した App の「Install App」ページからワークスペースにインストール
2. インストール後に表示される **User OAuth Token**（`xoxp-` で始まるトークン）をコピー

### 権限について

このプラグインは**読み取り専用**です。メッセージの送信・編集・削除は一切行いません。

[`slack-app-manifest.json`](slack-app-manifest.json) で設定されるスコープ:
| スコープ | 用途 |
|---|---|
| `channels:read` | パブリックチャンネルの一覧取得 |
| `channels:history` | チャンネルのメッセージ履歴取得 |
| `search:read` | メッセージ検索 |
| `users:read` | ユーザー名の表示 |
| `usergroups:read` | ユーザーグループ名の表示 |

## 3. 環境変数の設定

`~/.claude/settings.json` に `SLACK_TOKEN` を設定します。

```json
{
  "env": {
    "SLACK_TOKEN": "xoxp-xxxx-xxxx-xxxx-xxxx"
  }
}
```

## 4. プラグインのインストール

```sh
claude plugin marketplace add whatarule/scoped-connectors
claude plugin install slack@slack
```

## 5. コマンド実行許可の設定（任意）

初回実行時に毎回許可を求められるのが煩わしい場合、プロジェクトまたはユーザーの設定ファイルに許可設定を追加してください。

設定例は [`verification/.claude/settings.json`](verification/.claude/settings.json) を参照してください。
