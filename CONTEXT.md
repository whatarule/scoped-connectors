# Scoped Connectors

外部サービス(Slack、Google Drive)へ読み取り専用・範囲限定でアクセスするためのプラグイン集。
アクセス範囲を「サービス側の scope」と「プラグイン側の許可リスト」の二段で絞ることを設計原則とする。

## Language

**Token Record**:
1回のログインで得た認証情報一式(トークン、認可済みアカウント情報、有効期限)をまとめた保存単位。
_Avoid_: token file, credentials, トークン情報

**Token Store**:
Token Record の保存先となる OS のセキュアストレージ(macOS Keychain / Windows Credential Manager)。平文ファイルや環境変数は Token Store ではない。
_Avoid_: file store, token.json

**ドメイン許可リスト (allowedDomains)**:
ログイン時、Token Record を保存する前にアカウントのメールドメインを**完全一致**で照合する保存時の関所。サブドメインは別ドメインとして扱う。
_Avoid_: ドメインサフィックス一致, アカウント制限(曖昧)

**フォルダ許可リスト (allowedFolderIds)**:
読み取り時、対象ファイルが許可フォルダの配下(祖先を遡って到達可能)であることを照合する参照時の関所。
_Avoid_: 許可リスト(単独では曖昧。どちらの関所か常に明示する)
