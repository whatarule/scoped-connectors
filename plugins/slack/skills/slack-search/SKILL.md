---
name: slack-search
description: "無効化中: Slack 検索は search:read がプライベートチャンネル結果を返す可能性があるため使用しない"
user-invocable: false
arguments: "<keyword> [count] [期間]"
allowed-tools:
  - Bash
---

# slack-search

このスキルは現在無効です。

`search:read` / `search.messages` は、認可ユーザーが閲覧できるプライベートチャンネルの検索結果を返す可能性があるため使いません。
パブリックチャンネル限定検索は別途実装予定です。

Slack の内容確認が必要な場合は、`slack-history` でパブリックチャンネルを明示して取得してください。
