# Google Drive バイナリ内容確認の capability-based 仕様

## 2026-07-28 拡張方針

PDFだけを特別扱いすると、画像、Word、Excel、PowerPointなどで
「保存済み」と「内容確認済み」の境界が曖昧になる。
そのため、PDF向けに導入した状態管理をすべてのバイナリ形式へ一般化する。

- `read.js` はバイナリを保存し、ファイル名・MIME type・絶対保存 path を提示する
- skill は保存された形式に対応する tool / skill が現在の session に公開されている場合だけ内容を確認する
- 内容を実際に取得できた場合だけ要約・回答する
- capability がない場合は、形式・内容未確認・絶対保存 path を明示して停止する
- capability が失敗した場合は、失敗理由・内容未確認・絶対保存 path を明示して停止する
- PDFのpage range手順は、バイナリ共通フロー内のPDF固有ルールとして維持する
- parser、renderer、変換script、virtual environment、dependencyは追加しない

対象例は PDF、画像、Word、Excel、PowerPoint、音声、動画、archive とする。
ただし「取得対応」は「内容確認対応」を意味しない。対応 capability がない形式は保存のみで完了する。

### 拡張実装計画

- [x] `SKILL.md` のPDF固有セクションをバイナリ共通フローへ一般化する
- [x] PDF、画像、Office形式ごとの既存 capability 選択を明記する
- [x] capability 不在・失敗時の共通 user-facing template を定義する
- [x] README にPDF以外のバイナリ形式も同じ契約であることを明記する
- [x] 画像、Office、テキスト経路の回帰テストを追加する
- [x] 現行skillとの比較evalを行う
- [x] 全テスト、plugin validation、依存追加監査、active cache smokeを行う

## 背景

現行の `google-drive-read` は、Google Docs / Sheets / Slides / テキストファイルでは
内容を stdout に出す一方、PDF を含むバイナリはローカルへ保存し、
その後の確認をホスト側の `Read` ツールへ委譲している。

実装上も次の状態になっている。

- `read/contract.js` は PDF を `toStdout: false` に分類する
- `read/use-case.js` は PDF の buffer を取得するだけで、解析しない
- `read/presenter.js` は保存後に「Read ツールで読んでください」と表示する
- `google-drive-read` skill は PDF の本文抽出・描画方法を同梱していない
- テストは疑似的な `pdf-bytes` の保存を確認するだけで、有効な PDF の内容確認を証明していない

## 公式機能確認による前提修正

Claude Code の公式 Tools reference は、標準 `Read` が PDF を直接読めると明記している。

- 短い PDF は全体を読む
- 10ページを超える PDF は `pages` parameter で範囲指定する
- 1回につき最大20ページを読む
- working directory 外の path は permission 対象になる

したがって Claude Code では、Drive から保存した PDF の絶対 path を `Read` に渡すのが
第一選択であり、独自 PDF engine は通常不要である。

Codex / ChatGPT は PDF attachment と PDF skill workflow を提供しているが、
Claude Code の `Read(path, pages)` と同等のローカル PDF tool がすべての Codex surface で
利用できるという公式契約は確認できなかった。
そのため、Codex では実行 surface に callable な PDF capability がある場合だけ内容を確認する。

## 結論

PDF parser / renderer とその依存 library を持つ独自 script は実装しない。
provider / surface ごとの既存 PDF capability がある場合だけ内容を確認する。

- Claude Code
  - 保存済み PDF を標準 `Read` へ渡す
  - 10ページ超は最大20ページずつ全ページを読む
- Codex
  - PDF attachment / local file / PDF skill の利用可否を surface ごとに確認する
  - callable な native PDF 経路があればそれを使う
  - PDF 読取手段がない surface では内容確認を行わない

読取手段がない場合も Drive からのダウンロードは完了させる。
回答では「保存済み」と「内容未確認」を明確に分け、保存 path を提示する。
実行中に dependency を install したり、臨時 parser script を作ったりしない。

## 目標

- `$google-drive-read <PDF URL>` が、利用中 surface の native PDF 機能を優先して
  ダウンロード後の内容確認まで完了する
- Claude Code では標準 `Read` だけで全ページを確認できる
- Codex では surface ごとの callable capability を確認し、利用可能な native 経路を使う
- PDF 読取手段がない場合は、内容を読んだように回答せず未確認を明示する
- 元 PDF は変更・削除しない
- plugin に PDF parser / renderer library を同梱しない
- 通常実行中に `brew`、`pip`、`uv`、`npm` などで dependency を追加しない
- 臨時の解析 script や virtual environment を作らない
- Codex 固有 runtime や plugin cache の絶対 path を plugin の契約にしない

## 初期スコープ

### 対象

- Drive から取得した `application/pdf`
- Google Docs / Sheets / Slides を `--format pdf` で export した PDF
- Drive から取得した画像、Word、Excel、PowerPoint、音声、動画、archive、その他のバイナリ
- 複数ページ、日本語・空白を含むファイルパス
- 実行 surface に対象形式の既存 capability がある場合の内容確認
- 対象形式の capability がない場合の明示的な未確認通知

### 対象外

- OCR
- plugin 独自の PDF parser / renderer
- PDF library / binary / WebAssembly runtime の同梱
- 実行時 dependency install
- 読取 capability がない環境での内容確認
- PDF 本体の編集、最適化、再保存
- パスワード入力が必要な暗号化 PDF の解除
- Drive API の認証・allowlist 仕様変更
- Google Sheets の複数シート対応

どのバイナリ形式も、対応済みと誤認させず「保存までは完了、内容確認は未対応」と
MIME type・絶対保存 path 付きで明示する。

## Native capability の設計ゲート

skill 実行時に、その session へ公開されている tool / skill だけを確認する。

- 対象形式に対応する `Read` または専用 tool / skill が公開されていれば、その公開手順を使う
- native 経路で本文・図表・必要ページを確認できた場合だけ内容確認済みとする
- capability がない場合、処理を拡張せず「内容未確認」へ分岐する
- surface 名だけを根拠に capability の存在を仮定しない

capability 判定のために dependency を install しない。
skill は利用中 session に見えている tools / skills だけを根拠にする。

## ユーザー向け状態と表示

### 内容確認済み

対象形式の capability で実際に内容を取得できた場合だけ、内容の要約や回答を返す。
必要に応じて保存 path と使用した capability を短く添える。

### ダウンロード済み・内容未確認

バイナリを保存できたが対象形式の capability がない場合、次の情報を省略しない。

```text
ファイルをダウンロードしましたが、この形式の内容を読み取る手段がないため、
内容は確認していません。
形式: <MIME type>
保存先: <absolute path>
ローカルの対応アプリで確認してください。
```

### 内容確認失敗

対象形式の capability はあるが暗号化、破損、未対応機能、page / size limit などで読めなかった場合、
ダウンロード済みか、MIME type、未確認、具体的な失敗理由、絶対保存 path を返す。
別 library / converter の install や臨時 script 作成は提案・実行しない。

## Skill の処理フロー

1. `read.js` に Drive URL をそのまま渡す
2. Google native text / text MIME の場合は、従来どおり stdout を回答に使う
3. 保存結果がバイナリの場合は、そのMIME typeに対応する公開済み tool / skill を確認する
4. PDFはPDF対応の `Read` / PDF skillへ絶対 path を渡す
5. PDFが10ページ超の場合は20ページ以下の range に分けて必要なページを読む
6. 画像・Office・その他の形式も、その形式への対応が明示された capabilityだけを使う
7. native 経路がなければ、内容を確認せず規定の「ダウンロード済み・内容未確認」を返す
8. native 経路が失敗した場合も、別 parser の導入へ進まず失敗理由を返す
9. 元 PDF は保持する
10. すべてのバイナリで、MIME type・保存先・内容確認状態を明示する

`SKILL.md` は `Read` を無条件に仮定せず、provider / surface capability に応じて分岐させる。

## テスト計画

### Unit / integration

- バイナリ保存後の message が、内容確認済みと誤認させない
- 保存結果から absolute path と MIME type を取得できる
- 日本語・空白を含む path をそのまま user-facing message に出せる
- 対象形式に対応する tool / skill が利用できる場合だけ内容確認経路へ進む
- capability がない場合は「内容未確認」と保存 path を返す
- capability が失敗した場合は理由と「内容未確認」を返す
- capability 不足時に install command や臨時 script を実行しない
- PDF、画像、Office、archive が同じ保存・状態遷移を通る
- Drive 上の通常 PDF と `--format pdf` export が同じ状態遷移を通る
- 元ファイルを変更・削除しない

### Skill eval

`skill-creator` の手順に従い、旧 skill を snapshot して比較する。

1. embedded text を持つ複数ページ PDF の URLを読ませる
2. PDF capability がない session で、ダウンロード後に内容未確認を明示させる
3. Google Docs の URLを読ませ、既存の Markdown 経路を壊していないことを確かめる
4. PDF 以外のバイナリで未対応を正確に伝えることを確かめる

客観評価は次を確認する。

- 内容を取得できた場合だけ要約・回答する
- capability がない場合は内容未確認と保存 path を明示する
- 実行時インストールや臨時 script 作成を行わない
- 元 PDF を削除しない
- token を出力しない

`evals/evals.json`、各 run の出力、grading、benchmark を作り、
`eval-viewer/generate_review.py` の static viewer で人間が旧 skill と比較できるようにする。

### 配布後 smoke

- `node --test plugins/google-drive/scripts/test/*.test.js`
- `claude plugin validate plugins/google-drive`
- PDF capability あり / なしの各 session で skill の表示を確認する
- 許可済み Drive 上の PDF でダウンロードと状態表示を確認する
  - レポートには機密本文を残さず、内容確認済み / 未確認の状態だけを記録する
- active plugin cache へ同期後、同じ smoke を行う
- `git diff --check`

## 実装結果

### Phase 0: Native PDF capability gate

- [x] session に公開された tool / skill だけを根拠にする設計へ固定した
- [x] capability がない場合を「ダウンロードのみ・内容未確認」に固定した
- [x] 独自 engine、parser script、dependency install を対象外として再確認した

### Phase 1: Skill の native PDF routing

- [x] `Read` の絶対 path / page range 手順を skill に実装した
- [x] 公開済み PDF tool / skill を使う routing を実装した
- [x] capability がない場合の「内容未確認」表示を実装した
- [x] native capability の失敗理由を user-facing に伝える契約を実装した
- [x] Google Docs / Sheets / Slides の既存 stdout 経路を維持した

### Phase 2: Drive read workflow への接続

- [x] `read.js` の保存結果を中立な絶対保存先表示へ変更した
- [x] `google-drive-read` skill を PDF の end-to-end フローへ更新した
- [x] PDF 以外の未対応バイナリの案内を明示した
- [x] README と skill の仕様を実態に合わせた

### Phase 3: Skill eval と改善

- [x] 旧 skill snapshot と新 skill の eval を実行した
- [x] grading / benchmark / static review viewer を生成した
- [x] 新 skill 100%、旧 skill 77.5% の結果を確認した

### Phase 4: 配布検証

- [x] plugin validation と CLI smoke を行った
- [x] active cache へ同期し、skill の一致と CLI help を確認した
- [x] plugin に PDF library / parser script / dependency install が追加されていないことを監査した

### Phase 5: Final audit

- [x] 全 Google Drive tests 173件と skill eval の証跡を確認した
- [x] 保存処理を変更せず、元 PDF を保持する契約を維持した
- [x] docs、skill、CLI、実装、テストの契約が一致することを確認した

## 既存変更との境界

実装開始時の差分を確認し、既存の未追跡計画ファイルを変更・削除しない。
PDF capability 対応は README、skill、presenter、関連テストの必要箇所に限定する。

## 完了条件

- PDF capability がある場合は、PDF の取得、必要ページの確認、回答までが一つの skill 実行で完了する
- Claude Code では標準 `Read` を使い、独自 PDF engine を要求しない
- Codex では対象 surface の native capability を優先する
- PDF capability がない場合は、ダウンロード済み・内容未確認・保存 path を明示する
- PDF capability が失敗した場合は、内容未確認と具体的な理由を明示する
- plugin に PDF library / parser script / binary / WebAssembly runtime を追加しない
- 実行時 dependency install や臨時 script 作成を行わない
- 対応外形式は対応済みと見せず、正確な制限を返す
- 元 PDF を保持する
- unit / integration / skill eval / plugin validation / active cache smoke がすべて成功する
- README、SKILL.md、CLI help、manifest capability が実装と一致する
