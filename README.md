# Scoped Connectors

AI コーディングエージェント（Claude Code, Codex 等）から、権限をスコープ制御した上で外部サービスに安全に接続するためのプラグインマーケットプレイスです。

## インストール

```sh
# Claude Code
claude plugin marketplace add whatarule/scoped-connectors
claude plugin install slack@scoped-connectors

# Codex
codex plugin marketplace add whatarule/scoped-connectors
# Codex セッション内で /plugins から slack をインストール
```

## アンインストール

```sh
# Claude Code
claude plugin uninstall slack@scoped-connectors
claude plugin marketplace remove scoped-connectors

# Codex
# Codex セッション内で /plugins からプラグインをアンインストール
codex plugin marketplace remove scoped-connectors
```

## プラグイン一覧

| プラグイン | 説明 | セットアップ |
|---|---|---|
| [Slack](plugins/slack/README.md) | Slack のメッセージ取得・検索 | [セットアップ](plugins/slack/SETUP.md) |
