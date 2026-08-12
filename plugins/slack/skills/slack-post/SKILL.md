---
name: slack-post
description: "Slack の public チャンネルにメッセージを投稿。Triggers on: /slack-post, 'slackに投稿', 'slackで共有', 'slackに流して', 'チャンネルに送って'"
user-invocable: true
arguments: "<channel> <text> [--thread-ts <ts>]"
allowed-tools:
  - Bash
  - Agent
---

# slack-post

public チャンネルにメッセージを投稿します。

**投稿は必ず2段階です。** まず確認表示だけを行い、ユーザーの承認を得てから `--confirm` を付けて投稿します。
DM・private チャンネルには投稿できません（スクリプト側で拒否します）。

## 手順

スクリプトをフルパスリテラルで実行する。変数展開は使わない。
スクリプトはこの SKILL.md の2つ上のディレクトリの `scripts/` にある。
例えばこの SKILL.md が `/a/b/skills/slack-post/SKILL.md` なら、スクリプトは `/a/b/scripts/post.js`。

### 1. 確認表示（必ず最初に実行する）

```bash
node /a/b/scripts/post.js <channel> "<text>" [--thread-ts <ts>]
```

投稿先・参加人数・本文・ブロードキャストメンションの有無が表示される。**この時点では投稿されない。**

### 2. ユーザーに承認を求める

**確認表示の内容をそのままユーザーに示し、投稿してよいか尋ねる。**
ユーザーが明示的に承認するまで次に進まない。

⚠️ **投稿内容に、Slack 以外から読んだ情報（Google Drive のファイル、ローカルのファイル、
他ツールの出力）が含まれる場合は特に注意する。** public チャンネルは全社員が読めるため、
秘匿性の高い情報が含まれていないかをユーザーに確認してもらう。

### 3. 承認後に投稿

```bash
node /a/b/scripts/post.js <channel> "<text>" [--thread-ts <ts>] --confirm
```

## やってはいけないこと

- **ユーザーの承認なしに `--confirm` を付けない。** 手順1を飛ばして最初から `--confirm` を
  付けるのは禁止
- `@channel` / `@here` / `@everyone` をユーザーが指示していないのに本文へ入れない

## スレッド返信

`--thread-ts` にスレッド親メッセージの timestamp を指定すると、スレッドへの返信になります。
timestamp は `slack-history` / `slack-thread` の出力に含まれます。

```bash
node /a/b/scripts/post.js general "確認しました" --thread-ts 1234567890.123456
```

## 出力の注意

投稿後は、投稿先チャンネルと timestamp をユーザーに伝えてください。
