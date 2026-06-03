const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { dateToUnixTs } = require("../history");
const {
  DEFAULT_COUNT,
  MAX_COUNT,
  PAGE_SIZE,
  MAX_PAGES,
  parseArgs,
  buildDateFilters,
  buildSearchRequest,
  ensureSearchAvailable,
  normalizeMessageResult,
  formatSearchResult,
  getNextCursor,
  searchMessages,
} = require("../search");

describe("parseArgs", () => {
  it("キーワードだけならデフォルト count を返す", () => {
    assert.equal(DEFAULT_COUNT, 3);
    assert.deepEqual(parseArgs(["aipo"]), {
      query: "aipo",
      count: 3,
      after: "",
      before: "",
    });
  });

  it("複数語、count、期間を解析する", () => {
    assert.deepEqual(
      parseArgs(["aipo", "deploy", "10", "--after", "2026-05-01", "--before", "2026-05-31"]),
      {
        query: "aipo deploy",
        count: 10,
        after: "2026-05-01",
        before: "2026-05-31",
      }
    );
  });

  it("count は最大100件で丸める", () => {
    assert.equal(parseArgs(["aipo", "50"]).count, 50);
    assert.equal(parseArgs(["aipo", "200"]).count, MAX_COUNT);
  });

  it("キーワード不足はエラーにする", () => {
    assert.throws(() => parseArgs(["10"]), /検索キーワード/);
  });
});

describe("buildSearchRequest", () => {
  it("public channel messages と keyword search を固定する", () => {
    const request = buildSearchRequest({ query: "aipo", count: 50 });

    assert.deepEqual(request.channel_types, ["public_channel"]);
    assert.deepEqual(request.content_types, ["messages"]);
    assert.equal(request.include_context_messages, false);
    assert.equal(request.disable_semantic_search, true);
    assert.equal(request.limit, PAGE_SIZE);
    assert.equal(request.query, "aipo");
  });

  it("期間指定を Unix 秒で渡す", () => {
    assert.deepEqual(
      buildDateFilters({ after: "2026-05-01", before: "2026-05-31" }),
      {
        after: Number(dateToUnixTs("2026-05-01")),
        before: Number(dateToUnixTs("2026-05-31", true)),
      }
    );
  });

  it("cursor がある場合だけ request に含める", () => {
    assert.equal(buildSearchRequest({ query: "aipo", count: 10 }).cursor, undefined);
    assert.equal(
      buildSearchRequest({ query: "aipo", count: 10, cursor: "next" }).cursor,
      "next"
    );
  });
});

describe("ensureSearchAvailable", () => {
  it("assistant.search.info が true なら続行する", async () => {
    const calls = [];
    const data = await ensureSearchAvailable(async (endpoint, body, options) => {
      calls.push({ endpoint, body, options });
      return { ok: true, is_ai_search_enabled: true };
    });

    assert.equal(data.ok, true);
    assert.deepEqual(calls, [
      {
        endpoint: "assistant.search.info",
        body: {},
        options: { skipCheck: true },
      },
    ]);
  });

  it("is_ai_search_enabled=false でも context が ok なら検索を続行する", async () => {
    const calls = [];
    const results = await searchMessages({ query: "aipo", count: 1 }, async (endpoint) => {
      calls.push(endpoint);
      if (endpoint === "assistant.search.info") {
        return { ok: true, is_ai_search_enabled: false };
      }
      return {
        ok: true,
        results: {
          messages: [
            {
              message_ts: "1770000001.000000",
              channel_name: "general",
              author_name: "alice",
              content: "aipo",
            },
          ],
        },
      };
    });

    assert.equal(results.length, 1);
    assert.deepEqual(calls, ["assistant.search.info", "assistant.search.context"]);
  });

  it("missing_scope は search を実行せず明確に失敗する", async () => {
    let searched = false;
    await assert.rejects(
      () =>
        searchMessages({ query: "aipo", count: 10 }, async (endpoint) => {
          if (endpoint === "assistant.search.context") searched = true;
          return { ok: false, error: "missing_scope" };
        }),
      /search:read\.public/
    );
    assert.equal(searched, false);
  });
});

describe("searchMessages", () => {
  it("legacy search endpoint は呼ばず assistant.search.context を呼ぶ", async () => {
    const calls = [];
    const results = await searchMessages({ query: "aipo", count: 2 }, async (endpoint, body, options) => {
      calls.push({ endpoint, body, options });
      assert.notEqual(endpoint, ["search", "messages"].join("."));
      if (endpoint === "assistant.search.info") {
        return { ok: true, is_ai_search_enabled: true };
      }
      return {
        ok: true,
        results: {
          messages: [
            {
              message_ts: "1770000001.000000",
              channel_name: "general",
              author_name: "alice",
              content: "aipo one",
            },
            {
              message_ts: "1770000002.000000",
              channel_name: "general",
              author_name: "bob",
              content: "aipo two",
            },
          ],
        },
        response_metadata: { next_cursor: "ignored" },
      };
    });

    assert.equal(results.length, 2);
    assert.deepEqual(calls.map((call) => call.endpoint), [
      "assistant.search.info",
      "assistant.search.context",
    ]);
    assert.deepEqual(calls[1].body.channel_types, ["public_channel"]);
    assert.deepEqual(calls[1].body.content_types, ["messages"]);
    assert.equal(calls[1].body.disable_semantic_search, true);
    assert.equal(calls[1].body.include_context_messages, false);
    assert.deepEqual(calls.map((call) => call.options), [
      { skipCheck: true },
      { skipCheck: true },
    ]);
  });

  it("next_cursor があれば count 到達まで pagination する", async () => {
    const cursors = [];
    const limits = [];
    const results = await searchMessages({ query: "aipo", count: 50 }, async (endpoint, body) => {
      if (endpoint === "assistant.search.info") {
        return { ok: true, is_ai_search_enabled: true };
      }
      cursors.push(body.cursor || "");
      limits.push(body.limit);
      const index = cursors.length;
      return {
        ok: true,
        results: {
          messages: Array.from({ length: body.limit }, (_, i) => ({
            message_ts: `17700000${index}${String(i).padStart(2, "0")}.000000`,
            channel_name: "general",
            author_name: "alice",
            content: `aipo ${index}-${i}`,
          })),
        },
        response_metadata: { next_cursor: `cursor-${index}` },
      };
    });

    assert.equal(results.length, 50);
    assert.deepEqual(cursors, ["", "cursor-1", "cursor-2"]);
    assert.deepEqual(limits, [PAGE_SIZE, PAGE_SIZE, 10]);
  });

  it("最大ページ数で停止する", async () => {
    const cursors = [];
    const results = await searchMessages({ query: "aipo", count: MAX_COUNT + 1 }, async (endpoint, body) => {
      if (endpoint === "assistant.search.info") {
        return { ok: true, is_ai_search_enabled: true };
      }
      cursors.push(body.cursor || "");
      return {
        ok: true,
        results: {
          messages: [
            {
              message_ts: `177000000${cursors.length}.000000`,
              channel_name: "general",
              author_name: "alice",
              content: "aipo",
            },
          ],
        },
        response_metadata: { next_cursor: `cursor-${cursors.length}` },
      };
    });

    assert.equal(cursors.length, MAX_PAGES);
    assert.equal(results.length, MAX_PAGES);
  });
});

describe("getNextCursor", () => {
  it("top-level と response_metadata の cursor を読める", () => {
    assert.equal(getNextCursor({ next_cursor: "top" }), "top");
    assert.equal(
      getNextCursor({ response_metadata: { next_cursor: "metadata" } }),
      "metadata"
    );
    assert.equal(getNextCursor({}), "");
  });
});

describe("result formatting", () => {
  it("message result を投稿単位で整形する", () => {
    const result = normalizeMessageResult({
      message_ts: "1770000001.000000",
      channel_name: "general",
      author_name: "alice",
      content: "aipo deployed",
    });

    assert.match(result.datetime, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.equal(result.channelName, "general");
    assert.equal(result.id, "1770000001.000000");
    assert.equal(result.user, "alice");
    assert.equal(result.text, "aipo deployed");
    assert.match(formatSearchResult(result), /#general \(1770000001\.000000\) alice: aipo deployed$/);
  });

  it("存在しない値は unknown にする", () => {
    assert.deepEqual(normalizeMessageResult({}), {
      datetime: "unknown",
      channelName: "unknown",
      id: "unknown",
      user: "unknown",
      text: "unknown",
    });
  });
});
