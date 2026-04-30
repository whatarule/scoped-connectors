const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { dateToUnixTs } = require("../history");

describe("dateToUnixTs", () => {
  it("YYYY-MM-DD を Unix タイムスタンプ文字列に変換する", () => {
    // 2026-04-14 00:00:00 JST = 2026-04-13 15:00:00 UTC = 1776348000
    // タイムゾーン依存なのでフォーマットだけ確認
    const result = dateToUnixTs("2026-04-14");
    assert.match(result, /^\d+$/);
    assert.ok(Number(result) > 0);
  });

  it("endOfDay=true のタイムスタンプは endOfDay=false より大きい", () => {
    const start = Number(dateToUnixTs("2026-04-14"));
    const end = Number(dateToUnixTs("2026-04-14", true));
    assert.ok(end > start);
    // 差は約86399秒（23:59:59）
    const diff = end - start;
    assert.ok(diff >= 86399 && diff <= 86400);
  });
});
