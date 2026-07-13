# Google Drive プラグイン 管理者向けセットアップ

このドキュメントは OAuth client、scope、Google Cloud 側の管理を担当する管理者向けです。
通常ユーザーの初回利用手順は [SETUP.md](SETUP.md) を参照してください。

## 共有 OAuth client

このプラグインは共有の OAuth client_id（compass-e.com の内部アプリ、Desktop app タイプ）を同梱しています。
通常ユーザーは Google Cloud プロジェクトの作成、Google Drive API の有効化、OAuth client_id の作成を行いません。

client secret はリポジトリ、設定ファイル、環境変数、CLI 引数には置きません。
ユーザーが login 時に対話入力し、Token Record の一部として OS secure store にのみ保存します。
値は社内の秘密情報共有先で配布してください。

内部アプリのため、compass-e.com 組織外のアカウントは認可自体ができません（`org_internal`）。
組織の OAuth app access control で consent が拒否される場合は、この OAuth client と後述の scope を許可してください。

## 利用 scope

Drive 上のファイル内容、Activity 履歴、Labels を参照できる、ユーザー OAuth の読み取り専用 scope で認証します。

| スコープ | 用途 |
|---|---|
| `https://www.googleapis.com/auth/drive.readonly` | Drive 上の全ファイルの表示とダウンロード |
| `https://www.googleapis.com/auth/drive.activity.readonly` | Drive Activity 履歴の読み取り |
| `https://www.googleapis.com/auth/drive.labels.readonly` | Drive Labels 定義の読み取り |

これらは読み取り専用ですが、Google の分類では restricted / sensitive scope を含みます。
内部アプリでの利用はできますが、公開配布や外部ユーザーへの展開では Google の verification が必要になることがあります。
Drive データを保存・転送する形で扱う場合は、Google の security assessment が必要になることもあります。

## 別 OAuth client を使う場合

別の Google Cloud プロジェクトの client を使う場合だけ、次を準備してください。

1. Google Cloud プロジェクトで Google Drive API を有効化する
2. OAuth consent screen に上記 scope を設定する
3. Desktop app タイプの OAuth client を作成する
4. `client_id` を利用者へ配布する
5. `client_secret` を社内の秘密情報共有先で配布する

利用者は `client_id` を `~/.config/drive-api/config.json` の `clientId`、`GOOGLE_DRIVE_CLIENT_ID`、または `--client-id` で指定します。
`client_secret` は通常構成と同じく login 時に対話入力し、ファイルや環境変数には置きません。

外部（External）かつ「テスト」ステータスの client では、refresh token が7日で失効する点に注意してください。

## `drive.readonly` を使う理由

このプラグインは `drive.file` scope ではなく `drive.readonly` を使います。
`drive.file` はアプリで作成・選択されたファイル中心の scope で、ユーザーが任意の Drive URL / fileId を渡して許可フォルダ配下の既存ファイルを読む今回の用途には合いません。

公開配布や審査負荷の低減を優先する場合は、Google Picker と `drive.file` を使う別設計を検討してください。

## ガードレールの限界

`allowedDomains` は token 保存前のポリシー確認であり、Google Workspace の共有境界や管理者ポリシーそのものを保証するものではありません。
`allowedFolderIds` はプラグインのスクリプト層で参照範囲を絞る仕組みです。
OAuth token 自体は `drive.readonly` scope で Drive 全体を読めるため、プラグインを経由しない API 直接アクセスまでは制限できません。

このプラグインは `gcloud auth application-default login` を使いません。
現在の gcloud ADC は `cloud-platform` scope も要求するため、Drive の参照権限だけに絞れないためです。
