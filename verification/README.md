# 検証手順

このディレクトリで `claude` を起動し、プラグインの動作確認を行う。
許可設定がまっさらな状態でテストできる。

## 前提

- `SLACK_TOKEN` が `~/.claude/settings.json` に設定済み
- `claude plugin install slack@slack` でプラグインがインストール済み

## テスト項目

### channels
- [ ] `/slack channels` でチャンネル一覧が表示される
- [ ] キャッシュファイルが作成される

### history
- [ ] `/slack history #general` でメッセージが表示される
- [ ] `/slack history C01ABCDEF` でID指定でも動作する

### thread
- [ ] `/slack thread #general <ts>` でスレッドが取得できる
- [ ] `/slack thread <Slack URL>` でURL指定でも動作する

### search
- [ ] `/slack search keyword` で検索結果が表示される

### エラー処理
- [ ] `SLACK_TOKEN` 未設定時にエラーメッセージが表示される
