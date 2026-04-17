# Claude Slack Reader

Claude Code から Slack のメッセージを取得・検索するためのプラグインです。
インストールすると `/slack` コマンドや自然言語（「generalの最近のメッセージ見せて」など）で、チャンネルの投稿内容やスレッドを確認できます。

このプラグインは**読み取り専用**です。メッセージの送信・編集・削除は一切行いません。

## セットアップ手順

### 1. Slack App の作成

1. [api.slack.com/apps](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From a manifest」を選択
3. ワークスペースを選択
4. 本リポジトリの `slack-app-manifest.json` の内容を貼り付けて作成

### 2. ワークスペースにインストールして User Token を取得

1. 作成した App の「Install App」ページからワークスペースにインストール
2. インストール後に表示される **User OAuth Token**（`xoxp-` で始まるトークン）をコピー


### 権限について

slack-app-manifest.json で設定されるスコープ:
| スコープ | 用途 |
|---|---|
| `channels:read` | パブリックチャンネルの一覧取得 |
| `channels:history` | チャンネルのメッセージ履歴取得 |
| `search:read` | メッセージ検索 |
| `users:read` | ユーザー名の表示 |
| `usergroups:read` | ユーザーグループ名の表示 |

### 3. 環境変数の設定

`~/.claude/settings.json` に `SLACK_TOKEN` を設定します。

```json
{
  "env": {
    "SLACK_TOKEN": "xoxp-xxxx-xxxx-xxxx-xxxx"
  }
}
```

### 4. プラグインのインストール

```sh
claude plugin marketplace add whatarule/scoped-connectors
claude plugin install slack@slack
```

### 5. コマンド実行許可の設定（任意）

初回実行時に毎回許可を求められるのが煩わしい場合、プロジェクトまたはユーザーの設定ファイルに許可設定を追加してください。

設定例は [`verification/.claude/settings.json`](verification/.claude/settings.json) を参照してください。

## 使い方

| コマンド | 説明 |
|---|---|
| `/slack channels` | チャンネル一覧を表示 |
| `/slack history <channel>` | 指定チャンネルのメッセージを取得 |
| `/slack thread <channel> <ts>` | スレッドのメッセージを取得（ts指定） |
| `/slack thread <URL>` | スレッドのメッセージを取得（URL指定、チャンネル不要） |
| `/slack search <keyword>` | メッセージを検索 |

`ts` はメッセージのタイムスタンプ（例: `1776320535.121069`）で、Slack がメッセージを一意に識別するために使う値です。
`/slack history` の出力に含まれるので、そこからコピーして `/slack thread` に渡せます。
Slack のメッセージURLでも指定できます（例: `https://workspace.slack.com/archives/C01ABC/p1776320535121069`）。

自然言語でも利用できます。

```
/slack generalのメッセージ見せて
```
