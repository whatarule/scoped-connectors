# Token Record は OS secure store のみに保存し、ファイル・環境変数を受け付けない

全プラグイン(slack / google-drive)の Token Record は OS secure store(macOS Keychain / Windows Credential Manager)にのみ保存し、平文ファイル保存と token 用環境変数(`GOOGLE_DRIVE_ACCESS_TOKEN` 等)によるオーバーライドは提供しない。環境変数 token は一見便利だが、ドメイン許可リスト・scope 検証・自動 refresh をすべてバイパスする抜け道になるため、利便性より「保存時の関所を必ず通る」ことを優先した。

## Consequences

- Token Store を読むスクリプトはすべて sandbox 外実行が必要になる(各 SKILL.md / SETUP.md に手順を記載)
- 対応 OS は secure store を実装したものに限られる(現状 darwin / win32 / WSL。素の Linux は非対応)
- CI などの headless 環境でこれらのプラグインは動かせない。必要になったらこの ADR を見直す
