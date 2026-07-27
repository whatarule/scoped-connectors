# shared scripts layout 見直し計画

## 背景

現状の shared runtime は、root の `shared/scripts` を source of truth とし、各 plugin の `scripts/_shared` へ vendored copy する構成になっている。

現在の同期状態:

- `shared/scripts`
- `plugins/google-drive/scripts/_shared`
- `plugins/slack/scripts/_shared`

`node tools/sync-shared.js --check` では `google-drive: ok` / `slack: ok` で、drift はない。

一方で、`shared/scripts` のファイル粒度は flat で、OAuth helper、token refresh helper、OS secure store adapter、PowerShell helper が同一階層に並んでいる。

現状:

```text
shared/scripts/
  oauth-callback.js
  oauth-http.js
  oauth-pkce.js
  token-refresh.js
  secure-token-store.js
  secure-token-store-mac.js
  secure-token-store-windows.js
  windows-credential.ps1
```

責務としては大きく次の3領域に分かれる。

- OAuth protocol helper: PKCE、state / callback validation、form POST
- token runtime helper: expires 判定、refresh race 後の再読込
- secure token store helper: macOS Keychain、Windows Credential Manager、WSL bridge、PowerShell helper

Google Drive / Slack の feature-first 整理後、plugin 側は feature / provider / settings の境界が読みやすくなったため、次に shared 側も責務単位を見直す余地がある。

## 目的

- `shared/scripts` のファイル粒度を責務単位で揃える
- OAuth helper / token helper / secure token store helper をディレクトリで分ける
- public API と internal helper の見え方を明確にする
- 現行の vendored `_shared` 配布方式は維持する
- Google Drive / Slack の plugin-specific policy / settings / CLI contract は shared に入れない
- 中間状態の `_shared` 同期は行わず、最終状態で `sync-shared.js --check` を通す

## 対象外

- vendored `_shared` 方式の廃止
- npm package 化
- Slack / Google Drive の OAuth policy 仕様変更
- `allowedDomains`、`allowedFolderIds`、`allowed_team_ids` など plugin-specific validation の shared 化
- CLI help / user-facing command contract の shared 化
- token record shape の変更
- scope の変更
- plugin cache への同期
- 旧 flat path と新 grouped path の中間互換を vendored `_shared` に同期すること
- `tools/sync-shared.js` の変更

## 目標レイアウト

候補:

```text
shared/scripts/
  oauth/
    pkce.js
    callback.js
    http.js

  token/
    refresh.js

  token-store/
    index.js
    mac-keychain.js
    windows-credential-manager.js
    windows-credential.ps1
```

vendored copy 先:

```text
plugins/google-drive/scripts/_shared/
  oauth/
  token/
  token-store/

plugins/slack/scripts/_shared/
  oauth/
  token/
  token-store/
```

plugin wrapper の例:

```js
const { createSecureTokenStore } = require("../_shared/token-store");

const WINDOWS_HELPER = path.join(
  __dirname,
  "..",
  "_shared",
  "token-store",
  "windows-credential.ps1"
);
```

## 命名ルール

- `shared/scripts/oauth/*` は OAuth protocol の汎用部品に限定する。
- `shared/scripts/token/*` は token record に依存しすぎない token lifecycle helper に限定する。
- `shared/scripts/token-store/*` は OS secure store adapter に限定する。
- `index.js` はそのディレクトリの public facade として使う。
- OS や backend 固有実装は `mac-keychain.js`、`windows-credential-manager.js` のように具体名にする。
- `windows-credential.ps1` は Windows Credential Manager adapter の実行 helper なので `token-store/` 配下に置く。
- plugin-specific な名称、設定、policy、表示文言は shared に持ち込まない。

## 依存方向

許可する依存:

```text
plugin feature/runtime -> plugin token-store wrapper -> _shared/token-store
plugin oauth login -> _shared/oauth/*
plugin auth runtime -> _shared/token/refresh + _shared/oauth/http
_shared/token-store/index -> _shared/token-store/mac-keychain
_shared/token-store/index -> _shared/token-store/windows-credential-manager
```

避ける依存:

```text
_shared -> plugin-specific settings/policy
_shared/oauth -> token-store
_shared/token -> plugin-specific token record validation
_shared/token-store adapter -> OAuth helper
plugin feature -> _shared/token-store/mac-keychain directly
plugin feature -> _shared/token-store/windows-credential-manager directly
```

## 段階計画

### Phase 0: baseline audit

目的:

- shared / vendored `_shared` が現在同期していることを固定する
- 変更前のテスト基準を確認する

手順:

- `node tools/sync-shared.js --check` を実行する
- shared tests を実行する
- Slack / Google Drive の関連 tests を実行する
- 現在の `_shared` import を洗い出す

検証:

```sh
node tools/sync-shared.js --check
node --test shared/test/*.test.js
node --test plugins/google-drive/scripts/test/*.test.js
node --test plugins/slack/scripts/test/*.test.js
rg -n "_shared|shared/scripts" plugins/google-drive plugins/slack shared tools
```

### Phase A: atomic final layout switch

目的:

- shared source と plugin vendored `_shared` を最終 grouped layout へ一括で切り替える
- 旧 flat path wrapper は追加しない
- `tools/sync-shared.js` は変更せず、既存の再帰コピー / 差分検出のまま使う
- `tools/sync-shared.js` に移行知識を入れない

手順:

- shared source を最終 layout に移す:
  - `shared/scripts/oauth-pkce.js` -> `shared/scripts/oauth/pkce.js`
  - `shared/scripts/oauth-callback.js` -> `shared/scripts/oauth/callback.js`
  - `shared/scripts/oauth-http.js` -> `shared/scripts/oauth/http.js`
  - `shared/scripts/token-refresh.js` -> `shared/scripts/token/refresh.js`
  - `shared/scripts/secure-token-store.js` -> `shared/scripts/token-store/index.js`
  - `shared/scripts/secure-token-store-mac.js` -> `shared/scripts/token-store/mac-keychain.js`
  - `shared/scripts/secure-token-store-windows.js` -> `shared/scripts/token-store/windows-credential-manager.js`
  - `shared/scripts/windows-credential.ps1` -> `shared/scripts/token-store/windows-credential.ps1`
- shared tests を new path 基準へ更新する
- Google Drive production imports を new vendored path へ更新する:
  - `../_shared/oauth-pkce` -> `../_shared/oauth/pkce`
  - `../_shared/oauth-callback` -> `../_shared/oauth/callback`
  - `../_shared/oauth-http` -> `../_shared/oauth/http`
  - `../_shared/token-refresh` -> `../_shared/token/refresh`
  - `../_shared/secure-token-store` -> `../_shared/token-store`
  - `../_shared/windows-credential.ps1` -> `../_shared/token-store/windows-credential.ps1`
- Slack production imports を new vendored path へ更新する:
  - `./_shared/oauth-pkce` -> `./_shared/oauth/pkce`
  - `./_shared/oauth-callback` -> `./_shared/oauth/callback`
  - `./_shared/oauth-http` -> `./_shared/oauth/http`
  - `./_shared/token-refresh` -> `./_shared/token/refresh`
  - `./_shared/secure-token-store` -> `./_shared/token-store`
  - `./_shared/windows-credential.ps1` -> `./_shared/token-store/windows-credential.ps1`
- plugin tests の import / path assertion を new path 基準へ更新する
- Google Drive / Slack の vendored `_shared` 旧 flat files を `trash` で削除する
- 既存の `node tools/sync-shared.js` を実行し、最終 layout の shared source を vendored `_shared` に反映する
- `node tools/sync-shared.js --check` で最終状態の同一性だけを確認する

検証:

```sh
node --check shared/scripts/oauth/pkce.js
node --check shared/scripts/oauth/callback.js
node --check shared/scripts/oauth/http.js
node --check shared/scripts/token/refresh.js
node --check shared/scripts/token-store/index.js
node --check shared/scripts/token-store/mac-keychain.js
node --check shared/scripts/token-store/windows-credential-manager.js
node --check plugins/google-drive/scripts/auth/token-runtime.js plugins/google-drive/scripts/auth/oauth-login.js plugins/google-drive/scripts/auth/token-store.js
node --check plugins/slack/scripts/auth.js plugins/slack/scripts/oauth-login.js plugins/slack/scripts/token-store.js
node tools/sync-shared.js --check
node --test shared/test/*.test.js
node --test plugins/google-drive/scripts/test/*.test.js
node --test plugins/slack/scripts/test/*.test.js
rg -n "_shared/(oauth-pkce|oauth-callback|oauth-http|token-refresh|secure-token-store|secure-token-store-mac|secure-token-store-windows|windows-credential\\.ps1)" plugins/google-drive plugins/slack
find shared/scripts -maxdepth 3 -type f | sort
```

### Phase B: public / internal 境界を確立

目的:

- shared 利用者が使ってよい API を文書とコードの両方で明確にする
- OS 固有 helper への直接依存を避ける
- shared 内部実装のテストを plugin 側で重複させない

手順:

- `shared/scripts/README.md` に public entrypoint、internal file、plugin-specific policy を置かない境界を記録する
- `shared/scripts/token-store/index.js` の module export を `createSecureTokenStore` だけに限定する
- `createSecureTokenStore` が返す facade を、plugin production code が使う次の操作だけに限定する:
  - `describeTokenStore`
  - `readTokenRecord`
  - `writeTokenRecord`
  - `deleteTokenRecord`
- `isWsl`、`decodeKeychainPayload`、`execFileWithInput`、`resolveWindowsHelperPath`、`detectTokenStore` は internal helper として扱う
- macOS / Windows / WSL の adapter 詳細テストを shared tests に集約する
- Google Drive / Slack の token-store tests は、plugin 固有設定、vendored helper path、public facade の接続確認に限定する
- shared source を Google Drive / Slack の vendored `_shared` へ同期する

検証:

```sh
node tools/sync-shared.js --check
node --test shared/test/*.test.js
node --test plugins/google-drive/scripts/test/*.test.js
node --test plugins/slack/scripts/test/*.test.js
rg -n "require\\(.*token-store/(mac-keychain|windows-credential-manager)" plugins/google-drive plugins/slack
rg -n "\\b(isWsl|decodeKeychainPayload|execFileWithInput|resolveWindowsHelperPath|detectTokenStore)\\b" plugins/google-drive/scripts plugins/slack/scripts --glob "*.js" --glob "!**/_shared/**" --glob "!**/test/**"
```

### Phase C: final audit

目的:

- 最終状態だけが同期済みであることを確認する
- 旧 flat path が active code / tests / vendored copy に残っていないことを確認する
- `sync-shared.js` が移行知識を持っておらず、変更されていないことを維持する

確認項目:

- root `shared/scripts` に旧 flat files が残っていない
- Google Drive / Slack の vendored `_shared` に旧 flat files が残っていない
- plugin production code に旧 flat `_shared` import が残っていない
- plugin tests に旧 flat `_shared` path assertion が残っていない
- `token-store` の public export が `createSecureTokenStore` だけである
- plugin production code が token-store の internal helper を参照していない
- plugin tests が shared adapter の詳細テストを重複していない
- `node tools/sync-shared.js --check` が通る
- `tools/sync-shared.js` に差分がない

検証:

```sh
node tools/sync-shared.js --check
node --test shared/test/*.test.js
node --test plugins/google-drive/scripts/test/*.test.js
node --test plugins/slack/scripts/test/*.test.js
rg -n "_shared/(oauth-pkce|oauth-callback|oauth-http|token-refresh|secure-token-store|secure-token-store-mac|secure-token-store-windows|windows-credential\\.ps1)" plugins/google-drive plugins/slack
find shared/scripts -maxdepth 3 -type f | sort
find plugins/google-drive/scripts/_shared -maxdepth 3 -type f | sort
find plugins/slack/scripts/_shared -maxdepth 3 -type f | sort
```

## テスト計画

各 phase 後に最低限実行する:

```sh
node --test shared/test/*.test.js
node --test plugins/google-drive/scripts/test/*.test.js
node --test plugins/slack/scripts/test/*.test.js
node tools/sync-shared.js --check
git diff --check -- shared plugins/google-drive/scripts plugins/slack/scripts tools plans .codex/tasks/todo.md
rg -n "[ \t]+$" shared plugins/google-drive/scripts plugins/slack/scripts tools plans .codex/tasks/todo.md
```

`plugins/google-drive/scripts/_shared` または `plugins/slack/scripts/_shared` を変更するのは、最終 layout を反映するタイミングに限定する。中間状態の同期は行わず、最後に `node tools/sync-shared.js --check` で shared source と vendored copy の同一性を確認する。

## リスク

- vendored `_shared` の stale file が残り、古い path が使われ続ける
  - 対策: atomic switch 内で旧 flat files を `trash` で削除し、final audit で `sync-shared.js --check` と旧 path `rg` を必須にする
- `sync-shared.js` が stale file の削除を自動実行しないため、cleanup 時に手順が増える
  - 対策: sync tool は今のまま同一性チェックとコピーだけに限定し、旧 file 削除は計画手順として `trash` で行う
- shared に plugin-specific policy が流入する
  - 対策: allowedDomains / allowedFolderIds / allowed_team_ids / user-facing command help は shared 対象外として明記する
- public API と internal helper の切り分けでテストが書きづらくなる
  - 対策: test support として必要な helper export は残すが、plugin production code からは `token-store/index.js` を経由する
- Google Drive / Slack の両 plugin に同時影響する
  - 対策: baseline audit を取ってから atomic switch と final audit に分け、同期スクリプトに中間状態の知識を入れない
- `sync-shared.js` をついでに直して変更範囲が広がる
  - 対策: この計画では `tools/sync-shared.js` を対象外にし、既存の再帰コピー / stale 検出だけを使う

## レビューチェックリスト

- [x] `shared/scripts` が `oauth/`、`token/`、`token-store/` に分かれている
- [x] Google Drive / Slack の vendored `_shared` が shared source と同期している
- [x] plugin production code が旧 flat `_shared` path を import していない
- [x] `token-store/index.js` が public facade として使われている
- [x] OS 固有 adapter は plugin production code から直接 import されていない
- [x] `windows-credential.ps1` が `token-store/` 配下にある
- [x] plugin-specific policy / settings / command contract が shared に入っていない
- [x] `node tools/sync-shared.js --check` が通る
- [x] `tools/sync-shared.js` に差分がない
- [x] shared / Google Drive / Slack の tests が通る
