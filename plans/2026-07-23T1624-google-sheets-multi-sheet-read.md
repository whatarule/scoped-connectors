# google-drive プラグイン: Google Sheets 複数シート読み取り対応

## Context

現状の `plugins/google-drive/scripts/read.js` は Google Sheets を Drive API の `files.export`
で `text/csv` に変換して stdout へ出している。
Google Drive の CSV export は先頭シートのみなので、2枚目以降のシートを読むには Google Sheets API を併用する必要がある。

既存の読み取り制限は維持する。
つまり、対象 Spreadsheet は従来通り `allowedFolderIds` 配下にあることを `verifyFileInAllowlist` で確認してから読む。

参考:

- Google Drive export MIME types: https://developers.google.com/workspace/drive/api/guides/ref-export-formats
- Google Sheets values.get: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get
- Google Sheets spreadsheets.get: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get
- A1 notation: https://developers.google.com/workspace/sheets/api/guides/concepts

## Goals

- Google Sheets の2枚目以降を指定して読めるようにする
- 全シートをまとめて取得し、シートごとの CSV ファイルとして保存できるようにする
- 既存の `read.js <URL>` の挙動を壊さない
- 既存 token の許可 scope は原則増やさない
- token 値や認証情報を stdout/stderr に出さない

## Non-goals

- Spreadsheet の作成・更新・削除
- シート一覧だけをユーザーが探索する専用 CLI
- セル書式、コメント、フィルタ、数式依存関係の完全再現
- `drive.file` や `spreadsheets.readonly` への scope 方針変更
- フォルダ URL の一覧対応

## User-facing CLI

既存:

```sh
node read.js <fileId または Drive URL> [--format md|txt|csv|pdf] [--out dir] [--force]
```

追加後:

```sh
node read.js <fileId または Drive URL> [--format md|txt|csv|pdf] [--sheet name] [--range A1] [--all-sheets] [--out dir] [--force]
```

### Compatibility

- `node read.js <Sheets URL>` は従来通り Drive API の CSV export を使う
- 従来の既定動作では、Sheets は先頭シートのみを stdout に出す
- 2枚目以降を読む場合だけ `--sheet` / `--range` / `--all-sheets` を使う

### New options

`--sheet <name>`

- Google Sheets 専用
- 指定した sheet title 全体を Sheets API で取得して CSV を stdout に出す
- 例: `node read.js <url> --sheet "Sheet2"`

`--sheet <name> --range <A1>`

- 指定 sheet 内の範囲だけ読む
- `--range` は `A1:D20` のような sheet 名なし範囲として扱う
- 実際の API range は `'<sheet name>'!A1:D20`

`--range <A1>`

- Google Sheets 専用
- 完全な A1 notation を渡す
- 例: `node read.js <url> --range "'Sheet2'!A1:D20"`
- sheet 名なしの `A1:D20` も Sheets API と同じく先頭 visible sheet として扱う

`--all-sheets`

- Google Sheets 専用
- すべてのシートを取得して `drive-read/` 配下に `<sheet>.csv` として保存し、同名衝突時だけ fileId suffix を付ける
- stdout には保存先一覧だけを出す
- `--out dir` が指定されていれば `dir/` 配下に保存する

### Invalid combinations

- `--all-sheets` と `--sheet` は併用不可
- `--all-sheets` と `--range` は併用不可
- `--sheet` / `--range` / `--all-sheets` は Google Sheets 以外ではエラー
- `--sheet` / `--range` / `--all-sheets` と `--format pdf` は併用不可
- `--format csv` は明示されてもよいが、`--sheet` 系のときは Sheets API CSV 出力として扱う

## Design

### 1. `scripts/common.js`

現在は Drive API base 固定。

```js
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/";
```

Sheets API 用に次を追加する。

- `SHEETS_API_BASE = "https://sheets.googleapis.com/v4/"`
- `buildApiUrl(baseUrl, path, params)` または `buildSheetsUrl(path, params)`
- `fetchSheetsApi(path, params = {}, options = {})`

`fetchSheetsApi` は `fetchDriveApi` と同じ token store / retry 方針を使う。
Google API 共通化が小さく済むなら、内部だけ `requestGoogleResponse(baseUrl, path, params, options, accept, serviceName)` に切り出す。
外部 export は既存互換のため `fetchDriveApi` / `fetchDriveApiRaw` を維持する。

`values:batchGet` で `ranges` を複数渡せるよう、URL builder は配列値なら同じ key を `append` できるようにする。
既存 `buildDriveUrl` の挙動を壊さないため、Drive 用 wrapper は同じ public API を維持する。

Sheets API が無効な 403 の場合は、Google Cloud で Google Sheets API を有効化する案内を出す。
Drive API 側の既存エラー文言は維持する。

### 2. `scripts/read.js` options

`parseArgs` に以下を追加する。

```js
{
  sheet: null,
  range: null,
  allSheets: false
}
```

追加 helper:

- `hasSheetReadOptions(options)`
- `assertSheetOptionCombinations(options)`
- `quoteSheetTitle(title)`
- `buildSheetRange(sheetTitle, range)`
- `valuesToCsv(values)`
- `dedupeFileName(fileName, usedNames)`

`quoteSheetTitle` は A1 notation 用に sheet title を single quote で囲み、内部の single quote を escape する。

`valuesToCsv` は RFC 4180 相当の最小実装にする。

- `"` は `""` に escape
- comma / quote / CR / LF を含む値は quote する
- `null` / `undefined` は空セル
- jagged rows は ValueRange 内の最大列数まで空セルで pad する

### 3. Read plan

`resolveReadPlan` は Sheets API 経由の plan を表せるようにする。
既存テストや `smoke.js` の依存を壊さないよう、呼び出し側更新とテスト更新を同時に行う。

候補 shape:

```js
{ kind: "sheets-values", mode: "single", toStdout: true }
{ kind: "sheets-values", mode: "all", toStdout: false, ext: ".csv" }
```

分岐:

- Google Sheets かつ sheet option なし: 既存 Drive export plan
- Google Sheets かつ `--sheet` または `--range`: Sheets API single range plan
- Google Sheets かつ `--all-sheets`: Sheets API all sheets plan
- Google Sheets 以外かつ sheet option あり: エラー

### 4. Sheets metadata

`--all-sheets` では `spreadsheets.get` を使い、次の fields だけ取る。

```text
sheets(properties(sheetId,title,index))
```

取得した `index` の昇順で出力する。
title は API range と保存ファイル名の両方に使うが、保存時は既存 `sanitizeFileName` を通す。
同名に衝突する場合は `Sheet.csv`, `Sheet (2).csv` のように suffix を付ける。

### 5. Values retrieval

single sheet:

```text
GET /v4/spreadsheets/{spreadsheetId}/values/{range}
```

all sheets:

```text
GET /v4/spreadsheets/{spreadsheetId}/values:batchGet?ranges=<sheet1>&ranges=<sheet2>
```

query:

- `majorDimension=ROWS`
- `valueRenderOption=FORMATTED_VALUE`

当面は UI 表示に近い値を読むため `FORMATTED_VALUE` のままにする。
raw value や formula 出力は別タスクにする。

### 6. Output

single range:

- CSV を stdout に出す
- 末尾 newline を保証する
- 生成 CSV が `MAX_MEDIA_BYTES` を超え、`--force` がなければ stdout 出力前にエラーにする

all sheets:

- 各 sheet を個別 CSV として保存する
- 保存先は既存の `saveToFile` 方針に揃えて `<outDir>/`
- stdout には保存したファイル一覧を出す
- stderr には file name / mimeType / sheet count 程度を出す

## Auth and setup

Google Sheets API の `spreadsheets.get` / `spreadsheets.values.get` は `drive.readonly` を許可 scope として受け付ける。
そのため、この変更では `READONLY_SCOPES` に `spreadsheets.readonly` を追加しない。

ただし Google Cloud プロジェクト側で Google Sheets API が無効な場合は API エラーになる。
そのため、docs には「管理者向けセットアップで Google Sheets API も有効化する」旨を追加する。
通常利用者向け SETUP には、エラー時の案内として必要最小限だけ書く。

## Tests

### Unit tests

`plugins/google-drive/scripts/test/read.test.js`

- `parseArgs` が `--sheet` / `--range` / `--all-sheets` を解釈する
- invalid combination を拒否する
- `resolveReadPlan` が既存 Sheets default を Drive CSV export のまま維持する
- `resolveReadPlan` が sheet options ありの Sheets API plan を返す
- Google Sheets 以外に sheet options を指定すると throw
- `quoteSheetTitle` が space / special char / single quote を扱う
- `buildSheetRange` が sheet 全体 / sheet + range / full A1 range を作る
- `valuesToCsv` が comma / quote / newline / empty cells を扱う
- all sheets 保存名の sanitizer / dedupe が衝突を避ける

必要なら `common.test.js` を新設する。

- `buildApiUrl` が配列 query params を複数 key として append する
- `fetchSheetsApi` が `data` wrapper を返す
- Sheets API disabled の error hint が出る

### Smoke tests

`plugins/google-drive/scripts/smoke.js`

- `--file` が Google Sheets の場合に `--sheet <name>` を受けられるようにする
- 実データ本文は出力しない
- `sheet title`, `row count`, `column count`, `bytes` 程度だけ報告する

### Manual verification

1. 許可フォルダ配下に2枚以上の Google Sheets を置く
2. 既存 default:
   `node read.js <Sheets URL>` が先頭シート CSV を stdout に出す
3. 2枚目指定:
   `node read.js <Sheets URL> --sheet "Sheet2"` が2枚目 CSV を stdout に出す
4. 範囲指定:
   `node read.js <Sheets URL> --sheet "Sheet2" --range A1:D10`
5. 全シート:
   `node read.js <Sheets URL> --all-sheets` が `drive-read/` に複数 CSV を保存し、同名衝突時だけ fileId suffix を付ける
6. 許可フォルダ外の Spreadsheet URL は従来通り拒否される
7. Google Sheets API 無効時は、Sheets API 有効化を促すエラーになる

## Documentation

更新対象:

- `plugins/google-drive/README.md`
- `plugins/google-drive/SETUP.md`
- `plugins/google-drive/ADMIN_SETUP.md`
- `plugins/google-drive/skills/google-drive-read/SKILL.md`

README の説明は次の方針にする。

- Docs は Markdown
- Sheets は既定では先頭シート CSV
- 2枚目以降は `--sheet` / `--range`
- 全シートは `--all-sheets` で CSV ファイル保存
- Slides は text
- PDF / 画像などは `drive-read/` 保存。同名衝突時だけ fileId suffix を付ける

skill は通常実行例を増やしすぎない。
2枚目以降を読む必要があるとユーザーが言った場合だけ `--sheet` または `--all-sheets` を使うようにする。

## Verification commands

```sh
node --check plugins/google-drive/scripts/read.js
node --check plugins/google-drive/scripts/common.js
node --check plugins/google-drive/scripts/smoke.js
node --test plugins/google-drive/scripts/test/read.test.js
node --test plugins/google-drive/scripts/test/*.test.js
git diff --check -- plugins/google-drive/scripts/read.js plugins/google-drive/scripts/common.js plugins/google-drive/scripts/smoke.js plugins/google-drive/scripts/test plugins/google-drive/README.md plugins/google-drive/SETUP.md plugins/google-drive/ADMIN_SETUP.md plugins/google-drive/skills/google-drive-read/SKILL.md plans/2026-07-23T1624-google-sheets-multi-sheet-read.md .codex/tasks/todo.md
```

## Risks and decisions

- Drive CSV export と Sheets API CSV の結果は完全一致しない可能性がある。新オプションだけ Sheets API にし、既存 default は Drive export のままにして互換性を守る。
- `FORMATTED_VALUE` は UI 表示寄りで扱いやすいが、数値や日付の raw 値が必要な用途には足りない。raw/formula は別タスクにする。
- 大きいシートでは API response と CSV 生成が重くなる。stdout 出力前に CSV byte size を確認し、`--force` なしの巨大出力を止める。
- `--all-sheets` を stdout 連結にすると下流が扱いづらいので、ファイル保存を既定にする。
- `spreadsheets.readonly` scope は追加しない。既存の fail-closed scope 検証を崩さない。

## Implementation order

1. `read.test.js` に CLI / helper / plan の期待を追加する
2. `read.js` に parseArgs / validation / CSV helper を追加する
3. `common.js` に Sheets API helper を追加する
4. `read.js` の main に Sheets API single / all sheets 分岐を追加する
5. `smoke.js` と `smoke.test.js` を更新する
6. README / SETUP / ADMIN_SETUP / skill を更新する
7. 検証コマンドを実行し、`.codex/tasks/todo.md` の checklist とレビューを更新する
