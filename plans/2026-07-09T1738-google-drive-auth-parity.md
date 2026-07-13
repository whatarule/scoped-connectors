# google-drive プラグイン認証を slack プラグインと同水準に引き上げる

## Context

google-drive プラグインの認証は slack プラグインと比べて以下のギャップがあった:

| 項目 | slack | google-drive(改修前) |
|---|---|---|
| トークン保存 | OS secure store(Keychain / Windows Credential Manager + WSL) | 平文ファイル `~/.config/drive-api/token.json` (0600) |
| スキル構成 | `/slack-auth login\|status\|clear` に統合 | login / check が別スキル、**clear なし** |
| status | auth.test ライブチェック + scope/expires_at 表示 | check はユーザー情報のみ |
| refresh 競合対策 | reloadFreshTokenAfterRefreshRace あり | なし |
| アカウント制限 | team_id allowlist + guest 拒否 | なし |
| smoke | smoke.js あり | なし |
| 認証系テスト | 5本 | ゼロ |

## 設計判断

- **Token Store は OS secure store のみ**(darwin: Keychain / win32: Credential Manager / WSL: `wslpath` ブリッジ)。slack の token-store.js と `windows-credential.ps1`(target をパラメータで受ける汎用実装)を移植。平文ファイル・token 用環境変数は廃止(`docs/adr/0001`)
  - E2E で発見: `security find-generic-password -w` は値に非 ASCII(日本語の表示名など)が含まれると hex で出力する。`decodeKeychainPayload` で対応(**slack にも同じ潜在バグがあり両方修正**)
- **統合スキル `/google-drive-auth`**(login / status / clear)。google-drive-login / google-drive-check は廃止。status は about.get ライブチェック + user/email/scope/expires_at 表示(token 値は非出力)。clear は revoke しない(myaccount.google.com への案内のみ)
- **refresh は 5 分窓 + 競合対策**(slack 同型)。Google 差分: refresh レスポンスで refresh_token が返らないのが正常(既存値維持)、`invalid_grant` を reauth エラーとして扱う
- **ドメイン許可リスト**: token 保存前に about.get のメールドメインを**完全一致**で照合(既定 `compass-e.com`、config / `GOOGLE_DRIVE_ALLOWED_DOMAINS` で上書き)。サブドメインは別ドメイン扱い
- **共有 OAuth client(compass-e.com の Internal アプリ、Desktop app タイプ)の client_id のみ同梱**(`DEFAULT_CLIENT_ID`)。Internal のため組織外は認可不可(`org_internal`)で、verification・テストステータスの7日失効もない
- **client secret はどこにも置かない**: リポジトリ(secret scanning → Google の漏洩対応で突然壊れるリスク)にも、ローカルのファイル・環境変数(平文 secret の廃止という本改修の趣旨と矛盾)にも置かない。**login 時の非表示対話入力**で受け取り、Token Record として OS secure store にのみ保存。refresh は record の値を使うため再入力不要(`docs/adr/0003`・`docs/adr/0004`)
  - Desktop app タイプは PKCE でも token endpoint が client_secret を要求する(E2E で確認。公式 docs の「Optional」注記は Android/iOS/Chrome のみが対象)。secret-less な client タイプは loopback redirect が使えず CLI では不成立
  - login は TTY 必須(エージェント sandbox 内・headless では実行不可。ユーザーのターミナルで実行)
- **移行スキャフォールドなし**: プラグイン未公開で移行対象ユーザーが存在しないため、旧 token.json の検出・案内・ドキュメントの移行節は作らない
- **バージョンは 0.3.0**(自身の plugin update 検知用)。公開時に slack と揃えて両方 1.0.0
- **検証**: ユニットテストは依存注入モックで全プラットフォーム、E2E は macOS のみ(Windows 実機なし)
- **ドキュメント分離**: SETUP.md はユーザー向け手順、OAuth client・scope・Google Cloud 管理は ADMIN_SETUP.md(管理者向け)へ
- 用語は `CONTEXT.md`(Token Record / Token Store / ドメイン許可リスト / フォルダ許可リスト)、決定は `docs/adr/0001`〜`0004` に記録

## Token Record スキーマ

SERVICE `"scoped-connectors/google-drive"`、ACCOUNT `"default"`(Windows target は `scoped-connectors/google-drive/default`):

```json
{
  "version": 1,
  "client_id": "...", "client_secret": "<login 時に対話入力した値。ここにのみ保存>",
  "user_email": "...@compass-e.com", "user_name": "...",
  "scope": "https://www.googleapis.com/auth/drive.readonly ...",
  "access_token": "...", "refresh_token": "...",
  "expires_at": 1234567890000,
  "token_type": "Bearer",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

## 変更ファイル一覧(as-built)

### 新規

1. `scripts/token-store.js` — slack 版の移植(darwin / win32 / WSL、hex デコード込み)
2. `scripts/windows-credential.ps1` — slack 版をそのままコピー(汎用実装)
3. `scripts/auth.js` — refresh・race 対策・scope 検証(`READONLY_SCOPES` / `assertRequiredScopes` は common.js から移設し一方向依存に)
4. `scripts/google-drive-auth.js` — login / status / clear 統合 CLI
5. `scripts/smoke.js` — auth status → about → フォルダ許可リスト → files.list(メタデータのみ)。`--file` で許可リストの関所を通した実読み取り(内容は非出力、token 文字列は redact)
6. `skills/google-drive-auth/SKILL.md`
7. テスト5本(token-store / auth / oauth-login / google-drive-auth / smoke)

### 変更

8. `scripts/oauth-login.js` — `DEFAULT_CLIENT_ID` 同梱、`promptHiddenInput`(echo なし・TTY 必須)、ドメイン許可リスト照合(`verifyTokenAuthorization`)、`validateGrantedScopes`、`buildTokenRecord` → secure store 保存。`--client-id` / config `clientId` / `GOOGLE_DRIVE_CLIENT_ID` で別 client を指定可。`--token-path` / `--client-json` / `--client-secret` / JSON・config・env での secret 指定は廃止
9. `scripts/common.js` — `getAccessToken()` を auth.js 経由に差し替え。ファイル・環境変数 token と client 関連定数を削除。401/403 ヒントを `/google-drive-auth` 案内に更新
10. `skills/google-drive-read/SKILL.md` — 認証を secure store ベースに書き換え + sandbox 外実行セクション追加
11. `.claude-plugin/plugin.json` / `.codex-plugin/plugin.json` — version 0.3.0
12. `README.md` / `SETUP.md` — ユーザー向け手順(config は `allowedDomains` + `allowedFolderIds` のみ、secret は対話入力)。管理者向けは ADMIN_SETUP.md へ分離
13. `plugins/slack/scripts/token-store.js` + test — hex デコードの潜在バグ修正(drive と同一根本原因)

### 削除

14. `scripts/check-connection.js`(status に統合)、`skills/google-drive-login/`、`skills/google-drive-check/`

## テスト

node:test + 依存注入。ネットワーク・secure store・TTY の実アクセスなし。
token 値・secret が出力・エラーメッセージに漏れないことを `doesNotMatch` で検証。
win32 / WSL パスはモックのみで担保(Windows 実機なし)。

## E2E 結果(macOS、2026-07-10)

1. login(同梱 client_id + secret 対話入力)→ Keychain 保存、email 表示 ✓
2. status → `live_check: about.get ok`、日本語表示名の hex デコード確認 ✓
3. smoke → PASS(allowlist 1 folder、list 2 files)✓
4. smoke `--file` → 許可リストの関所を通した実読み取り(18506 bytes、内容非出力)✓
5. 非 TTY での login → TTY 案内エラー ✓
6. clear は破壊的なためユニットテスト + ログイン前の実行(「保存されていません」表示)で担保

## 進め方

- drive ブランチに1コミット → main への PR(slack の PR #22 と同じ流れ)
- ローカルの旧 `token.json` / `client_secret.json` は削除済み

## リスク・注意点

- **read の sandbox 要件**: secure store 化により毎回の read が sandbox 外実行必須。SKILL.md / SETUP.md に `sandbox.excludedCommands` + `permissions.allow` の案内を記載済み
- **関所の限界**: ドメイン許可リストは保存時、フォルダ許可リストは参照時の関所であり、発行済み token の直接 API 利用までは制限できない(ドキュメントに明記済み)
- **login の TTY 必須化**: smoke `--login` を含め、secret 入力はユーザー本人のターミナル操作が必要
