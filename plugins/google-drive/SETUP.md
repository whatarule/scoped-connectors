# Google Drive プラグイン セットアップ

## 1. プラグインのインストール

```sh
# Claude Code
claude plugin install google-drive@scoped-connectors

# Codex
# Codex セッション内で /plugins から google-drive をインストール
```

## 2. Google Drive API と OAuth Client ID の準備

Google Cloud プロジェクトで Google Drive API を有効化してください。

Drive 上のファイル内容、Activity 履歴、Labels を参照できる、ユーザー OAuth の読み取り専用 scope で認証します。

| スコープ | 用途 |
|---|---|
| `https://www.googleapis.com/auth/drive.readonly` | Drive 上の全ファイルの表示とダウンロード |
| `https://www.googleapis.com/auth/drive.activity.readonly` | Drive Activity 履歴の読み取り |
| `https://www.googleapis.com/auth/drive.labels.readonly` | Drive Labels 定義の読み取り |

これらは読み取り専用ですが、Google の分類では restricted / sensitive scope を含みます。
個人利用やテストユーザーでの検証はできますが、公開配布する場合は Google の verification が必要になることがあります。

Google Cloud Console で OAuth Client ID を作成し、Desktop app 用の JSON をダウンロードしてください。

## 3. 認証

### OAuth login を使う場合

ローカルで次を実行し、Drive 読み取り専用 scope の token を作成します。

```sh
node plugins/google-drive/scripts/oauth-login.js \
  --client-secret ~/.config/drive-api/client_secret.json
```

表示された URL をブラウザで開いて許可してください。
token はデフォルトで `~/.config/drive-api/token.json` に保存されます。

このプラグインは `gcloud auth application-default login` を使いません。
現在の gcloud ADC は `cloud-platform` scope も要求するため、Drive の参照権限だけに絞れないためです。

### access token を直接渡す場合

短命の OAuth access token をセッション単位で渡します。

```sh
export GOOGLE_DRIVE_ACCESS_TOKEN=ya29.xxxxx
```

永続的なシェル設定やエージェント設定ファイルに access token を保存することは推奨しません。
漏えい時は Google 側で token を revoke し、認証をやり直してください。

### Service Account を使う場合

Service Account は、そのままでは個人の My Drive にアクセスできません。
共有済みファイルだけを対象にする、または組織側で Domain-wide delegation を設定する必要があります。
最初の接続確認ではユーザー OAuth を推奨します。

## 4. 接続確認

```sh
node plugins/google-drive/scripts/check-connection.js
```

成功すると、認証元と Drive ユーザー情報だけを表示します。access token は表示しません。

## 5. 許可フォルダの設定（必須）

このプラグインは、許可したフォルダの配下にあるファイルだけを参照できます。
未設定のままではファイルの読み取りはできません（接続確認だけが動きます）。

`~/.config/drive-api/config.json` に、参照を許可するフォルダの ID を設定してください。

```json
{
  "allowedFolderIds": ["1AbCdEfGhIjKlMnOpQrStUvWxYz12345"]
}
```

- フォルダ ID は、Drive でフォルダを開いたときの URL `https://drive.google.com/drive/folders/<この部分>` です
- 複数指定できます。各フォルダの**配下すべて**（サブフォルダ以下も含む）が対象になります
- 許可フォルダの配下と確認できないファイル（共有アイテム等、親フォルダを判定できないもの）は読み取りを拒否します
- 設定ファイルのパスは `GOOGLE_DRIVE_CONFIG_PATH` 環境変数で変更できます

> **注意**: これはプラグインのスクリプト層で参照範囲を絞る仕組みです。OAuth token 自体は
> `drive.readonly` scope で Drive 全体を読めるため、プラグインを経由しない API 直接アクセスまでは制限できません。

## 6. サンドボックスのネットワーク許可

サンドボックス内の Bash はネットワークが遮断されるため、Google Drive API への接続許可を必ず設定してください。

### Claude Code の場合

`~/.claude/settings.json`（またはプロジェクトの `.claude/settings.json`）に googleapis.com への接続許可を追加してください。

```json
{
  "sandbox": {
    "network": {
      "allowedDomains": ["googleapis.com", "*.googleapis.com"]
    }
  }
}
```

設定後は Claude Code を再起動してください。初回アクセス時に一度だけ許可を求められ、以後はサンドボックス内から直接接続できます。

### Codex の場合

Codex CLI **0.131.0 以降**が必要です。

デフォルトの `workspace-write` サンドボックスはネットワークを遮断します。
`network_access = true` だけでは全ドメインに開放されてしまうため、必ず `network_proxy` の domains allowlist とセットで設定してください。

```toml
# ~/.codex/config.toml
[sandbox_workspace_write]
network_access = true

[features.network_proxy]
enabled = true
domains = { "**.googleapis.com" = "allow" }
```

- `**.googleapis.com` は googleapis.com 本体とサブドメインの両方を許可します（`*.` はサブドメインのみ）
- `network_proxy` は experimental 機能のため、`enabled = true` での明示的な opt-in が必要です
- 設定後は Codex セッションを再起動してください

## 参考: プラグインの更新

### Claude Code

```sh
claude plugin update google-drive@scoped-connectors
```

更新後は Claude Code を再起動してください。

### Codex

Codex は marketplace snapshot を更新してから、プラグインを入れ直します。

```sh
codex plugin marketplace upgrade scoped-connectors
codex plugin remove google-drive@scoped-connectors
codex plugin add google-drive@scoped-connectors
```

更新後は Codex セッションを再起動してください。
