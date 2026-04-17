# スクリプトリファクタ: curl 廃止、Node.js で API 直接呼び出し

## Context

自然言語でスキルがトリガーされた場合、Bash コマンドに `$SLACK_TOKEN` や `$SKILL_DIR` の
変数展開が含まれると Claude Code のセキュリティチェック（「Contains simple_expansion」）に引っかかり
手動許可を求められる。

`/slack:slack` で直接呼び出せば `allowed-tools: Bash` で自動承認されるが、
自然言語トリガーでは settings.json のパーミッションが継承されないバグがある (anthropics/claude-code#18950)。

## 方針

curl を廃止し、各スクリプトが Node.js の `fetch` で Slack API を直接呼び出す。
これにより Bash コマンドから変数展開がなくなり、セキュリティチェックを回避できる。

**Before:**
```bash
SKILL_DIR="/path/to/skills/slack" && curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
  "https://slack.com/api/conversations.history?channel=C0EXAMPLE02&limit=20" \
  | node "$SKILL_DIR/scripts/history.js"
```

**After:**
```bash
node /path/to/skills/slack/scripts/history.js general 20
```

- `$SLACK_TOKEN` → スクリプト内で `process.env.SLACK_TOKEN` を参照
- `$SKILL_DIR` → Claude が SKILL.md のパスからフルパスをリテラルで書く
- `curl` → Node.js `fetch`（Node.js 18+ 組み込み）
- stdin パイプ → コマンドライン引数
- チャンネル名→ID変換 → スクリプト内で cache.js を使って解決

## 決定事項

1. **`readStdin` 廃止**。`fetch` ベースの `fetchSlackApi` と `fetchAllPages` を common.js に追加
2. **チャンネル名→ID変換**はスクリプト内で行う（Claude がキャッシュを Read する必要なし）
3. **キャッシュ未取得時は自動取得**（チャンネル、ユーザー、ユーザーグループすべて。読み取り専用なのでリスクなし）
4. **ページネーションは `fetchAllPages` で共通化**（channels, users で重複させない）
5. **テストは既存テストが通ることの確認のみ**（fetchSlackApi のモックテストは追加しない）

## 変更対象

### common.js
- `readStdin()` を削除
- `fetchSlackApi(endpoint, params)` を追加: `fetch` で Slack API を呼び出し、JSON をパースして返す
- `fetchAllPages(endpoint, params, dataKey)` を追加: ページネーション対応。next_cursor をループして全件取得
- `process.env.SLACK_TOKEN` の存在チェックもここで行う

```js
async function fetchSlackApi(endpoint, params = {}) {
  const token = process.env.SLACK_TOKEN;
  if (!token) {
    process.stderr.write("SLACK_TOKEN が設定されていません\n");
    process.exit(1);
  }
  const query = new URLSearchParams(params).toString();
  const url = `https://slack.com/api/${endpoint}?${query}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  checkOk(data);
  return data;
}

async function fetchAllPages(endpoint, params, dataKey) {
  let all = [];
  let cursor = "";
  do {
    const p = cursor ? { ...params, cursor } : params;
    const data = await fetchSlackApi(endpoint, p);
    all = all.concat(data[dataKey] || []);
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return all;
}
```

### cache.js
- `ensureChannelCache()` を追加: `.cache/channels.json` がなければ自動で channels を取得してキャッシュ作成
- `ensureUsersCache()` を追加: `.cache/users.json` と `.cache/usergroups.json` がなければ自動で取得
- 既存の関数は変更なし

### channels.js
- 引数: なし
- `fetchAllPages("conversations.list", { types: "public_channel", limit: "1000" }, "channels")` で全件取得
- キャッシュ更新
- チャンネル一覧を出力

### users.js
- 引数: なし
- `fetchAllPages("users.list", { limit: "1000" }, "members")` で全ユーザー取得
- `fetchSlackApi("usergroups.list")` でユーザーグループも同時取得
- 両方のキャッシュを更新

### history.js
- 引数: `<channelName or channelId> [limit]`
- `ensureChannelCache()` → チャンネル名→ID変換（cache.js の `resolveChannel`）
- `ensureUsersCache()` → ユーザー名解決用
- `fetchSlackApi("conversations.history", { channel, limit })` で取得
- メッセージ整形出力

### thread.js
- 引数: `<channelName or channelId> <ts>` または `<slack URL>`
- URL パースまたは引数からチャンネルIDと ts を取得
- `ensureChannelCache()` → チャンネル名→ID変換（URL指定時は不要）
- `ensureUsersCache()` → ユーザー名解決用
- `fetchSlackApi("conversations.replies", { channel, ts })` で取得
- メッセージ整形出力

### search.js
- 引数: `<keyword> [count]`
- `ensureUsersCache()` → ユーザー名解決用
- `fetchSlackApi("search.messages", { query, count })` で取得
- 検索結果整形出力

### SKILL.md
- curl のコマンド例をすべて `node scripts/xxx.js args` に書き換え
- 変数展開の指示を削除
- キャッシュ確認の手順を削除（スクリプトが自動で行う）
- 「この SKILL.md のフルパスからスクリプトのフルパスをリテラルで書くこと」を明記

## SKILL.md の指示例（変更後）

```
### history サブコマンド

スクリプトを実行する。チャンネル名でもIDでも指定可能。

node /path/to/skills/slack/scripts/history.js general 20

※ /path/to/skills/slack はこの SKILL.md があるディレクトリの絶対パスに置き換えること
※ 変数展開（$SKILL_DIR 等）は使わず、リテラルでフルパスを書くこと
```

## 実装順序

1. common.js に `fetchSlackApi`, `fetchAllPages` を追加、`readStdin` を削除
2. cache.js に `ensureChannelCache`, `ensureUsersCache` を追加
3. channels.js を書き換え
4. users.js を書き換え
5. history.js を書き換え
6. thread.js を書き換え
7. search.js を書き換え
8. SKILL.md を書き換え
9. テスト実行（`node --test`）
10. 動作確認

## 検証

1. 自然言語（`slack history general`）で手動許可なしに実行できること
2. `/slack:slack history general` でも従来通り動作すること
3. 全サブコマンド（channels, users, history, thread, search）が動作すること
4. ページネーション（channels, users）が動作すること
5. キャッシュ未取得時に自動取得されること
6. テストが通ること（`node --test`）
