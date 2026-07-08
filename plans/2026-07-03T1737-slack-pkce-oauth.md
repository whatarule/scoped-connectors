# Slack PKCE OAuth 対応計画

## 背景

Issue #21 は、Slack App から発行した長寿命 User OAuth Token (`xoxp-`) を `SLACK_TOKEN` として
`~/.claude/settings.json` やシェル環境変数に静的配置する方式の見直しを求めている。

現状の Slack プラグインは `plugins/slack/scripts/common.js` が `process.env.SLACK_TOKEN` を直接読み、
全 API 呼び出しにその値を `Authorization: Bearer ...` として使う。

Google Drive 側はすでに自前の browser OAuth スクリプトを持ち、loopback redirect、state 検証、
PKCE S256、access token refresh を実装している。Slack 側も認証フローは同じ方向でよい。

ただし Issue の主目的は「長寿命秘密のローカル静的配置を廃する」ことなので、Slack 側では
Drive と同じ token JSON 既定ではなく、OS secure store（macOS Keychain）に保存する。
file store と token 用環境変数 fallback は使わない。

## 方針

1. Slack App を PKCE public client として扱う。
2. bot scope は使わず、既存どおり user scope の読み取り専用 scope だけを要求する。
3. 認証操作の入口は `/slack-auth` に統合し、引数なしは `login` として扱い、`status` / `clear` はサブコマンドで分岐する。
4. `common.js` は `SLACK_TOKEN` 直読みではなく、OS secure store 経由で access token を取得する。
5. `SLACK_TOKEN` fallback は残さない。
6. refresh token は Keychain に保存し、access token は短命 token として必要に応じて更新する。
7. 利用者向けには共有 Slack App を使い、Client ID はプラグイン既定値として同梱する。
8. token 保存前に `auth.test` で `team_id` を確認し、allowlist と一致した場合だけ保存する。
9. guest user（`is_restricted` / `is_ultra_restricted`）は常に拒否する。設定・環境変数での無効化手段は設けない。
    guest がこのプラグインを使っても本人の Slack 権限を超える読み取りはできないため、
    セキュリティ境界ではなく「外部ゲストに社内ツールを使わせない」ポリシーのガードレールとして固定する。
    allowed_team_ids / client_id の上書きは開発用途（別 App の検証等）のため残す。
10. `/slack-login` は追加しない。ログイン操作は `/slack-auth` または `/slack-auth login` に統一する。

## Slack App manifest 変更

`plugins/slack/slack-app-manifest.json` に以下を追加する。

- `oauth_config.pkce_enabled: true`
- `oauth_config.redirect_urls`
  - まずは固定 loopback URL を採用する
  - 例: `http://localhost:53682/slack/oauth/callback`
- `settings.token_rotation_enabled: true`

既存の user scope は維持する。

- `channels:history`
- `channels:read`
- `search:read.public`
- `users:read`
- `usergroups:read`

注意点:

- Slack の PKCE 有効化は public client 化で、原則一方向変更。
- desktop redirect は bot scope を要求できないため、このプラグインの user-token-only 方針と一致する。
- Slack の redirect URI は登録値と一致する必要があるため、Google Drive のようなランダムポートではなく固定ポートを使う。
- 固定ポートが使用中の場合は、分かりやすく失敗させ、ユーザーに別ポートを manifest と config / 実行オプションで揃えて設定してもらう。

## 追加ファイル

### `plugins/slack/scripts/oauth-login.js`

Drive の `oauth-login.js` と同じ構成で実装する。

主な処理:

- `--config`、`--client-id`、`--redirect-uri` を parse
- 共有 Slack App の Client ID を既定値として使う
- 別 App 用に `~/.config/scoped-connectors/slack/config.json`、`SLACK_CLIENT_ID`、`SLACK_REDIRECT_URI` を override として読む
- `allowed_team_ids` / `SLACK_ALLOWED_TEAM_IDS` を読み、token 保存前の workspace allowlist として使う
- guest user は常に拒否する（設定・環境変数での無効化は不可）
- `code_verifier` を生成
- S256 `code_challenge` を生成
- `state` を生成
- `http://localhost:53682/slack/oauth/callback` で callback server を起動
- `https://slack.com/oauth/v2_user/authorize` の URL を表示
- `scope` に読み取り専用 user scope をカンマ区切りで指定
- callback の `code` と `state` を検証
- user-token-only / desktop IDE 向けの `oauth.v2.user.access` に `client_id`、`code`、`code_verifier`、`redirect_uri` を POST
- `client_secret` は送らない
- token response はまだ保存せず、取得した access token で `auth.test` を呼ぶ
- `auth.test.team_id` が `allowed_team_ids` と一致しない場合は token を保存せず失敗する
- `users.info(user=auth.user_id)` を呼び、`is_restricted` / `is_ultra_restricted` が true なら保存しない
- top-level の user token 情報を抽出して保存

保存する情報:

- `client_id`
- `team.id`
- `team.name`
- `authed_user.id`
- `scope`
- `access_token`
- `refresh_token`
- `expires_at`
- `token_type`

token の値は stdout / stderr に出さない。

### `plugins/slack/scripts/slack-auth.js`

ユーザー向け認証操作の CLI dispatcher を追加する。

サブコマンド:

- 引数なし: `login` と同じ動作にする
- `login`: `oauth-login.js` 相当の PKCE login を実行する
- `status`: OS secure store の token record 有無を確認し、保存済み token で `auth.test` を呼び、team / user 情報だけを表示する
- `clear`: OS secure store の保存 token record を削除する

注意:

- `status` は token 値、refresh token 値、Authorization header を絶対に出力しない。
- `clear` は Slack 側の token revoke ではなく、ローカルの OS secure store から保存 token record を削除する操作として明示する。
- user-facing CLI は `slack-auth.js` とし、refresh などの内部共通処理用 `auth.js` と名前の役割を分ける。

### `plugins/slack/scripts/auth.js`

認証共通処理を分離する。

主な責務:

- OS secure store から token record を読み取り
- access token の有効期限確認
- 期限切れ前 refresh
- refresh 成功時の refresh token 差し替え
- refresh token 競合時の token store 再読込
- token 情報をログに出さないエラー整形

refresh 処理:

- `oauth.v2.user.access`
- `grant_type=refresh_token`
- `refresh_token=<current refresh token>`
- `client_id=<stored client id>`
- `client_secret` は送らない

Slack refresh token は使い捨てなので、refresh 成功後は新しい refresh token を必ず保存する。

並行実行対策:

- refresh 失敗が `invalid_refresh_token` 相当なら token store を再読込して 1 回だけ再試行する。
- 複数コマンドが同時に refresh しても、片方が保存した新 token を再利用できるようにする。

### `plugins/slack/skills/slack-auth/SKILL.md`

新しい user-invocable skill を追加する。

trigger:

- `/slack-auth`
- `/slack-auth login`
- `/slack-auth status`
- `/slack-auth clear`
- `Slackにログイン`
- `Slack認証状態を確認`
- `Slackの保存トークンを削除`

実行例:

```bash
node /path/to/plugins/slack/scripts/slack-auth.js
node /path/to/plugins/slack/scripts/slack-auth.js login
node /path/to/plugins/slack/scripts/slack-auth.js status
node /path/to/plugins/slack/scripts/slack-auth.js clear
```

引数なしまたは `login` では出力された URL をユーザーがブラウザで開く。
CLI からブラウザを自動起動する処理は既定では行わない。

`slack-login` skill は追加しない。

## 変更ファイル

### `plugins/slack/scripts/common.js`

`process.env.SLACK_TOKEN` 直読みを廃止し、`getSlackAccessToken()` を使う。

変更後は OS secure store の token record のみを読む。
`SLACK_TOKEN`、file store、token path 設定は使わない。

### `plugins/slack/slack-app-manifest.json`

PKCE / redirect / token rotation を追加する。

### `plugins/slack/SETUP.md`

セットアップを以下に変更する。

1. プラグインをインストールする
2. `/slack-auth`、`/slack-auth login`、または `slack-auth.js` を実行する
3. 表示された URL をブラウザで開いて許可する
4. token 保存前に `auth.test.team_id` を allowlist と照合する

通常利用者には Slack App 作成や Client ID 設定を要求しない。
共有 App 管理者・開発者向けに、別 App 用の `client_id` / `allowed_team_ids` override を残す。

`xoxp-` の手動コピーを通常手順から外す。

### `plugins/slack/README.md`

コマンド表に `/slack-auth`、`/slack-auth login`、`/slack-auth status`、`/slack-auth clear` を追加する。
`/slack-auth` は引数なしで login として扱う。必要なら `/slack-auth login` も明示形として説明する。

### plugin manifest

利用者向け機能と認証方式が変わるため、Slack plugin version を上げる。
`slack-auth` 追加と PKCE OAuth 対応を含むため、候補は `0.4.0`。

## OS secure store 方針

Keeper は標準実装に含めない。
初期実装は macOS Keychain に限定する。

### store interface

`plugins/slack/scripts/token-store.js` を追加し、実装ごとの差をここに閉じ込める。

公開関数:

- `readTokenRecord(options)`
- `writeTokenRecord(record, options)`
- `deleteTokenRecord(options)`
- `detectTokenStore(options)`
- `describeTokenStore(options)`

account:

- 初期実装は単一 workspace の `default` account を使う。
- token record 内には `team_id` / `team_name` / `authed_user_id` を保存する。
- 将来の複数 workspace 対応では config の account 設定または `--account` を追加する。

service / account name:

- service: `scoped-connectors/slack`
- account: `default`

保存 payload:

```json
{
  "version": 1,
  "client_id": "...",
  "team_id": "...",
  "team_name": "...",
  "authed_user_id": "...",
  "scope": "channels:history,channels:read,...",
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1790000000000,
  "token_type": "Bearer"
}
```

macOS:

- `security` コマンドを使う
- service: `scoped-connectors/slack`
- account: `default`
- 保存 payload は JSON
- read: `security find-generic-password -s scoped-connectors/slack -a default -w`
- write: `security add-generic-password -U -s scoped-connectors/slack -a default -w ...`
- delete: `security delete-generic-password -s scoped-connectors/slack -a default`

注意:

- `security add-generic-password -w <payload>` は password が短時間 process argv に載るため理想ではない。
- `security` は `-w` を最後に置くと prompt 入力できるが、非対話実行との相性を実装時に確認する。
- 実装時はまず `execFile` で shell 展開を避け、token をログに出さない。
- argv 露出が許容できない場合は、macOS 用 helper を別途検討する。

その他:

- macOS 以外では初期実装は未対応として明示的に失敗する。
- file store と token 用環境変数 fallback は実装しない。

将来:

- macOS 以外の OS backend は必要になった時点で追加する。

## sandbox 対応

OS secure store（Keychain）は Claude Code / Codex の sandbox 内から読み書きできない。
Slack 系 script は sandbox 外での実行を前提とし、各 SKILL.md に共通の「sandbox 外での実行」セクションを設けて
Claude Code / Codex それぞれの手順を記載する。

### Claude Code

- SKILL.md には、Bash tool の `dangerouslyDisableSandbox: true` を指定して最初から sandbox 外で実行するよう記載する。
  sandbox 内で一度失敗してから再試行する無駄を避けるため。
- 恒久設定として `.claude/settings.json` の `sandbox.excludedCommands` にスクリプトのパスを登録する。
  除外されたコマンドは常に sandbox 外で実行される。
- sandbox 外実行は通常の permission フローを通るため、`permissions.allow` の
  `Bash(node <スクリプトパス>)` を併せて設定し、承認プロンプトを省略する。
- パターンはインストール実体の絶対パスに固定する
  （例: `node /Users/<you>/.claude/plugins/cache/scoped-connectors/slack/*/scripts/*`。バージョン部分のみ `*`）。
  `*/plugins/slack/scripts/*` のような前方ワイルドカードは、同名構造を持つ任意リポジトリの
  スクリプトまで sandbox 外・承認なしで実行できてしまうため使わない。
- 環境依存の絶対パス（ユーザー名を含む）を伴う allow / excludedCommands は、
  公開リポジトリに載せないよう gitignore 済みの `verification/.claude/settings.local.json` に置く。
  tracked の `verification/.claude/settings.json` には環境非依存の `Skill(slack)` だけを残す。
  SETUP.md には設定キーとパスの確認方法だけを記載し、利用者が自分の環境のパスで書く。
- Slack 系 script は OS secure store の都合で通常経路が sandbox 外実行になるため、
  `sandbox.network.allowedDomains` の Slack 向け設定は通常セットアップ手順に含めない。
  sandbox 内のネットワーク許可を設定しても、token 読み取り時点で失敗するため。

### Codex

- SKILL.md には、`exec_command` の `sandbox_permissions: "require_escalated"` を指定し、
  `justification` に OS secure store の読み取り（login は保存）のためと書くよう記載する。
- script ごとに `prefix_rule`（例: `["node", "<フルパス>/history.js"]`）を指定し、
  初回承認後の再承認を省略しやすくする。対象 script は
  `slack-auth.js`、`channels.js`、`users.js`、`history.js`、`thread.js`、`search.js`。
- Slack 系 script は OS secure store の都合で通常経路が sandbox 外実行になるため、
  Codex の `network_proxy` allowlist は通常セットアップ手順に含めない。
  承認範囲は script ごとの `prefix_rule` に絞る。

## migration

- 既存の `SLACK_TOKEN` は読み取らない。
- PKCE 移行後は `slack-auth` または `slack-auth login` で OS secure store に token record を保存する。
- 既存 App は manifest 更新後、OAuth & Permissions で PKCE / token rotation / redirect URL を反映し、再インストールまたは `/slack-auth` を実行する。
- 保存済み token を消したい場合は `slack-auth clear` を使う。Slack 側 revoke ではないことを出力する。

## テスト計画

単体テスト:

- `slack-auth.js` の引数なし / `login` / `status` / `clear` 分岐
- PKCE verifier / challenge 生成
- authorize URL 生成
- callback `state` 不一致拒否
- token response から user token 抽出
- scope 不足検出
- access token 有効期限判定
- refresh request body が `client_secret` を含まないこと
- refresh 成功時に refresh token が差し替わること
- `invalid_refresh_token` 競合時に token store を再読込して新 token を使うこと
- `SLACK_TOKEN` fallback が存在しないこと
- token 値が error output に出ないこと
- `status` が token 値を出さず token record の有無と `auth.test` の team / user 情報だけを出すこと
- `clear` が OS secure store の `deleteTokenRecord` を呼ぶこと

統合 smoke:

- `node --test plugins/slack/scripts/test/*.test.js`
- `claude plugin validate plugins/slack`
- 実 Slack App で `/slack-auth`
- `slack-auth status`
- `slack-channels`
- `slack-users`
- `slack-history`
- `slack-search`
- access token 期限切れ相当の fixture で refresh path

## リスクと未決事項

- 固定 localhost port が占有されている場合の UX。
- Slack の localhost redirect 登録が port 単位でどこまで柔軟かは実 Slack App で確認する。
- token response の user token フィールド位置は Slack の実レスポンスで確認する。`authed_user` 優先、top-level fallback で実装する。
- Linux / WSL は初期実装で未対応のため、エラー表示を分かりやすくする。
- refresh token が 30 日で期限切れになるため、期限切れ時は `/slack-auth` を促す。
