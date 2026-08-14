# Slack プラグイン

Slack のメッセージを取得・検索し、参加済みのチャンネルへ投稿するプラグインです。
コマンドや自然言語（「generalの最近のメッセージ見せて」など）で、チャンネルの投稿内容やスレッドを確認できます。

**読み取りは public チャンネルのみ**です。private チャンネルと DM は scope を持たないため読み取れません。

**投稿は参加済みのチャンネルのみ**です（public / private いずれも可）。
**DM・グループ DM には投稿できません。**
投稿は確認表示を挟む2段階で、確認表示に出た token を `--confirm` に渡すまで実行されません。
token は投稿先・本文から決まるため、**確認した内容と違うものは投稿できません。**
メッセージの編集・削除は一切行いません。

**[セットアップ手順](SETUP.md)**

## 使い方

### Claude Code

| コマンド | 説明 |
|---|---|
| `/slack-auth` | Slack OAuth PKCE でログイン（引数なしは login） |
| `/slack-auth login` | Slack OAuth PKCE でログイン（明示形） |
| `/slack-auth status` | 保存済み Slack token record と `auth.test` live 状態の確認（token 値は非表示） |
| `/slack-auth clear` | OS secure store の保存済み Slack token record を削除 |
| `/slack-channels` | チャンネル一覧を表示 |
| `/slack-users` | ユーザー・グループキャッシュを更新 |
| `/slack-history <channel> [limit]` | 指定チャンネルのメッセージを取得 |
| `/slack-history <channel> [limit] 先週` | 期間指定でメッセージを取得 |
| `/slack-thread <channel> <timestamp>` | スレッドのメッセージを取得（ts指定） |
| `/slack-thread <URL>` | スレッドのメッセージを取得（URL指定、チャンネル不要） |
| `/slack-search <keyword> [count]` | パブリックチャンネルの投稿を検索（デフォルト3件、最大100件） |
| `/slack-search <keyword> [count] 先週` | 期間指定でパブリックチャンネルの投稿を検索 |
| `/slack-post <channel> <text>` | 参加済みチャンネルへ投稿（確認表示のみ。投稿は承認後） |
| `/slack-post <channel> <text> --thread-ts <ts>` | スレッドへ返信（確認表示のみ。投稿は承認後） |

`timestamp` は Slack がメッセージを一意に識別するための値です（例: `1776320535.121069`）。
メッセージ取得の出力に含まれるので、そこからコピーしてスレッド取得に使えます。
Slack のメッセージURLでも指定できます。

自然言語でも利用できます。

```
generalの最近のメッセージ見せて
```

### Codex

`$slack` でプラグインを呼び出し、自然言語で指示します。

```
$slack generalの最近のメッセージを5件見せて
```

## 参考: 認証と token 保存

Slack App manifest では PKCE と token rotation を有効にしています。
このプラグインは PKCE 前提のため `client_secret` は設定・送信しません。

token record は macOS Keychain または Windows Credential Manager に保存します。
Windows native と WSL では同じ Windows Credential Manager target `scoped-connectors/slack/default` を使います。
file store と token 用環境変数は使いません。

token 保存前に `auth.test` の `team_id` を allowlist と照合し、一致しない token は保存しません。
既定の allowlist は対象 workspace の team ID `T06B7BCTU` です。
guest user（`is_restricted` / `is_ultra_restricted`）の token は常に保存しません。

保存状態と Slack API 上の live 状態は `/slack-auth status`、保存済み token record の削除は `/slack-auth clear` で確認・実行できます。
スクリプトを直接実行する場合は `node plugins/slack/scripts/slack-auth.js status` と `node plugins/slack/scripts/slack-auth.js clear` を使います。
`clear` は Slack 側の token revoke ではなく、ローカルの OS secure store から保存 token record を削除します。

## 参考: 共有 Slack App

このプラグインは共有 Slack App の Client ID を同梱しています。
通常の利用者は Slack App を作成しません。

共有 Slack App は Public Distribution を有効化せず、対象 workspace 用の App として管理します。

共有 Slack App には以下のスコープが設定されています:

| スコープ | 用途 |
|---|---|
| `channels:read` | パブリックチャンネルの一覧取得 |
| `channels:history` | チャンネルのメッセージ履歴取得 |
| `chat:write` | 参加済みチャンネルへのメッセージ投稿 |
| `search:read.public` | Real-time Search API でのパブリックチャンネル検索 |
| `users:read` | ユーザー名の表示 |
| `usergroups:read` | ユーザーグループ名の表示 |

読み取り系のスコープはいずれも public チャンネルに限定したものです。
private チャンネルの `groups:*` と DM の `im:*` / `mpim:*` は付与しません。

このプラグインの検索は `search:read.public` scope の Real-time Search API で実装しています。
認可ユーザーが閲覧できるプライベートチャンネルの結果を返す可能性があるため、`search:read` は付与しません。

### 投稿スコープについて

投稿先は**参加済みのチャンネル**に限ります。public / private は問いません。
private を除外しないのは、除外しても守れるものが無いためです——private への投稿は
データを外に出さないので、public 限定にすると「秘匿情報を扱う話題を閉じた場所へ書く」
という選択肢を塞ぐだけになります。

拒否するのは **DM・グループ DM** です。会話の相手が居る私的な領域なので、
チャンネルへの投稿とは性質が異なるものとして対象外にしています。

`chat:write` は投稿先の種別を区別しないため、判定は
スクリプト側で行います（`scripts/policy/slack-post.js`）。

- `D` 始まりの ID は DM と確定するので、API を呼ぶ前に拒否する
- それ以外は名前指定・ID 指定のどちらでも `conversations.info` を引き、
  `is_im` / `is_mpim` で DM を、`is_member` で未参加を、`is_archived` で
  アーカイブ済みを拒否する
- 情報を取得できない場合は投稿しない（fail closed）

チャンネルのキャッシュは**名前から ID を引くためだけ**に使います。
キャッシュは `conversations.list` を `types=public_channel` で引いた結果なので、
載っていることで分かるのは「public チャンネルである」ことだけで、
**参加しているかどうかは分かりません**（未参加の public チャンネルも一覧に載ります）。
そのため名前指定でも `conversations.info` の確認を省きません。

`chat:write.public` は付与しません。未参加のチャンネルへ投稿できてしまうためです。
編集・削除（`chat:update` / `chat:delete`）も付与しません。

### 確認した内容だけが投稿できる

確認表示と `--confirm` は別々の実行なので、そのままでは
「A を見せて B を投稿する」ことができてしまい、人の承認が実質的に効きません。

そこで確認表示は、投稿先・本文・スレッドから決まる token を出します。
`--confirm <token>` が現在の内容と一致しなければ投稿しません。
承認後に本文や投稿先が変われば token も変わるため、確認をやり直すことになります。
