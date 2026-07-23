# Slack/Google Drive 共通認証基盤リファクタ

## Summary

Slack と Google Drive の認証系実装には、OS secure store、Windows Credential helper、OAuth PKCE、refresh race 対策などの重複がある。

まずは低リスクに段階化し、User-facing command と Token Record schema を変えずに、共通化してよい層だけ shared 化する。

- `token-store.js` と `windows-credential.ps1` はほぼ完全重複なので最優先で共通化する
- OAuth refresh / PKCE login は骨格だけ共通化し、provider 固有の検証は各 plugin 側に残す
- plugin cache は各 plugin ディレクトリ単位で配布される前提なので、runtime が repo root の shared code に直接依存しない形にする

## Key Changes

- 作業開始時に `.codex/tasks/todo.md` へ実装チェックリストを作る
- `shared/scripts` を shared source として追加する
- `tools/sync-shared.js` を追加し、shared source を各 plugin の `scripts/_shared` に vendoring する
- `tools/sync-shared.js --check` で shared source と vendored copy の同期漏れを検出できるようにする
- Slack / Google Drive の `scripts/token-store.js` は薄い wrapper にし、`createSecureTokenStore({ service, account, displayName, windowsHelperPath })` を使う
- `shared/scripts/secure-token-store.js` は OS 判定と facade に寄せ、OS 固有の処理は adapter ファイルへ分ける
  - `shared/scripts/secure-token-store-mac.js`: macOS Keychain の read/write/delete と `security find-generic-password -w` の hex decode を担当する
  - `shared/scripts/secure-token-store-windows.js`: Windows Credential Manager、`powershell.exe` helper 呼び出し、WSL bridge 用の `wslpath` 変換を担当する
  - macOS 側のファイル名は `secure-token-store-keychain.js` ではなく `secure-token-store-mac.js` にする。分割軸を OS adapter として揃え、Keychain は macOS adapter 内の実装詳細として扱う
- `scripts/auth.js` は refresh 判定、race recovery、record changed 判定、HTTP refresh 呼び出しの共通 helper を使う
- `scripts/oauth-login.js` は `base64Url`、PKCE pair、state、callback validation、form token exchange helper を共通化する
- Slack API client と Drive API client の `common.js` は今回まとめない。API の paging/error/retry/formatting が違うため、ここまで共通化すると抽象化が重くなる

## Provider-Specific Behavior To Keep

- Slack 固有:
  - `team_id` allowlist
  - guest user 拒否
  - Slack token response の `ok` 判定
  - Slack scope の `,` / whitespace 正規化
  - refresh response で新しい `refresh_token` が必須
  - `invalid_refresh_token` / `token_expired` の reauth handling
- Google Drive 固有:
  - `allowedDomains` による保存前ドメイン照合
  - `client_secret` の対話入力と Token Record 保存
  - Google readonly scopes の検証
  - refresh response で `refresh_token` が返らない場合は既存値を維持
  - `invalid_grant` の reauth handling
  - refresh 後の `assertRequiredScopes`

## Public/Internal Interfaces

- User-facing commands は変更しない:
  - `slack-auth login/status/clear`
  - `google-drive-auth login/status/clear`
  - 既存 read/search/history 系コマンド
- Token Record schema と secure store key は変更しない
- 新規 internal API:
  - `createSecureTokenStore(config)`
  - refresh manager helper
  - PKCE / OAuth form helper
- `createSecureTokenStore(config)` の戻り値と plugin wrapper の export は互換維持する。既存テストが参照する `detectTokenStore` / `describeTokenStore` / `readTokenRecord` / `writeTokenRecord` / `deleteTokenRecord` は facade から引き続き到達できるようにする
- generated vendored files は直接編集禁止にする。編集対象は `shared/scripts` と provider wrapper のみに寄せる

## Test Plan

事前・事後で以下を実行する。

```bash
node --test plugins/slack/scripts/test/*.test.js
node --test plugins/google-drive/scripts/test/*.test.js
node tools/sync-shared.js --check
```

追加・維持する検証:

- shared module 自体の unit test を追加し、facade の OS dispatch、macOS adapter の Keychain/hex decode、Windows adapter の Credential Manager/WSL bridge、missing record、write/delete を provider 非依存で検証する
- provider wrapper tests では `SERVICE`、error message、Slack/Google 固有 refresh 挙動、scope 検証が維持されることを確認する
- token / client secret が stdout/stderr/error message に出ない既存テストを維持する
- 既存 baseline:
  - Slack: `node --test plugins/slack/scripts/test/*.test.js` が 121 tests pass
  - Google Drive: `node --test plugins/google-drive/scripts/test/*.test.js` が 143 tests pass

## Assumptions

- 低リスク段階化を採用する
- repo 上の完全な runtime shared require ではなく、root の `shared/scripts` + plugin-local vendored copy + sync check で配布境界を守る
- 既存の未コミット差分は維持し、無関係な変更や削除を戻さない
- 今回の計画では API client 層の統合は対象外にする
