# Codex CLI 対応計画

## Context

現在 Claude Code 用プラグインとして動作しているが、OpenAI Codex CLI でも利用できるようにしたい。

## 調査で判明したこと

- Codex ネイティブのプラグインマニフェストは `.codex-plugin/plugin.json`
- ただし Codex はマーケットプレイス定義として以下の4つを認識する:
  1. Official Plugin Directory（Anthropic 管理）
  2. `$REPO_ROOT/.agents/plugins/marketplace.json`
  3. `$REPO_ROOT/.claude-plugin/marketplace.json`（Claude 形式も認識）
  4. `~/.agents/plugins/marketplace.json`
- 実際に `codex plugin marketplace add` で `.claude-plugin/marketplace.json` が読み込まれ、`/plugins` にプラグインが表示された
- `$slack` でスキルが呼び出され、SKILL.md を読んでスクリプトを実行した（SLACK_TOKEN 未設定で失敗したが動作自体は正常）
- SKILL.md のフォーマットは互換。Codex は未知の frontmatter フィールドを無視する
- プラグイン内のスキルは `$slack` または `@slack` で呼び出し（個別スキル指定はできない）
- Codex はシェルの環境変数を引き継ぐ（Claude Code の settings.json の env とは異なる）
- AGENTS.md は不要（プラグインの SKILL.md が指示を持っている）

### 許可設定の違い

| | Claude Code | Codex |
|---|---|---|
| 設定ファイル | `.claude/settings.json` | `.codex/config.toml` |
| 許可方式 | コマンドパターン (`Bash(node:*)`) | サンドボックスモード + 承認ポリシー |
| 実行モード | なし | `--full-auto`, `--sandbox workspace-write` |

Codex は個別コマンドの許可ではなく、サンドボックスモード + 承認ポリシーで制御:
- `approval_policy`: `untrusted` / `on-request` / `never`
- `sandbox_mode`: `workspace-write` / `read-only` / `danger-full-access`
- `codex --full-auto` で十分。個別コマンドの許可設定は不要
- `.codex/rules/` でプロジェクト単位のルール設定も可能だが、ワイルドカード非対応でパスが環境依存のため実用的でない

**結論: コマンド実行許可の設定（`verification/.claude/settings.json`）は Claude Code 専用。Codex は `--full-auto` で対応。**

### SKILL.md の Codex 向け注意点

Codex では `/slack-thread` のようなスラッシュコマンド記法が使えない。
SKILL.md の出力指示で「`/slack-thread` で取得できます」のような記述があると、
Codex がそのまま `/slack-thread` を実行しようとしてエラーになる。
→ SKILL.md の記述をツール非依存にするか、Codex 対応の記述を追加する必要がある。

## コード変更

既存の `.claude-plugin/marketplace.json` が Codex でも認識されるため、追加のマニフェストファイルは不要。

### SKILL.md の修正

出力指示から Claude Code 固有の `/slack-xxx` 記法を削除し、ツール非依存な表現に変更する。

修正箇所:
- `plugins/slack/skills/slack-history/SKILL.md:50` — `スレッド取得（`/slack-thread`）で使う識別子` → スラッシュコマンド記法を削除
- `plugins/slack/skills/slack-search/SKILL.md:47` — 同上
- `plugins/slack/skills/slack-thread/SKILL.md:3` — description 内の `Triggers on: /slack-thread` はトリガー定義なので残す

例:
- Before: `**ts（タイムスタンプ）**: スレッド取得（`/slack-thread`）で使う識別子`
- After: `**ts（タイムスタンプ）**: スレッドの取得に使う識別子`

## ドキュメント変更

### 1. README.md にインストール方法を追記

```sh
# Codex
codex plugin marketplace add whatarule/scoped-connectors
# Codex セッション内で /plugins から slack をインストール
```

### 2. plugins/slack/README.md に呼び出し方を追記

Codex での呼び出し方:
- `$slack` でプラグインを呼び出し（補完あり）
- 自然言語でも指示可能（「generalのメッセージを見せて」）
- Codex が内部のスキルを自動選択
- `@slack` も公式対応だが補完が効かないバグあり（[openai/codex#5839](https://github.com/openai/codex/issues/5839)）

### 3. plugins/slack/SETUP.md に設定方法を追記

Claude Code の場合:
- `~/.claude/settings.json` の `env` に `SLACK_TOKEN` を設定
- コマンド実行許可: `verification/.claude/settings.json` を参照

Codex の場合:
- シェルの環境変数として設定（`export SLACK_TOKEN=xoxp-...`）
- `.zshrc` / `.bashrc` に追加、または Codex 起動前に export

## 検証

1. ~~`codex plugin marketplace add` でマーケットプレイスが登録できること~~ — 済
2. ~~/plugins で slack プラグインが表示されること~~ — 済
3. ~~`$slack` でスキルが呼び出され SKILL.md を読むこと~~ — 済
4. SLACK_TOKEN 設定後にメッセージが取得できること — 済
5. ~~Claude Code 側が壊れていないこと~~ — 済
6. SKILL.md の出力指示がツール非依存になっていること — 済
