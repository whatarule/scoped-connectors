# Slack プラグイン

Slack のメッセージを取得・検索するプラグインです。
コマンドや自然言語（「generalの最近のメッセージ見せて」など）で、チャンネルの投稿内容やスレッドを確認できます。

**読み取り専用**です。メッセージの送信・編集・削除は一切行いません。

**[セットアップ手順](SETUP.md)**

## コマンド

| コマンド | 説明 |
|---|---|
| `/slack-channels` | チャンネル一覧を表示 |
| `/slack-users` | ユーザー・グループキャッシュを更新 |
| `/slack-history <channel> [limit]` | 指定チャンネルのメッセージを取得 |
| `/slack-history <channel> [limit] 先週` | 期間指定でメッセージを取得 |
| `/slack-thread <channel> <ts>` | スレッドのメッセージを取得（ts指定） |
| `/slack-thread <URL>` | スレッドのメッセージを取得（URL指定、チャンネル不要） |
| `/slack-search <keyword> [count]` | メッセージを検索 |
| `/slack-search <keyword> [count] 今月` | 期間指定で検索 |

`ts` はメッセージのタイムスタンプ（例: `1776320535.121069`）で、Slack がメッセージを一意に識別するために使う値です。
`/slack-history` の出力に含まれるので、そこからコピーして `/slack-thread` に渡せます。
Slack のメッセージURLでも指定できます。

自然言語でも利用できます。

```
generalの最近のメッセージ見せて
```

## 権限スコープ

| スコープ | 用途 |
|---|---|
| `channels:read` | パブリックチャンネルの一覧取得 |
| `channels:history` | チャンネルのメッセージ履歴取得 |
| `search:read` | メッセージ検索 |
| `users:read` | ユーザー名の表示 |
| `usergroups:read` | ユーザーグループ名の表示 |
