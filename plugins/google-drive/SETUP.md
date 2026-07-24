# Google Drive プラグイン セットアップ

この手順は通常ユーザー向けです。
初回セットアップとして、番号付きの手順を順に実施してください。
Google Cloud 側の管理については [管理者向けセットアップ](ADMIN_SETUP.md) を参照してください。

## 1. プラグインのインストール

```sh
# Claude Code
claude plugin install google-drive@scoped-connectors

# Codex
# Codex セッション内で /plugins から google-drive をインストール
```

## 2. 設定ファイルの作成

認証前に `~/.config/drive-api/config.json` を作成してください。
このファイルで設定が必要なのは、読み取りを許可する `allowedFolderIds` だけです。
ここで許可フォルダも設定します。
secret 類はこのファイルに書きません。
既存の `config.json` がある場合は上書きせず、不足しているキーを追記してください。

```sh
mkdir -p ~/.config/drive-api
chmod 700 ~/.config/drive-api
$EDITOR ~/.config/drive-api/config.json
chmod 600 ~/.config/drive-api/config.json
```

通常構成では、次の形で作成します。

```json
{
  "allowedFolderIds": [
    "1AbCdEfGhIjKlMnOpQrStUvWxYz12345",
    "1ZyXwVuTsRqPoNmLkJiHgFeDcBa67890"
  ]
}
```

- `allowedFolderIds` はファイル読み取りを許可する Drive フォルダ ID です。未設定または空配列のままでは読み取りコマンドは失敗します。
- フォルダ ID は、Drive でフォルダを開いたときの URL `https://drive.google.com/drive/folders/<この部分>` です。
- 複数指定できます。各フォルダの**配下すべて**（サブフォルダ以下も含む）が対象になります。
- 許可フォルダの配下と確認できないファイル（共有アイテム等、親フォルダを判定できないもの）は読み取りを拒否します。

これ以外の設定(許可ドメイン・OAuth client・設定パスの変更)には既定値が同梱されており、通常は不要です。変更する場合は「参考: 設定の上書き」を参照してください。

> **注意**: 許可フォルダと allowedDomains は、このプラグインを使うときのガードレールです。
> 詳細な権限境界は [管理者向けセットアップ](ADMIN_SETUP.md) を参照してください。

## 3. 認証

このプラグインのスキル `/google-drive-auth` または `/google-drive-auth login` を実行します。
`/google-drive-auth` は引数なしで login として動作します。

login は client secret の対話入力に TTY が必要なため、エージェント経由の実行は「TTY のあるターミナルで実行してください」エラーになります。
その際エージェントが**フルパス付きの実行コマンドを提示する**ので、それをコピーして自分のターミナルで実行してください。

```sh
# エージェントが提示するコマンドの形(パスは環境ごとに異なる)
node <プラグインのインストールパス>/scripts/auth.js login
```

インストールパスを自分で確認する場合は `~/.claude/plugins/installed_plugins.json` の `installPath` を参照してください
(このリポジトリを直接 checkout している場合は `node plugins/google-drive/scripts/auth.js login` で実行できます)。

最初に client secret の対話入力を求められます(値は社内の秘密情報共有先から取得。入力は表示されません)。
続いて表示された URL をブラウザで開いて許可してください。
token record は macOS Keychain または Windows Credential Manager に保存されます。
Windows native と WSL では同じ Windows Credential Manager target `scoped-connectors/google-drive/default` を使います。
WSL では `wslpath` と `powershell.exe` が必要です。
file store と token 用環境変数は使いません。
access token の期限が切れても自動で refresh されます。

token 保存前に `about.get` で取得したアカウントのメールドメインを許可ドメイン
（既定: `compass-e.com`）と照合し、一致しない token は保存を拒否します。
これは token 保存前のポリシー確認であり、Google Workspace の共有境界や管理者ポリシーそのものを保証するものではありません。
Google の許可画面で拒否される場合は、管理者に確認してください。

## 4. コマンド実行許可の設定

このプラグインは token の保存・読み取りに OS secure store を使います。
Claude Code / Codex では OS secure store の保存・読み取りが sandbox 内で失敗します。
このプラグインの skill（`auth.js` と `read.js`）は sandbox 外でスクリプトを実行する前提です。
初回実行時に sandbox 外実行の承認を求められたら許可してください。

### Claude Code の場合

Keychain / Credential Manager を使うコマンドは sandbox 外実行が必要です。
一時的に実行するだけなら Bash tool の `dangerouslyDisableSandbox` でも回避できます。
継続利用で承認を省略したい場合だけ、プロジェクトまたはユーザーの設定ファイルに次の2つを設定してください。

- `sandbox.excludedCommands`: 登録したコマンドは常に sandbox 外で実行されます。sandbox 内で一度失敗してから再試行する無駄がなくなります。
- `permissions.allow`: sandbox 外実行も通常の permission フローを通るため、`Bash(...)` ルールを併せて設定すると承認プロンプトを省略できます。

どちらのパターンも、このプラグインの実際のインストールパスを自分で確認して絶対パスで書いてください。
インストールパスは `~/.claude/plugins/installed_plugins.json` の `installPath` で確認できます。バージョンのディレクトリ部分だけ `*` にします。
`*/plugins/google-drive/scripts/*` のような前方ワイルドカードは、同名のディレクトリ構造を持つ任意のリポジトリのスクリプトまで sandbox 外・承認なしで実行できてしまうため使わないでください。

### Codex の場合

Keychain / Credential Manager を使うコマンドは sandbox 外実行が必要です。
各 `SKILL.md` は `sandbox_permissions: "require_escalated"` と script ごとの `prefix_rule` を使うように記載しています。

初回承認時に prefix rule を保存すると、同じ script の次回以降の実行で承認を省略しやすくなります。
対象 script は `auth.js`、`read.js` です。

## 参考: 設定の上書き

いずれも既定値が同梱されており、通常構成では設定不要です。

**許可ドメイン(allowedDomains)** — 既定: `compass-e.com`(完全一致。サブドメインは別ドメイン扱い)

```json
{
  "allowedDomains": ["compass-e.com", "example.com"]
}
```

`~/.config/drive-api/config.json` の `allowedDomains`、または `GOOGLE_DRIVE_ALLOWED_DOMAINS`(カンマ区切り)で上書きできます。

**OAuth client** — 既定: 同梱の共有 client_id(compass-e.com の内部アプリ)

別の Google Cloud プロジェクトの client を使う場合だけ、`config.json` の `clientId`、`GOOGLE_DRIVE_CLIENT_ID`、または `--client-id` で指定します。client secret は同じく login 時の対話入力です。client の作成・管理は [管理者向けセットアップ](ADMIN_SETUP.md) を参照してください。

**設定ファイルのパス** — 既定: `~/.config/drive-api/config.json`

`GOOGLE_DRIVE_CONFIG_PATH` 環境変数で変更できます。

## 参考: 状態確認・ログアウト

以降のコマンド例はリポジトリを直接 checkout している場合のパスです。
インストール環境ではスキル(`/google-drive-auth status` 等)を使うか、§3 の方法でフルパスに読み替えてください。

```sh
node plugins/google-drive/scripts/auth.js status
node plugins/google-drive/scripts/auth.js clear
```

`status` は保存状態と `about.get` の live check 結果を表示します。access token は表示しません。
`clear` は OS secure store の token record だけを削除します。Google 側の token revoke は行いません。
無効化するには https://myaccount.google.com/permissions からアクセス権を削除してください。

## 参考: 実 Drive smoke

実認証、OS secure store、実 Drive API の最小確認には `smoke.js` を使います。
この script も Keychain / Credential Manager を読むため sandbox 外で実行してください。

```sh
node plugins/google-drive/scripts/smoke.js
```

token が未保存の場合は、先に `/google-drive-auth` でログインするか、`smoke.js --login` を指定します。
`--login` は client secret の対話入力に TTY が必要なため、自分のターミナルで実行してください(エージェント経由では失敗します)。
Google の許可画面はブラウザで手動承認してください。

既定では auth status → about.get → フォルダ許可リスト → files.list(メタデータのみ)を確認し、ファイル内容は取得・出力しません。
フォルダ許可リストの関所を通した実読み取りまで確認する場合だけ `--file` を指定します(バイト数のみ表示し、内容は出力しません)。

```sh
node plugins/google-drive/scripts/smoke.js --file "https://docs.google.com/document/d/xxxx/edit"
```

Google token らしい文字列は出力時に伏せます。

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
