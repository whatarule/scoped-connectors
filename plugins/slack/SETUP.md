# Slack プラグイン セットアップ

## 1. プラグインのインストール

```sh
# Claude Code
claude plugin install slack@scoped-connectors

# Codex
# Codex セッション内で /plugins から slack をインストール
```

## 2. Slack App の作成

1. [api.slack.com/apps](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From a manifest」を選択
3. ワークスペースを選択
4. 本リポジトリの [`slack-app-manifest.json`](slack-app-manifest.json) の内容を貼り付けて作成

manifest により以下の読み取り専用スコープが設定されます:

| スコープ | 用途 |
|---|---|
| `channels:read` | パブリックチャンネルの一覧取得 |
| `channels:history` | チャンネルのメッセージ履歴取得 |
| `search:read.public` | Real-time Search API でのパブリックチャンネル検索 |
| `users:read` | ユーザー名の表示 |
| `usergroups:read` | ユーザーグループ名の表示 |

このプラグインの検索は `search:read.public` scope の Real-time Search API で実装しています。
認可ユーザーが閲覧できるプライベートチャンネルの結果を返す可能性があるため、`search:read` は付与しません。

## 3. ワークスペースにインストールして User Token を取得

1. 作成した App の「Install App」ページからワークスペースにインストール
2. インストール後に表示される **User OAuth Token**（`xoxp-` で始まるトークン）をコピー

既存 App に scope を追加した場合、管理側で承認済みになった後も、必ず「Install App」ページから再インストールしてください。
再インストールしないと、Slack API の `provided` scope に新しい権限が反映されないことがあります。

## 4. 環境変数の設定

### Claude Code の場合

`~/.claude/settings.json` に `SLACK_TOKEN` を設定します。

```json
{
  "env": {
    "SLACK_TOKEN": "xoxp-xxxx-xxxx-xxxx-xxxx"
  }
}
```

### Codex の場合

シェルの環境変数として設定します。

```sh
export SLACK_TOKEN=xoxp-xxxx-xxxx-xxxx-xxxx
```

永続化するには `.zshrc` / `.bashrc` に追加してください。

> **注意**: シェル環境変数は全プロセスから参照可能です。Claude Code の settings.json はツール内に閉じているため、セキュリティ上はそちらが望ましいです。

## 5. コマンド実行許可の設定（Claude Code のみ・任意）

初回実行時に毎回許可を求められるのが煩わしい場合、プロジェクトまたはユーザーの設定ファイルに許可設定を追加してください。

設定例は [`verification/.claude/settings.json`](../../verification/.claude/settings.json) を参照してください。

Codex の場合は `codex --full-auto` で実行すれば個別の許可設定は不要です。

## 参考: プラグインの更新

### Claude Code

```sh
claude plugin update slack@scoped-connectors
```

更新後は Claude Code を再起動してください。

### Codex

Codex は marketplace snapshot を更新してから、プラグインを入れ直します。

```sh
codex plugin marketplace upgrade scoped-connectors
codex plugin remove slack@scoped-connectors
codex plugin add slack@scoped-connectors
```

更新後は Codex セッションを再起動してください。

## 参考: アンインストール

プラグインのアンインストールは、ローカルの Claude Code / Codex からこのプラグインを外す操作です。
Slack App や発行済み OAuth Token の削除とは別です。

```sh
# Claude Code
claude plugin uninstall slack@scoped-connectors

# Codex
# Codex セッション内で /plugins からプラグインをアンインストール
```

## 参考: Slack App の削除

作成した Slack App 自体を削除する場合は、Slack の App 管理画面から操作します。

1. [api.slack.com/apps](https://api.slack.com/apps) にアクセス
2. 削除したい App を選択
3. 左メニューの「Basic Information」を開く
4. ページ下部の「Delete App」から削除する

削除すると、その App から発行された OAuth Token は利用できなくなります。
権限を見直して作り直す場合は、削除後に本手順の「Slack App の作成」からやり直してください。
