# google-drive プラグイン: 許可フォルダ方式のファイル参照機能（フェーズ分割）

## Context

google-drive プラグインに、Drive のファイル内容参照を実装する。参照範囲は「許可フォルダ（複数可）の配下のみ」に制限する。
OAuth scope ではフォルダ単位の制限ができないため、プラグインのスクリプト層で閉じ込める。rclone 案と比較検討の結果、依存ゼロ・既存認証の再利用・IDベースの頑丈さを理由に自前実装とする。

### 設計の骨格（確定済み）

- **許可リスト方式**: `~/.config/drive-api/config.json` の `allowedFolderIds`（フォルダID配列・複数ルート可）
- **内容取得はID指定**（パス・名前指定は採らない）。Drive URL には ID が含まれるので URL からの抽出も受ける
- **取得前の所属検証は上方向トラバース**: 渡されたIDから `parents` を許可ルートに突き当たるまで遡る（O(深さ)）。到達→許可。parents なし・ルート到達・深さ50超過・循環・404/403/5xx→拒否（fail-closed）。**401 のみ rethrow**
- 複数 parents はいずれかのチェーンが許可ルートに到達すれば許可
- 共有ドライブ対応: `supportsAllDrives=true` を常時付与
- config 不存在/空 → 読み取り系は案内つきエラー（allowlist なのでデフォルト不可視）。破損・型不正・ID形式不正（`^[A-Za-z0-9_-]+$`）→ 即エラー
- 一覧・探索（Phase 2）は許可ルートから下方向列挙。ツリー外は構造的に視界に入らない

---

## Phase 1: URL/ID を渡されたファイルの読み取り（今回実装）

ユーザーが Drive の URL（または ID）を渡す → エージェントが内容を読める、を最小構成で実現する。
list（発見フェーズ）が無くても、URL 直行ルートは所属検証だけで安全に成立する。

### 1-1. `scripts/allowlist.js`（新規）

- `CONFIG_PATH_ENV = "GOOGLE_DRIVE_CONFIG_PATH"`、`getConfigPath()` → env || `~/.config/drive-api/config.json`
- `loadAllowlist(configPath?)` → `{ allowedFolderIds }`。不存在→空配列、破損/型不正→throw（日本語、パス入り）
- `verifyFileInAllowlist(fileId, { allowedFolderIds, fetchJson })` → `{ allowed, reason }`。上方向トラバース、メモ化 Map、深さ上限50、循環 visited、401 rethrow
- fetchJson は DI（循環 import 防止＋テストシーム）

### 1-2. `scripts/common.js`（拡張）

- 既存 JSON 用 `fetchDriveApi` は不変
- `fetchDriveApiRaw(path, params, options)` 追加: `alt=media` / export 用に Buffer と Content-Type を返す
- 429 / 403(rateLimitExceeded) / 5xx への指数バックオフ（最大3回）

### 1-3. `scripts/read.js`（新規）

```
node read.js <fileId または Drive URL> [--out <dir>] [--format md|txt|csv|pdf]
```

- **URL からの ID 抽出**に対応:
  - `docs.google.com/document/d/<ID>`、`/spreadsheets/d/<ID>`、`/presentation/d/<ID>`
  - `drive.google.com/file/d/<ID>`
  - `drive.google.com/open?id=<ID>`
  - `drive.google.com/drive/folders/<ID>` → フォルダなので「一覧は未対応（Phase 2）」の案内でエラー
- `verifyFileInAllowlist` で所属検証 → 拒否なら「許可フォルダ配下ではありません」で終了
- `files.get(id, fields=name,mimeType,size)` → mimeType 分岐:

| 種別 | 方法 | 出力 |
|---|---|---|
| Google Docs | export `text/markdown` | stdout |
| Google Sheets | export `text/csv`（先頭シートのみ。注記を出力） | stdout |
| Google Slides | export `text/plain` | stdout |
| テキスト系 | `alt=media` | stdout |
| PDF・画像・Office 等 | `alt=media` → 一時ファイル保存（デフォルト `os.tmpdir()/drive-read/`） | 保存パスを表示（Read ツールで読む） |

- export 10MB 上限超過はエラーで案内。alt=media は 50MB 超を `--force` なしで拒否
- access token は出力しない

### 1-4. `skills/google-drive-read/SKILL.md`（新規）

- Triggers: /google-drive-read, 'DriveのURLを読んで', 'このファイルの内容', 'Driveのファイルを読んで' 等
- URL を渡されたらそのまま read.js に渡す（ID 抽出はスクリプト側）
- バイナリの場合は出力された保存パスを Read ツールで読む手順
- 既存規約踏襲: スクリプトはフルパスリテラルで実行、変数展開は使わない

### 1-5. テスト（新規 `scripts/test/`、slack の node:test パターン）

- `allowlist.test.js`: config 正常/不存在/破損/型不正/不正ID、検証（直親許可/祖先許可/ルート到達拒否/parentsなし拒否/複数parents/404拒否/401 throw/循環拒否/メモ化）
- `read.test.js`: URL→ID 抽出（各URL形式・フォルダURL拒否・不正入力）、mimeType 分岐、許可外拒否、10MB export エラー、サイズガード
- 実行: `node --test plugins/google-drive/scripts/test/`

### 1-6. ドキュメント・バージョン

- `SETUP.md`: 「6. 許可フォルダの設定（必須）」— config.json 例、フォルダIDの取得方法（Drive URL の `folders/` 以降）、配下すべてが対象、未設定だと読み取り不可、プラグイン側ガードレールの免責
- `README.md`: `/google-drive-read` をコマンド表に追加、許可フォルダ方式の説明1〜2行
- plugin.json（両方）: version 0.2.0、description 更新

### Phase 1 の検証

1. `node --test plugins/google-drive/scripts/test/` 全 pass
2. config 未設定で read.js → 案内つきエラー
3. 実 Drive: 許可フォルダに Docs と PDF を置き ID を config に設定
   - Docs の URL を read.js に → Markdown が stdout に出る
   - PDF の URL → 保存パスが出て Read で読める
   - **許可ツリー外のファイル URL → 拒否される**（本丸）
   - フォルダを許可ツリー外へ移動 → read が拒否に変わる（鮮度）

---

## Phase 2: 一覧・探索（次回）

- `scripts/list.js`: 許可ルートから下方向再帰列挙（`'X' in parents` OR バッチ）、パスは降下中に name 連結で合成、**パス+ID+mimeType+modifiedTime を出力**、`--query`（name contains）、キャップ（500件/5000フォルダ）打ち切りは明示表示
- `skills/google-drive-list/SKILL.md`: 主フローは「全量一覧→エージェントが選ぶ」（曖昧一致はLLMが得意）、キャップ時のみ --query。取得には必ず ID を使う
- `check-connection.js`: 許可リスト状態の表示追加
- version 0.3.0

## Phase 3 以降（将来）

- 全文検索: 全体 `fullText contains` 検索 → 各ヒットを verifyFileInAllowlist で検証（Phase 1 の検証モジュールを流用）
- 許可ツリー内の一部除外（denylist 併用）: 上方向検証の途中で除外IDに当たったら拒否
- Sheets 複数シート（Sheets API 併用）、フォルダ URL の一覧対応
