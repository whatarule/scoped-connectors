"use strict";

const DISABLED_MESSAGE =
  "slack-search は現在無効です。search:read / search.messages は、認可ユーザーが閲覧できるプライベートチャンネルの検索結果を返す可能性があるため使いません。\n" +
  "必要な場合は /slack-history でパブリックチャンネルを指定してください。パブリックチャンネル限定検索は別途実装予定です。\n";

async function main() {
  process.stderr.write(DISABLED_MESSAGE);
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  });
}
