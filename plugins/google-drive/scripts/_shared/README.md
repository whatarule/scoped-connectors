# shared scripts

`shared/scripts` は、`tools/sync-shared.js` によって各 plugin の `scripts/_shared` ディレクトリへ vendored copy される script helper の編集元です。

## 公開入口

plugin code は次の entrypoint に依存します。

- `oauth/pkce`: PKCE verifier、challenge、state helper。
- `oauth/callback`: OAuth callback validation helper。
- `oauth/http`: OAuth form POST helper。
- `token/refresh`: token expiry と refresh race helper。
- `token-store`: secure token store facade。

token storage では、`token-store` の module export を `createSecureTokenStore` だけに限定します。plugin code はこれを plugin-local な token-store module で包み、生成された `describeTokenStore`、`readTokenRecord`、`writeTokenRecord`、`deleteTokenRecord` を feature code から使います。

## 内部ファイル

plugin code は次のファイルを直接 import しません。

- `token-store/mac-keychain`
- `token-store/windows-credential-manager`

OS 固有の token-store adapter へ依存してよいのは `token-store/index.js` だけです。

`isWsl`、`decodeKeychainPayload`、`execFileWithInput`、`resolveWindowsHelperPath`、`detectTokenStore` は内部実装です。shared tests は所有元の adapter を直接テストできますが、plugin code と plugin tests はこれらを公開 API として扱いません。

`token-store/windows-credential.ps1` は Windows Credential Manager adapter が使う実行 helper です。plugin wrapper は vendored path を `createSecureTokenStore` に渡せますが、この helper を直接 shell out しません。

## 境界

shared helper には plugin-specific な policy、settings、validation、scopes、allowlists、CLI help、user-facing command contract を含めません。それらは各 plugin 側に置きます。
