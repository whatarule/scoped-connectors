# 既知の Claude Code バグと対応方針

## 1. プラグインスキルの補完が効かない

**バグ**: プラグイン内のスキルが `/` の補完候補に表示されない。
- [anthropics/claude-code#21125](https://github.com/anthropics/claude-code/issues/21125)
- [anthropics/claude-code#18949](https://github.com/anthropics/claude-code/issues/18949)
- [anthropics/claude-code#28555](https://github.com/anthropics/claude-code/issues/28555)
- [anthropics/claude-code#22112](https://github.com/anthropics/claude-code/issues/22112)

**現在の対応**: スキル名に `slack-` プレフィックスを付けて `/slack-` の部分一致で補完させる。
**バグ修正後**: プレフィックスを外して `history`, `channels` 等のシンプルな名前にできる。

## 2. スキルの allowed-tools でコマンド単位の制限が効かない

**バグ**: `allowed-tools` に `Bash(curl:*)` のようにパターンを指定しても動作しない。`Bash` と書いて全許可するしかない。
- [anthropics/claude-code#14956](https://github.com/anthropics/claude-code/issues/14956)

**現在の対応**: `allowed-tools: Bash` で全 Bash を許可。
**バグ修正後**: `Bash(node */skills/slack/scripts/*)` 等に制限できる。

## 3. スキルの allowed-tools が自動承認ではなく制限として機能する

**バグ/機能要望**: `allowed-tools` はツールの使用を「制限」するだけで、記載されたツールを「自動承認」しない。スキル実行中のみ自動承認すべき。
- [anthropics/claude-code#34419](https://github.com/anthropics/claude-code/issues/34419)

**現在の対応**: `allowed-tools: Bash` で全 Bash を許可することで回避。
**バグ修正後**: スキル実行中のみ指定パターンが自動承認されるようになる。

## 4. 自然言語トリガー時に settings.json のパーミッションが継承されない

**バグ**: `/slack:slack` で直接呼び出せば `allowed-tools` が効くが、自然言語でスキルがトリガーされた場合は settings.json のパーミッションが継承されず手動許可を求められる。
- [anthropics/claude-code#18950](https://github.com/anthropics/claude-code/issues/18950)

**現在の対応**: curl を廃止し Node.js スクリプトで API を直接呼ぶことで Bash コマンドの変数展開を排除。これにより自然言語トリガーでもセキュリティチェックに引っかからなくなった。
**バグ修正後**: curl + 変数展開でも自然言語トリガーで動作するようになるが、現在の fetch ベースの方がシンプルなので戻す必要はない。

## 5. Cowork で自作プラグインが正常に動作しない

**バグ**: Cowork（Claude Desktop）で自作プラグインのアップロード・マーケットプレイス連携に複数の問題がある。
- [anthropics/claude-code#40772](https://github.com/anthropics/claude-code/issues/40772) — zip/.plugin ファイルのアップロードが失敗
- [anthropics/claude-code#40414](https://github.com/anthropics/claude-code/issues/40414) — .plugin ファイルがファイルピッカーで選べるが拒否される
- [anthropics/claude-code#28125](https://github.com/anthropics/claude-code/issues/28125) — プライベート GitHub マーケットプレイスが追加できない
- [anthropics/claude-code#40475](https://github.com/anthropics/claude-code/issues/40475) — 個人マーケットプレイスのプラグインが再起動で消える
- [anthropics/claude-code#40773](https://github.com/anthropics/claude-code/issues/40773) — マーケットプレイス同期プラグインが再起動で消える
- [anthropics/claude-code#39400](https://github.com/anthropics/claude-code/issues/39400) — マーケットプレイスプラグインのスキルが Cowork で読み込まれない

**現在の対応**: CLI（`claude plugin marketplace add` / `claude plugin install`）を使用。Cowork からのプラグイン管理は避ける。
**バグ修正後**: Cowork の GUI からプラグインのインストール・管理ができるようになる。
