# google-drive は Desktop app client + client_secret を使う(secret-less は不成立)

client_secret を完全に排除する構成を検討したが、Google の現行制約では CLI で成立しない。loopback redirect が使えるのは Desktop app タイプのみで、その token endpoint は PKCE を使っていても client_secret を要求する(E2E で `client_secret is missing` を確認)。secret 不要な iOS / Android タイプは loopback redirect が deprecated、custom URI scheme は全面廃止、device flow(TV タイプ)は restricted scope の `drive.readonly` が使えない。よって Desktop app + client_secret を採用する。

## Consequences

- この client_secret は Google 分類上「秘匿値ではない」(installed app の形式的な身元表明)。code 横取り防止は PKCE が担保する
- 保存先は OS secure store 内の Token Record のみ(login 時の対話入力で受け取る。受け渡し方法の決定は ADR-0004)
- スクリプトは client_secret がある場合だけ送信する実装のため、将来 Google が Desktop タイプでも secret 不要にした場合は入力を空にするだけで移行できる
