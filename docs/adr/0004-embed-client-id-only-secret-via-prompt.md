# 共有 OAuth client は client_id のみ同梱し、client secret はディスクに置かず login 時に対話入力する

slack と同様のセットアップ UX を目指して共有 client の同梱を検討した。client_id は公開識別子なので同梱するが、client secret は次の理由からリポジトリにもローカルのファイル・環境変数にも置かない: (1) public リポジトリに置くと GitHub secret scanning が検知し、Google の漏洩対応(通知・リセット)で全利用者のログインが突然壊れるリスクがある、(2) ローカルの平文ファイルに置くのは「平文 token file の廃止」という本改修の趣旨と矛盾する。secret は login 時の非表示対話入力で受け取り(社内の秘密情報共有先で配布)、Token Record の一部として OS secure store にのみ保存する。refresh は record の値を使うため再入力は login 時の1回だけでよい。

## Consequences

- 共有 client は compass-e.com の内部(Internal)アプリのため、組織外アカウントは認可自体ができず(`org_internal`)、同梱 client_id を第三者が悪用する余地は小さい。redirect は loopback 固定 + PKCE
- 内部アプリのため Google の verification と「テスト」ステータスの refresh token 7日失効は発生しない
- login は TTY が必須になる(エージェントの sandbox 内や headless では実行不可。ユーザーのターミナルで実行する)
- rclone / gcloud のように非秘匿扱いの secret を難読化して同梱する前例はあるが、スキャナ回避のためのエンコードは採らない
