# Slack プラグイン セットアップ

## 1. Slack App の作成

1. [api.slack.com/apps](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From a manifest」を選択
3. ワークスペースを選択
4. 本リポジトリの [`slack-app-manifest.json`](slack-app-manifest.json) の内容を貼り付けて作成

## 2. ワークスペースにインストールして User Token を取得

1. 作成した App の「Install App」ページからワークスペースにインストール
2. インストール後に表示される **User OAuth Token**（`xoxp-` で始まるトークン）をコピー

## 3. 環境変数の設定

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

## 4. コマンド実行許可の設定（Claude Code のみ・任意）

初回実行時に毎回許可を求められるのが煩わしい場合、プロジェクトまたはユーザーの設定ファイルに許可設定を追加してください。

設定例は [`verification/.claude/settings.json`](../../verification/.claude/settings.json) を参照してください。
