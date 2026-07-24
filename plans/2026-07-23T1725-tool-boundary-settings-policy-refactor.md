# scoped connectors: ツール仕様 / 設定 / ポリシー / API 都合の分離計画

## Context

このリポジトリの Google Drive / Slack plugin scripts では、次の性質が同じファイルや同じ関数に寄りやすい。

- ユーザーが意識するツール仕様
  - CLI 引数、既定値、最大件数、対応 format、stdout / file 保存の違い
- 設定値の上書き仕様
  - CLI / environment variable / config file / bundled default の優先順位
  - 配列値を merge するのか replace するのか
  - 正規化、source tracking、未指定時の扱い
- ポリシー検証仕様
  - Google `allowedDomains`
  - Google Drive `allowedFolderIds`
  - Google OAuth scope の完全一致
  - Slack `allowedTeamIds`
  - Slack guest user 拒否
- Provider / API 都合
  - Google Drive `files.export`
  - Google Drive `files.get`
  - Google Sheets `spreadsheets.values.get` / `batchGet`
  - Slack `assistant.search.context`
  - retry、cursor、API error reason、`supportsAllDrives`
- 入出力都合
  - stdout / stderr
  - binary 保存先
  - エージェント向けの「Read ツールで読んでください」メッセージ

特に `plugins/google-drive/scripts/read.js` は、今後 Google Sheets の2枚目以降や全シート取得を足すと分岐が増える。
その前に責務境界を作る。

## Goals

- ユーザーが意識するツール仕様と、ユーザーが意識する必要のない API 都合を分ける
- 設定値の上書き仕様を、実装から読み解くのではなく仕様として読めるようにする
- ドメイン / allowlist / scope / guest 拒否などのポリシー検証を、Provider API 呼び出しから分離する
- 初期段階では `shared/scripts` に影響させない
- Google Sheets 複数シート対応を入れる前の受け皿を作る
- 既存の CLI 挙動、出力、エラー、token 保存方針を壊さない

## Non-goals

- Google Sheets 複数シート対応そのものの実装
- Slack / Google Drive の全 script を一括で大規模移動すること
- `shared/scripts` への新しい抽象化追加
- OAuth flow、secure token store、refresh token 処理の仕様変更
- README / SETUP の大幅な書き直し
- plugin cache への同期

## Proposed Boundaries

### Tool Contract

ユーザーが意識するコマンド仕様を置く。

例:

- `read.js <fileId または Drive URL> [--format md|txt|csv|pdf] [--out dir] [--force]`
- 既定 format
- 対応 format
- `MAX_MEDIA_BYTES`
- stdout に出すか、ファイルに保存するかのユーザー向け契約
- usage text
- ユーザー向け validation error

候補:

```text
plugins/google-drive/scripts/read/contract.js
plugins/slack/scripts/search/contract.js
```

### Settings Resolution

設定値の source と優先順位を置く。

例:

```text
clientId:
  --client-id > GOOGLE_DRIVE_CLIENT_ID > config.clientId > config.client_id > bundled default

allowedDomains:
  GOOGLE_DRIVE_ALLOWED_DOMAINS > config.allowedDomains > bundled default
  merge ではなく replace
  trim / lowercase / leading @ removal

allowedFolderIds:
  config.allowedFolderIds only
  read 実行時は必須
```

候補:

```text
plugins/google-drive/scripts/settings/google-drive.js
plugins/slack/scripts/settings/slack.js
```

必要なら `ResolvedSetting` shape を使う。

```js
{
  key: "clientId",
  value: "xxx.apps.googleusercontent.com",
  source: "env:GOOGLE_DRIVE_CLIENT_ID"
}
```

ただし初期実装では、source tracking は内部テスト用にとどめ、ユーザー表示は増やさない。

### Policy Validation

許可 / 拒否の判断仕様を置く。
Provider API の raw response shape ではなく、検証に必要な入力を受け取る。

Google login policy:

- token response scope は許可された readonly scope と完全一致する
- `about.get` から得た email domain は `allowedDomains` と完全一致する
- サブドメインは一致扱いにしない
- 検証成功まで token record は保存しない

Google read policy:

- `allowedFolderIds` が必須
- 対象 file の parents を ancestor traversal で検証する
- parents なし、API error、深さ超過、循環は fail closed
- 401 は認証切れとして呼び出し元に投げ直す

Slack login policy:

- `auth.test` の `team_id` が `allowedTeamIds` と完全一致する
- guest user は拒否する
- 検証成功まで token record は保存しない

候補:

```text
plugins/google-drive/scripts/policy/google-login.js
plugins/google-drive/scripts/policy/google-read.js
plugins/slack/scripts/policy/slack-login.js
```

### Use Case

ツールの業務的な実行順序を置く。

Google Drive read:

1. target から fileId を解決する
2. folder URL は未対応として拒否する
3. read 用設定を解決する
4. allowlist policy を検証する
5. metadata を取得する
6. Tool Contract から取得 plan を決める
7. Provider Adapter で本文を取得する
8. Presenter に ToolResult を渡す

候補:

```text
plugins/google-drive/scripts/read/use-case.js
```

### Provider Adapter

Google / Slack API の endpoint、query params、retry、API error formatting を置く。

候補:

```text
plugins/google-drive/scripts/providers/drive-client.js
plugins/google-drive/scripts/providers/sheets-client.js
plugins/slack/scripts/providers/slack-client.js
```

初期段階では `plugins/google-drive/scripts/common.js` を大きく動かさず、read use-case から呼ぶ薄い adapter を作るだけでもよい。

### Presenter / IO

stdout / stderr / file 保存を置く。

候補:

```text
plugins/google-drive/scripts/read/presenter.js
```

責務:

- text buffer を stdout に出す
- 末尾 newline を保証する
- binary を `drive-read/<fileId>/` に保存する
- 保存先メッセージを出す
- warning を stderr に出す

## Shared Impact

初期段階では `shared/scripts` は触らない。

理由:

- `shared/scripts` は OAuth / token store の低レベル runtime helper であり、ユーザー仕様や provider policy を置く場所ではない
- 現在の同期先は Google Drive plugin の `scripts/_shared/` のみ
- `shared` を変更すると vendored copy との同期確認が必要になり、責務分離そのものより影響範囲が広がる
- 設定上書きや policy は Google Drive / Slack で似ていても、命名・既定値・拒否条件が異なる

`shared` に入れないもの:

- `allowedDomains`
- `allowedFolderIds`
- `allowedTeamIds`
- scope 完全一致 policy
- guest user 拒否
- CLI / env / config / default の具体的な優先順位
- ユーザー向けエラー文
- Drive / Sheets / Slack API endpoint

将来の shared 化候補:

- first-non-empty で設定値を解決し、source も返す小さな helper
- 配列またはカンマ区切り文字列の正規化 helper
- provider に依存しない validation result shape

ただし、Google Drive と Slack の両方へ分離を適用し、重複が実際に安定してから検討する。

## Phased Plan

### Phase 1: Google Drive read の縦分割

目的:

- 最初の分離案の境界を、小さい範囲で実コードに作る
- Google Sheets 複数シート対応前に `read.js` の太り方を抑える

作業:

- `plugins/google-drive/scripts/read/contract.js` を作る
  - `USAGE`
  - `DEFAULT_OUT_DIR`
  - `MAX_MEDIA_BYTES`
  - Google native MIME / export format mapping
  - `parseReadArgs`
  - `resolveReadPlan`
- `plugins/google-drive/scripts/read/presenter.js` を作る
  - `sanitizeFileName`
  - `saveToFile`
  - stdout / file output
- `plugins/google-drive/scripts/read/use-case.js` を作る
  - `extractFileId`
  - allowlist 検証
  - metadata 取得
  - export / media 取得
- `plugins/google-drive/scripts/read.js` は entrypoint に寄せる
  - parse
  - use-case 実行
  - presenter 実行
  - top-level error handling
- 挙動変更なしで既存 tests を更新する

注意:

- `allowlist.js` は Phase 1 では大きく動かさない
- `common.js` も Phase 1 では大きく動かさない
- module path の移動によって CLI 実行パスを変えない

### Phase 2: Google Drive settings / policy の切り出し

目的:

- 設定値の上書き仕様と policy 検証仕様を独立して読めるようにする

作業:

- `plugins/google-drive/scripts/settings/google-drive.js`
  - config path resolution
  - config file loading
  - clientId resolution
  - allowedDomains resolution
  - allowedFolderIds loading
- `plugins/google-drive/scripts/policy/google-login.js`
  - scope validation
  - domain validation
  - token 保存前検証の入力 shape
- `plugins/google-drive/scripts/policy/google-read.js`
  - allowedFolderIds validation
  - ancestor traversal policy
- `oauth-login.js` と `read/use-case.js` から policy / settings を呼ぶ

注意:

- OAuth flow 自体は動かさない
- token record shape は変えない
- error 文言は原則維持する

## Test Plan

Phase 1:

```sh
node --check plugins/google-drive/scripts/read.js
node --check plugins/google-drive/scripts/read/contract.js
node --check plugins/google-drive/scripts/read/use-case.js
node --check plugins/google-drive/scripts/read/presenter.js
node --test plugins/google-drive/scripts/test/read.test.js
node --test plugins/google-drive/scripts/test/allowlist.test.js
node --test plugins/google-drive/scripts/test/*.test.js
```

Phase 2:

```sh
node --check plugins/google-drive/scripts/oauth-login.js
node --check plugins/google-drive/scripts/settings/google-drive.js
node --check plugins/google-drive/scripts/policy/google-login.js
node --check plugins/google-drive/scripts/policy/google-read.js
node --test plugins/google-drive/scripts/test/oauth-login.test.js
node --test plugins/google-drive/scripts/test/auth.test.js
node --test plugins/google-drive/scripts/test/allowlist.test.js
node --test plugins/google-drive/scripts/test/*.test.js
```

## Risks

- User-facing behavior can change accidentally through refactor
  - Mitigation: keep old tests, add compatibility tests around stdout/file output and error paths
- Error wording can drift
  - Mitigation: preserve existing Japanese error substrings in tests where useful
- `policy` can accidentally absorb Provider Adapter concerns
  - Mitigation: policy functions accept normalized inputs; API calls stay in use-case/provider
- `settings` can hide source precedence
  - Mitigation: encode source order in one place and test CLI / env / config / default precedence
- shared abstraction can be premature
  - Mitigation: keep shared out of scope for this plan

## Review Checklist

- [ ] `read.js` remains the same CLI entrypoint
- [ ] Existing `/google-drive-read` skill command examples still work
- [ ] `read.js <Sheets URL>` still uses Drive CSV export and first sheet behavior
- [ ] `--format pdf` still saves a file
- [ ] binary files still save to `drive-read/<fileId>/`
- [ ] `allowedFolderIds` fail closed behavior is unchanged
- [ ] token values never appear in stdout / stderr
- [ ] `shared/scripts` is untouched in Phase 1 and Phase 2
- [ ] Tests cover setting precedence before and after moving code
