# 期間指定 + 件数指定機能

## Context

history と search で期間と件数を指定してメッセージを絞り込めるようにする。
自然言語で指定し、Claude が日付を解釈して API パラメータに変換する。
件数は数字のみで指定（例: `50`）。

## 方針

スクリプトの変更は不要。SKILL.md の指示を修正するだけで実現可能。

理由:
- history の `oldest` / `latest` パラメータは curl の URL に追加するだけ
- search の `after:` / `before:` はクエリ文字列に付加するだけ
- 日付の解釈（「先週」→ 具体的な日付）は Claude が行う
- スクリプトは stdin の JSON をパースして出力するだけで、期間指定の影響を受けない

## 変更対象

### skills/slack/SKILL.md のみ

**history サブコマンド**に追記:
- ユーザーが期間を指定した場合、Claude が日付を Unix タイムスタンプに変換
- `oldest` / `latest` パラメータを curl の URL に追加
- 例: `/slack history #general 先週` → Claude が先週の月曜〜日曜を算出 → `oldest=1234567890&latest=1234567890`

**search サブコマンド**に追記:
- ユーザーが期間を指定した場合、Claude がクエリに `after:YYYY-MM-DD` `before:YYYY-MM-DD` を付加
- 例: `/slack search deploy 今月` → `query=deploy after:2026-04-01 before:2026-04-30`

## 指示例（SKILL.md に追記する内容）

### history

```
### 期間指定

ユーザーが期間を指定した場合（「先週」「4/1から4/15まで」「直近3日」等）、
日付を Unix タイムスタンプに変換して oldest / latest パラメータに設定してください。

例:
- 「先週」→ 先週月曜 00:00 の Unix ts を oldest、先週日曜 23:59 の Unix ts を latest に
- 「4/1から4/15」→ 4/1 00:00 を oldest、4/15 23:59 を latest に
- 「直近3日」→ 3日前 00:00 を oldest に（latest は省略＝現在まで）

### 件数指定

ユーザーが数字のみの引数を指定した場合（例: `50`）、取得件数として扱い limit パラメータを変更してください。
指定がなければデフォルト20件。

例:
- `/slack history #general 50` → limit=50
- `/slack history #general 先週 50` → oldest/latest + limit=50

URL例:
conversations.history?channel=CHANNEL_ID&limit=20&oldest=UNIX_TS&latest=UNIX_TS
```

### search

```
### 期間指定

ユーザーが期間を指定した場合（「今月」「先週」「4/1以降」等）、
検索クエリに after: / before: を付加してください。

例:
- 「今月」→ query=KEYWORD after:2026-04-01 before:2026-04-30
- 「先週」→ query=KEYWORD after:2026-04-07 before:2026-04-13
- 「4/1以降」→ query=KEYWORD after:2026-04-01

### 件数指定

ユーザーが数字のみの引数を指定した場合、取得件数として扱い count パラメータを変更してください。
指定がなければデフォルト20件。API の上限は100件。

例:
- `/slack search deploy 50` → count=50
- `/slack search deploy 今月 30` → after/before + count=30
```

## 検証

1. `/slack history #general 先週` で先週のメッセージだけ表示されること
2. `/slack history #general 4/1から4/15` で期間内のメッセージが表示されること
3. `/slack history #general 50` で50件取得されること
4. `/slack history #general 先週 50` で期間 + 件数が両方効くこと
5. `/slack search deploy 今月` で今月の検索結果だけ表示されること
6. 期間・件数未指定の場合は従来通り動作すること（デフォルト20件）
