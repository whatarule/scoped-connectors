# Google Drive scripts feature-first レイアウト計画

## 背景

Google Drive scripts は、ツール仕様 / 設定解決 / ポリシー検証 / ユースケース / Provider Adapter / Presenter へ責務分離した結果、責務境界自体は読みやすくなった。

一方で、ファイルとディレクトリの命名粒度はまだ揃っていない。

現状の揺れ:

- `read/contract.js`, `read/use-case.js`, `read/presenter.js`
  - 機能ディレクトリ配下に層名を置いている
- `policy/google-login.js`, `policy/google-read.js`
  - 層ディレクトリ配下に provider / 機能名を置いている
- `settings/google-drive.js`
  - 層ディレクトリ配下に plugin 全体名を置いている
- `allowlist.js`
  - 機能名でも層名でもなく、設定概念名になっている
- `common.js`
  - 実態は Drive API HTTP runtime だが、名前が広すぎる
- `auth.js`, `oauth-login.js`, `google-drive-auth.js`
  - すべて auth に見えるが、token runtime / OAuth login / user-facing auth CLI で粒度が違う
- `read.js` と `google-drive-auth.js`
  - root script path とユーザー表示 command 名が混ざっている。`scripts/` 直下の実ファイルは `auth.js` / `read.js` で自明だが、ユーザーに見せる command 名は provider 名込みの `google-drive-auth` を維持する

この計画では、A案の feature-first レイアウトに寄せ、読者が「どの機能の責務か」を先に把握できるようにする。

## 目的

- Google Drive scripts のディレクトリ粒度を feature-first に揃える
- root script file の canonical 入口を `auth.js` / `read.js` に揃える
- ユーザー向けに表示する command 名は provider 名込みの `google-drive-auth` を維持する
- feature 内部の CLI 実装は `auth/cli.js` / `read/cli.js` に置く
- `read` と `auth` それぞれの中に contract / use-case / policy / presenter / adapter を配置する
- `policy/` や `settings/` のような layer-first ディレクトリを Google Drive plugin 内では縮小または廃止する
- 既存 CLI 入口、skill 実行パス、ユーザー向けコマンドは壊さない
- rename / rehome を段階化し、各段階でテスト可能にする
- `shared/scripts` と vendored `_shared/` には触らない

## 対象外

- Google Sheets 複数シート対応
- Slack 側の同時レイアウト変更
- OAuth flow、token record shape、scope、allowedDomains、allowedFolderIds の仕様変更
- `shared/scripts` への抽象化追加
- plugin cache への同期
- 既存 public CLI ファイルの即時削除

## 目標レイアウト

最終形の候補:

```text
plugins/google-drive/scripts/
  auth.js                     # canonical auth script entrypoint
  read.js                     # canonical read script entrypoint
  smoke.js                    # smoke diagnostic CLI

  auth/
    cli.js                    # auth CLI 実装: login/status/clear の routing と表示整形
    oauth-login.js            # OAuth login flow の use-case
    login-policy.js           # login 時の scope / domain policy
    token-runtime.js          # token record 検証、refresh、access token 取得
    token-store.js            # Google Drive secure token store の wrapper
    secret-input.js           # client secret の非表示入力

  read/
    cli.js                    # read CLI 実装
    contract.js               # ユーザー向け read command contract と read plan
    use-case.js               # read orchestration
    presenter.js              # stdout / file output
    access-policy.js          # allowedFolderIds ancestor traversal policy
    access-control.js         # settings + Drive parent adapter + access-policy 呼び出し

  providers/
    drive-http.js             # 低レベル Drive API HTTP runtime
    drive-files.js            # read / smoke が使う Drive files 操作

  settings/
    config.js                 # Google Drive config 読み込みと設定解決

  _shared/                    # vendored runtime helper。変更しない
```

canonical root script file として残すもの:

- `scripts/auth.js`
- `scripts/read.js`

ユーザー向けに表示する command 名:

- `google-drive-auth`

移行中だけ一時互換入口として残すもの:

- `scripts/google-drive-auth.js`

`google-drive-auth.js` は既存の直接 script path / 承認済み prefix rule の互換のために残す。
ただし canonical script file は `auth.js` とし、フェーズFで script path 参照を消した後に `google-drive-auth.js` も削除する。
ユーザーに表示する command 名は、`google-drive-auth.js` ファイル削除後も `google-drive-auth` のままにする。

## 現行ファイルと移動先

| 現行 | 移動先 | 補足 |
| --- | --- | --- |
| `google-drive-auth.js` | `auth.js` + `google-drive-auth.js` + `auth/cli.js` | root `auth.js` を canonical script wrapper とし、`google-drive-auth.js` は移行中のみ互換 wrapper として残す。実装は `auth/cli.js` へ移し、フェーズFで `google-drive-auth.js` を削除する。表示 command 名は `google-drive-auth` を維持する。 |
| `oauth-login.js` | `auth/oauth-login.js` | tests / internal imports が残る間は、旧 root `oauth-login.js` を一時互換の再exportファイルとして残す。 |
| `policy/google-login.js` | `auth/login-policy.js` | login policy は auth feature 配下に置く。 |
| `auth.js` | `auth/token-runtime.js` + `auth.js` | 現行 `auth.js` は token runtime なので `auth/token-runtime.js` へ移し、root `auth.js` は canonical auth CLI に空ける。 |
| `token-store.js` | `auth/token-store.js` | 互換のため旧 root wrapper を一時的に残す。 |
| `secret-input.js` | `auth/secret-input.js` | secret input は auth feature の IO として扱う。 |
| `read.js` | `read.js` + `read/cli.js` | root `read.js` は canonical CLI のまま残し、実装だけを `read/cli.js` へ移す。 |
| `read/contract.js` | `read/contract.js` | すでに適切。 |
| `read/use-case.js` | `read/use-case.js` | すでに適切。 |
| `read/presenter.js` | `read/presenter.js` | すでに適切。 |
| `policy/google-read.js` | `read/access-policy.js` | read access policy は read feature 配下に置く。 |
| `allowlist.js` | `read/access-control.js` | settings + Drive parents + access policy をつなぐ adapter として扱う。 |
| `common.js` | `providers/drive-http.js` | 低レベル Drive API runtime。広すぎる `common` から改名する。 |
| `providers/drive-client.js` | `providers/drive-files.js` | read 向けの Drive files 操作として名前を具体化する。 |
| `settings/google-drive.js` | `settings/config.js` | plugin 内なので provider 名は冗長。config resolver として名前を寄せる。 |
| `smoke.js` | `smoke.js` | root diagnostic CLI として維持する。必要に応じて feature modules を import する。 |
| `_shared/*` | `_shared/*` | vendored runtime helper。変更しない。 |

## 命名ルール

- root file は script entrypoint または互換 wrapper に限定する。
- canonical root script file は、Google Drive plugin の `scripts/` 配下で自明な短い名前にする: `auth.js`, `read.js`。
- ユーザーに表示する command 名は provider 名込みにする: `google-drive-auth`。
- provider 名込みの旧 root script file は互換期間だけ残し、新しい docs / skill / internal imports からは参照しない。
- feature directory は、利用者と保守者が認識しやすい名詞にする: `auth/`, `read/`。
- feature directory 内の file name は、その feature scope 内での役割を表す: `cli.js`, `use-case.js`, `contract.js`, `presenter.js`, `login-policy.js`, `access-policy.js`。
- `providers/` には feature 名ではなく、API surface / runtime 名を置く: `drive-http.js`, `drive-files.js`。
- Google Drive plugin 内では、API surface の区別に必要な場合を除き provider 名を繰り返さない。
- `common.js`, `auth.js`, `client.js` のような広い名前は、より狭い名前がある場合は避ける。
  - 例外として root `auth.js` は script entrypoint 名としてのみ使い、token runtime には使わない。

## 依存方向

許可する依存:

```text
canonical root script file -> feature/cli
legacy root script wrapper -> canonical root script file または feature/cli
feature/cli -> feature/contract/use-case/presenter
feature/use-case -> feature policy/control + provider adapter
feature access-control -> settings/config + read/access-policy + provider shape
provider adapter -> provider HTTP runtime
provider HTTP runtime -> auth/token-runtime
auth/token-runtime -> auth/token-store + _shared runtime helpers
auth/oauth-login -> auth/login-policy + settings/config + auth/token-store + _shared OAuth helpers
```

避ける依存:

```text
policy -> provider HTTP/runtime
settings -> feature use-case
provider -> read/auth use-case
_shared -> plugin-specific policy/settings
root script wrapper -> 別の root script wrapper。ただし `google-drive-auth.js` から `auth.js` への旧互換委譲だけは移行中に許容する
```

## 段階計画

### フェーズ0: root auth/read script naming baseline

目的:

- root script file の正式名を `auth.js` / `read.js` に揃える
- 現行 `auth.js` の token runtime と、今後の root auth CLI 名の衝突を先に解消する
- `cli.js` は root の別名ではなく、feature 内部の CLI 実装ファイルとして残す
- ユーザーに表示する command 名は `google-drive-auth` のまま維持する

手順:

- 現行 `auth.js` の token runtime 実装を `auth/token-runtime.js` へ移す
- 現行 `google-drive-auth.js` の CLI 実装を `auth/cli.js` へ移す
- root `auth.js` を canonical auth script wrapper / 再export として追加する
- root `google-drive-auth.js` は旧互換 wrapper / 再export として移行中のみ残し、フェーズFで削除する
- root `read.js` は canonical read CLI として維持する。この phase では read CLI の別名ファイルは追加しない
- production import は token runtime が必要な場合は `auth/token-runtime` へ寄せる
- README / SETUP / skill のユーザー向け command 表示は `google-drive-auth` を維持する
- 直接 script path の実行例だけ、段階的に `auth.js` / `read.js` へ寄せる
- plugin cache への同期はこの計画の対象外。必要なら別作業で実施する

検証:

```sh
node --check plugins/google-drive/scripts/auth.js
node --check plugins/google-drive/scripts/google-drive-auth.js
node --check plugins/google-drive/scripts/auth/cli.js
node --check plugins/google-drive/scripts/auth/token-runtime.js
node --check plugins/google-drive/scripts/read.js
node --test plugins/google-drive/scripts/test/google-drive-auth.test.js plugins/google-drive/scripts/test/auth.test.js plugins/google-drive/scripts/test/read.test.js plugins/google-drive/scripts/test/smoke.test.js
node --test plugins/google-drive/scripts/test/*.test.js
```

### フェーズA: read access naming

目的:

- layer-first の `policy/google-read.js` をなくす
- 概念名だけの `allowlist.js` を read feature 配下へ寄せる
- read の挙動は変えない

手順:

- `policy/google-read.js` を `read/access-policy.js` へ移す
- `allowlist.js` を `read/access-control.js` へ移す
- root の `allowlist.js` は一時互換の再exportファイルとして残す:

```js
module.exports = require("./read/access-control");
```

- 新しい production import は `read/access-control` へ更新する
- 既存の `allowlist.js` tests は互換 tests として残すか、`read/access-control` 用の focused tests を追加する
- `MAX_ANCESTOR_DEPTH`, `loadAllowlist`, `verifyFileInAllowlist` の export 互換を維持する

検証:

```sh
node --check plugins/google-drive/scripts/read/access-policy.js
node --check plugins/google-drive/scripts/read/access-control.js
node --check plugins/google-drive/scripts/allowlist.js
node --test plugins/google-drive/scripts/test/google-read-policy.test.js plugins/google-drive/scripts/test/allowlist.test.js plugins/google-drive/scripts/test/read.test.js plugins/google-drive/scripts/test/smoke.test.js
node --test plugins/google-drive/scripts/test/*.test.js
```

### フェーズB: provider naming

目的:

- 広すぎる `common.js` を置き換える
- `drive-client.js` を操作対象が分かる `drive-files.js` へ改名する

手順:

- `common.js` を `providers/drive-http.js` へ移す
- root の `common.js` は一時互換の再exportファイルとして残す:

```js
module.exports = require("./providers/drive-http");
```

- `providers/drive-client.js` を `providers/drive-files.js` へ移す
- `providers/drive-client.js` は一時互換の再exportファイルとして残す:

```js
module.exports = require("./drive-files");
```

- production import を `providers/drive-http` と `providers/drive-files` へ更新する
- tests の import 更新は、production import が安定した後の別 commit または別 sub-step で行う

検証:

```sh
node --check plugins/google-drive/scripts/providers/drive-http.js
node --check plugins/google-drive/scripts/providers/drive-files.js
node --check plugins/google-drive/scripts/common.js
node --check plugins/google-drive/scripts/providers/drive-client.js
node --test plugins/google-drive/scripts/test/drive-client.test.js plugins/google-drive/scripts/test/read.test.js plugins/google-drive/scripts/test/smoke.test.js
node --test plugins/google-drive/scripts/test/*.test.js
```

### フェーズC: auth feature directory

目的:

- root level に散っている auth 系ファイルを feature-first レイアウトへ寄せる
- Phase 0 で作った `auth/cli.js` と `auth/token-runtime.js` へ、残りの auth 依存を寄せる

手順:

- `policy/google-login.js` を `auth/login-policy.js` へ移す
- `token-store.js` を `auth/token-store.js` へ移す
- `secret-input.js` を `auth/secret-input.js` へ移す
- `oauth-login.js` を `auth/oauth-login.js` へ移す
- root には canonical / 互換の再exportファイル / wrapper を残す:
  - `google-drive-auth.js` calls `auth.js` または `auth/cli.js`
  - `oauth-login.js` exports `auth/oauth-login.js`
  - `auth.js` calls `auth/cli.js`
  - `token-store.js` exports `auth/token-store.js`
  - `secret-input.js` exports `auth/secret-input.js`
- production import を新しい auth path へ更新する
- 初回移行では既存の exported function name をすべて維持する

検証:

```sh
node --check plugins/google-drive/scripts/auth/cli.js
node --check plugins/google-drive/scripts/auth/oauth-login.js
node --check plugins/google-drive/scripts/auth/login-policy.js
node --check plugins/google-drive/scripts/auth/token-runtime.js
node --check plugins/google-drive/scripts/auth/token-store.js
node --check plugins/google-drive/scripts/auth/secret-input.js
node --check plugins/google-drive/scripts/auth.js
node --check plugins/google-drive/scripts/google-drive-auth.js
node --check plugins/google-drive/scripts/oauth-login.js
node --test plugins/google-drive/scripts/test/google-drive-auth.test.js plugins/google-drive/scripts/test/oauth-login.test.js plugins/google-drive/scripts/test/auth.test.js plugins/google-drive/scripts/test/token-store.test.js plugins/google-drive/scripts/test/secret-input.test.js
node --test plugins/google-drive/scripts/test/*.test.js
```

### フェーズD: settings naming

目的:

- layer-first かつ provider 名付きの settings file を、plugin-local config 名へ置き換える

手順:

- `settings/google-drive.js` を `settings/config.js` へ移す
- `settings/google-drive.js` は一時互換の再exportファイルとして残す:

```js
module.exports = require("./config");
```

- production import を `settings/config` へ更新する
- 初回移行では既存の exported constants / functions をすべて維持する

検証:

```sh
node --check plugins/google-drive/scripts/settings/config.js
node --check plugins/google-drive/scripts/settings/google-drive.js
node --test plugins/google-drive/scripts/test/settings.test.js plugins/google-drive/scripts/test/oauth-login.test.js plugins/google-drive/scripts/test/allowlist.test.js
node --test plugins/google-drive/scripts/test/*.test.js
```

### フェーズE: read feature CLI implementation

目的:

- root の `read.js` を canonical 入口として維持する
- feature 側の実装は `read/cli.js` に置く

手順:

- root `read.js` の CLI 実装を `read/cli.js` へ移す
- root `read.js` は canonical CLI wrapper / 再export として残す
- 既存 export を維持する:
  - `USAGE`
  - `MAX_MEDIA_BYTES`
  - `DEFAULT_OUT_DIR`
  - `extractFileId`
  - `resolveReadPlan`
  - `sanitizeFileName`
  - `parseArgs`
  - `readDriveFile`

検証:

```sh
node --check plugins/google-drive/scripts/read.js
node --check plugins/google-drive/scripts/read/cli.js
node --test plugins/google-drive/scripts/test/read.test.js plugins/google-drive/scripts/test/smoke.test.js
node --test plugins/google-drive/scripts/test/*.test.js
```

### フェーズF: compatibility cleanup

目的:

- internal imports、tests、docs、skill が target path へ移行済みであることを確認してから、古い再exportファイルを削除する
- `google-drive-auth.js` も最終形には残さず、script path の `auth.js` への移行が完了したら削除する

この phase は次の条件を満たすまで開始しない:

- root script file が CLI / skill / docs 用だけに必要だと確認できている
- internal production code に次の import が残っていない:
  - `./google-drive-auth`
  - `./allowlist`
  - `./common`
  - `./auth` を token runtime として使う import
  - `./oauth-login`
  - `./token-store`
  - `./secret-input`
  - `./policy/google-login`
  - `./settings/google-drive`
  - `./providers/drive-client`
- tests が互換再exportを意図的に cover している、または新しい path を使っている
- README / SETUP / skill のユーザー向け command 表示が `google-drive-auth` を維持している
- 直接 script path / 承認済み prefix rule の参照が `auth.js` / `read.js` へ移行済みである

恒久的に残すもの:

- `auth.js`
- `read.js`

移行期間後に削除するもの:

- `google-drive-auth.js`
- `allowlist.js`
- `common.js`
- `oauth-login.js`
- `token-store.js`
- `secret-input.js`
- `policy/google-login.js`
- `settings/google-drive.js`
- `providers/drive-client.js`

削除する場合は `rm` ではなく `trash` を使う。

## テスト計画

各 phase 後に最低限実行するもの:

```sh
node --test plugins/google-drive/scripts/test/*.test.js
git diff --check -- .codex/tasks/todo.md plans/2026-07-24T1143-google-drive-feature-first-layout.md plugins/google-drive/scripts plugins/google-drive/scripts/test
rg -n "[ \t]+$" .codex/tasks/todo.md plans/2026-07-24T1143-google-drive-feature-first-layout.md plugins/google-drive/scripts plugins/google-drive/scripts/test
```

`_shared/` に意図的に触っていない場合、shared sync は不要。

もし `_shared/` または root `shared/scripts` に予期せず触れた場合:

```sh
node tools/sync-shared.js --check
```

## リスク

- rename churn によって挙動変更が見えづらくなる
  - 対策: 各 phase は基本的に move-only に寄せ、exports を維持し、phase ごとに Google Drive 全体 tests を実行する
- root CLI path は skills / docs から参照されている
  - 対策: root `auth.js` と `read.js` を canonical script file として残す。`google-drive-auth.js` は script path 参照が消えるまで互換 wrapper として残し、フェーズFで参照移行後に削除する。ユーザー向け command 名は `google-drive-auth` のまま維持する
- script file 名とユーザー表示 command 名を混同しやすい
  - 対策: help / error / README / skill は `google-drive-auth`、internal import / direct script path は `auth.js` / `auth/cli.js` / `auth/token-runtime.js` として分けて確認する
- 一時互換の再exportファイルが恒久的な clutter になる
  - 対策: フェーズFで cleanup 前に internal imports を明示的に audit する
- 現行 `auth.js` が token runtime なので、root auth CLI への改名時に衝突する
  - 対策: フェーズ0で token runtime を先に `auth/token-runtime.js` へ移し、root `auth.js` は CLI wrapper に限定する
- auth rename によって token-store imports が壊れる
  - 対策: auth feature は専用 phase で移動し、移行中は旧 root 再exportファイルを残す
- provider rename によって runtime と operation adapter の境界が曖昧になる
  - 対策: `drive-http.js` は低レベル、`drive-files.js` は操作 oriented として維持する

## レビューチェックリスト

- [ ] `scripts/read.js` が canonical read CLI として動作する
- [ ] `scripts/auth.js` が canonical auth script entrypoint として動作する
- [ ] `scripts/auth.js --help` のユーザー表示 command は `google-drive-auth` である
- [ ] `scripts/google-drive-auth.js` は移行中だけ旧互換 script path として動作し、フェーズFで削除されている
- [ ] Skill docs と README のユーザー向け command examples が `google-drive-auth` を指している
- [ ] 直接 script path examples は `auth.js` / `read.js` を指している
- [ ] 古い `google-drive-auth.js` 参照はすべて削除済みである
- [ ] `read` feature に read-specific な contract / use-case / presenter / access files が入っている
- [ ] `auth` feature に auth-specific な CLI / OAuth / policy / token files が入っている
- [ ] Provider files が API surface と abstraction level に沿って命名されている
- [ ] production imports で広い名前の `common.js` と token runtime としての root `auth.js` が使われていない
- [ ] 互換再exportファイルが意図的に test されている、またはフェーズFで削除されている
- [ ] `shared/scripts` と `_shared/` が変更されていない
