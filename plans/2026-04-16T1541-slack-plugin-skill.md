# Slack プラグイン計画

## Context

このリポジトリ (`wk/agent/slack`) を Claude Code の plugin として構成する。
`claude plugin marketplace add` → `claude plugin install` でインストールできる形にする。
単一スキル `/slack` で引数分岐する構成。
サブコマンドの補完は効かないが、Claude が自然言語で解釈するため
`/slack generalのメッセージ見せて` のような呼び出しも可能。

## 決定事項

1. **配布**: `claude plugin` 方式、プラグイン名は `slack`
2. **トークン**: User Token (`xoxp-`) 限定。search が使える + 参加不要でパブリックチャンネル読める
3. **機能**: channels / history / thread / search の4サブコマンド
4. **JSONパース**: Node.js（Claude Code に必ず入っている）
5. **スクリプト**: モジュール分割（common + 機能別 + cache）
6. **キャッシュ**: スキルディレクトリ内 `.cache/channels.json`、手動更新（`/slack channels` 実行時に更新）
7. **メッセージ取得件数**: デフォルト20件
8. **チャンネル指定**: 名前でもIDでも可（`C` 始まりならID、それ以外は名前解決）
9. **スレッド指定**: ts 直接指定 or Slack メッセージURL の両方対応
10. **出力フォーマット**: コンパクト形式 `[日時] (ts) ユーザー: メッセージ`
11. **言語**: 日本語（）
12. **allowed-tools**: Bash, Read, Agent
13. **ページネーション**: `conversations.list` のみ対応（他は1ページ目のみ）
14. **リトライ**: しない（レートリミット時はエラーメッセージを表示）
15. **チャンネル種別**: `public_channel` 固定
16. **App 設定配布**: manifest.yml をリポジトリに含める

## リポジトリ構成

```
slack/
├── .claude-plugin/
│   └── plugin.json              # plugin manifest
├── skills/
│   └── slack/
│       ├── SKILL.md             # /slack スキル本体
│       └── scripts/
│           ├── common.js        # 共通処理（stdin読み込み、エラーチェック、日時変換）
│           ├── channels.js      # チャンネル一覧パース + ページネーション
│           ├── history.js       # メッセージパース
│           ├── thread.js        # スレッドパース（history.jsの整形関数を再利用）
│           ├── search.js        # 検索結果パース
│           └── cache.js         # キャッシュ読み書き（.cache/channels.json）
├── manifest.yml                 # Slack App Manifest（利用者がコピペ用）
├── README.md                    # セットアップ手順
└── plans/
```

## サブコマンド

| コマンド | API | 説明 |
|---|---|---|
| `/slack channels` | `conversations.list` | チャンネル一覧取得（キャッシュも更新、ページネーション対応） |
| `/slack history <channel>` | `conversations.history` | メッセージ取得（デフォルト20件） |
| `/slack thread <channel> <ts or URL>` | `conversations.replies` | スレッド返信取得 |
| `/slack search <keyword>` | `search.messages` | メッセージ検索 |

## SKILL.md の構成

1. **frontmatter**
   - name: slack
   - description: Slack からメッセージを取得するスキル
   - allowed-tools: Bash, Read, Agent
2. **概要** — サブコマンド一覧
3. **共通処理**
   - `$SLACK_TOKEN` の存在チェック → 未設定時は設定手順を案内
   - API呼び出し: `curl -s -H "Authorization: Bearer $SLACK_TOKEN"`
   - レスポンスを `node scripts/xxx.js` にパイプして整形
   - エラー処理: APIレスポンスの `ok` フィールドを確認（scripts/common.js で処理）
4. **各サブコマンドの手順**
   - channels: `conversations.list` → `node scripts/channels.js`（ページネーション対応、キャッシュ更新）
   - history: チャンネル名→ID変換（cache.js利用）→ `conversations.history?limit=20` → `node scripts/history.js`
   - thread: URL or ts をパース → `conversations.replies` → `node scripts/thread.js`
   - search: `search.messages` → `node scripts/search.js`

## scripts のモジュール構成

```
common.js   ← stdin読み込み、okチェック、ts→日時変換、出力整形
cache.js    ← キャッシュ読み書き（.cache/channels.json）、名前→ID変換
channels.js ← require('./common'), require('./cache')  ※ページネーション対応
history.js  ← require('./common')
thread.js   ← require('./common'), require('./history')（整形関数を再利用）
search.js   ← require('./common')
```

## API 詳細

### conversations.list（ページネーション対応）
```bash
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
  "https://slack.com/api/conversations.list?types=public_channel&limit=1000"
# next_cursor がある場合は繰り返し
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
  "https://slack.com/api/conversations.list?types=public_channel&limit=1000&cursor=NEXT_CURSOR"
```

### conversations.history
```bash
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
  "https://slack.com/api/conversations.history?channel=CHANNEL_ID&limit=20"
```

### conversations.replies
```bash
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
  "https://slack.com/api/conversations.replies?channel=CHANNEL_ID&ts=THREAD_TS"
```

### search.messages
```bash
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
  "https://slack.com/api/search.messages?query=KEYWORD"
```

## Slack メッセージURL のパース

URL形式: `https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP`
- `CHANNEL_ID`: `/archives/` の後の部分
- `TIMESTAMP`: `p` の後の数字を `xxxxxx.xxxxxx` 形式に変換（先頭10桁.残り）

## 前提条件（利用者が行うこと）

1. manifest.yml を使って Slack App を作成
   - api.slack.com → Create New App → From an app manifest
   - manifest.yml の内容を貼り付け
2. ワークスペースにインストール → User Token (`xoxp-`) を取得
3. 環境変数を設定:
   ```json
   // ~/.claude/settings.json
   { "env": { "SLACK_TOKEN": "xoxp-..." } }
   ```
4. プラグインをインストール:
   ```bash
   claude plugin marketplace add org/slack
   claude plugin install slack@slack
   ```

## Slack App Manifest

```yaml
display_information:
  name: Claude Slack Reader
oauth_config:
  scopes:
    user:
      - channels:history
      - channels:read
      - search:read
```

## 実装ステップ

1. `.claude-plugin/plugin.json` を作成
2. `skills/slack/scripts/common.js` を作成
3. `skills/slack/scripts/cache.js` を作成
4. `skills/slack/scripts/channels.js` を作成
5. `skills/slack/scripts/history.js` を作成
6. `skills/slack/scripts/thread.js` を作成
7. `skills/slack/scripts/search.js` を作成
8. `skills/slack/SKILL.md` を作成
9. `manifest.yml` を作成
10. `README.md` を作成
11. `claude plugin validate` で検証
12. 動作確認

## 検証

1. `claude plugin validate .` が通ること
2. `/slack channels` でチャンネル一覧が取得できること
3. `/slack history #general` でメッセージが表示されること
4. `/slack thread #general <ts>` でスレッド返信が取得できること
5. `/slack thread <Slack URL>` でスレッド返信が取得できること
6. `/slack search keyword` で検索結果が表示されること
7. `SLACK_TOKEN` 未設定時にエラーメッセージ + 設定手順が表示されること
