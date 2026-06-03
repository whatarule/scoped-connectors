# `search:read.public` Real-time Search API への切り替え計画

## Summary

`slack-search` を `search.messages` / `search:read` ではなく、Slack Real-time Search API の `assistant.search.context` と `search:read.public` で再実装する。

目的は、AIモデルに private channel / DM / MPIM の投稿を渡さないこと。検索 API の request 側で `channel_types: ["public_channel"]`、`content_types: ["messages"]` を固定し、使えない場合は fallback せず fail closed にする。

現状は作業ツリーがクリーンで、旧 `conversations.history` 走査実装は `stash@{0}: wip public-channel-history-search` に退避済み。今回の実装ではこの stash を適用しない。

参考:
- https://docs.slack.dev/reference/scopes/search.read.public/
- https://docs.slack.dev/reference/methods/assistant.search.context/
- https://docs.slack.dev/reference/methods/assistant.search.info/

## Key Changes

- Slack App manifest に user scope `search:read.public` を追加する。
  - `search:read` は追加しない。
  - `search:read.private`、`search:read.im`、`search:read.mpim`、private / DM 系 scope は追加しない。
- `plugins/slack/scripts/search.js` を disabled 実装から `assistant.search.context` 呼び出しに変更する。
  - CLI は `node search.js <keyword...> [count] [--after YYYY-MM-DD] [--before YYYY-MM-DD]`。
  - `count` はデフォルト3、最大100に丸める。
  - `disable_semantic_search: true` を指定し、キーワード検索として動かす。
  - `channel_types: ["public_channel"]`、`content_types: ["messages"]`、`include_context_messages: false` を固定する。
  - `--after` / `--before` は Unix 秒に変換し、API の `after` / `before` に渡す。
  - 1ページは最大20件とし、pagination は `count` に達するまで `next_cursor` を使う。ただし過剰呼び出しを避けるため最大5ページまでに制限する。
- `assistant.search.info` を検索前に呼ぶ。
  - Real-time Search API が利用可能なら続行する。
  - `missing_scope`、`not_allowed_token_type`、`access_denied` など、利用できない状態は fail closed で明確に stderr に出す。
  - `is_ai_search_enabled: false` でも `assistant.search.context` が `ok: true` で動作することがあるため、これだけではブロックしない。
  - `conversations.history` 走査には fallback しない。
- 出力は投稿単位で、日時、チャンネル名、ts または permalink、ユーザー名、本文を含める。
  - API response に存在しない値は `unknown` として扱う。
  - raw Slack response は stdout/stderr に出さない。
- `slack-search` skill、README、SETUP を更新する。
  - public channel 限定検索であることを明記する。
  - `search.messages` / `search:read` は使わないことを明記する。
  - Real-time Search API が使えない場合は fallback せず失敗することを明記する。
- plugin version は `0.3.0` に上げる。
- Codex plugin cache 2箇所へ同期する。

## Test Plan

- `plugins/slack/scripts/test/search.test.js` を追加する。
  - 引数パース: keyword、複数語、count、`--after`、`--before`
  - request 生成: `assistant.search.context` に `channel_types: ["public_channel"]`、`content_types: ["messages"]`、`disable_semantic_search: true`、`include_context_messages: false` が入る
  - scope safety: `search.messages` を呼ばない
  - fail closed: `assistant.search.info` が false / error の場合に検索しない
  - pagination: `next_cursor` がある場合でも count 到達または最大5ページで止まる
  - output: message result を投稿単位で整形する
- 既存テストを通す。
  - `node --test plugins/slack/scripts/test/*.test.js`
- manifest / 実装チェック。
  - `rg "search.messages|search:read\"" plugins/slack/scripts plugins/slack/slack-app-manifest.json` で一致なし
  - `rg "search:read.public" plugins/slack/slack-app-manifest.json` で追加確認
- plugin validate。
  - `claude plugin validate plugins/slack`
- smoke test。
  - `node plugins/slack/scripts/search.js aipo 10`
  - 成功時は本文を必要以上にログ化せず、exit code、件数、stderr を確認する。

## Assumptions

- 検索はキーワードのみ。semantic search は無効化する。
- Real-time Search API が使えない場合は fail closed にする。
- `search:read.public` は `assistant.search.context` / `assistant.search.info` 用として使う。`search.messages` には使わない。
- `search:read`、`search:read.private`、`search:read.im`、`search:read.mpim` は追加しない。
- 旧 `conversations.history` 走査実装の stash は参照用に残すが、今回の実装には適用しない。
