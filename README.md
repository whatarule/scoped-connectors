# Scoped Connectors

AI コーディングエージェント（Claude Code, Codex 等）から外部サービスの情報を読み取るためのプラグインマーケットプレイスです。

## インストール

```sh
# Claude Code
claude plugin marketplace add whatarule/scoped-connectors
claude plugin install slack@scoped-connectors

# Codex
codex plugin marketplace add whatarule/scoped-connectors
# Codex セッション内で /plugins から slack をインストール
```

## プラグイン一覧

| プラグイン | 説明 | セットアップ |
|---|---|---|
| [Slack](plugins/slack/README.md) | Slack のメッセージ取得・検索 | [セットアップ](plugins/slack/SETUP.md) |
