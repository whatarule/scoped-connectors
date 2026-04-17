# Claude Slack Reader

Claude Code から Slack のメッセージを取得・検索するためのプラグインです。
インストールすると `/slack` コマンドや自然言語（「generalの最近のメッセージ見せて」など）で、チャンネルの投稿内容やスレッドを確認できます。

このプラグインは**読み取り専用**です。メッセージの送信・編集・削除は一切行いません。

**[セットアップ手順はこちら](SETUP.md)**

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
