# google-drive は drive.file ではなく drive.readonly + フォルダ許可リストを使う

google-drive プラグインは、ユーザーが任意の Drive URL / fileId を渡して既存ファイルを読む用途のため、`drive.file`(アプリで作成・選択したファイル中心の scope)では成立せず、restricted scope である `drive.readonly` を採用した。scope が Drive 全体に及ぶ代償は、スクリプト層のフォルダ許可リスト(`allowedFolderIds`、参照時の関所)とドメイン許可リスト(`allowedDomains`、保存時の関所)で補う。

## Considered Options

- `drive.file` + Google Picker: 審査負荷は低いが、既存ファイルを URL で直接読む本プラグインの用途に合わない。公開配布を優先する場合の別設計として SETUP.md に記録済み

## Consequences

- 公開配布や外部ユーザー展開では Google の verification / security assessment が必要になりうる
- 許可リストはあくまでプラグイン経由のアクセスを絞る仕組みであり、発行済み token の直接 API 利用までは制限できない
