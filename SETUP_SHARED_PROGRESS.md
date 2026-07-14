# 共有進捗バックエンド セットアップ手順

佳代子さんがチェックした内容を、担当者の画面でも見られるようにする仕組み。
Google Sheets + Apps Script で、追加費用なしで実装。

所要時間：約10〜15分。

---

## 全体像

```
[佳代子さんのブラウザ（編集モード）]
   ↓ チェック → POST
[Google Apps Script Web App]
   ↓ 書き込み
[Google Sheet 「progress」シート]
   ↑ 読み込み（GET）
[担当者のブラウザ（閲覧モード）] ← 完了状態がリアルタイムで見える
```

---

## ステップ1：Google Sheet を新規作成

※ data.csvはリポジトリ内の静的ファイルなので、進捗管理は別の新しいSheetを作る。

1. Google Drive を開く → 「新規」→「Google スプレッドシート」→ 空白のスプレッドシート
2. ファイル名を **`weekly-board-progress`** にリネーム
3. 開いたシート（デフォルトでは「シート1」）のタブ名を **`progress`**（半角小文字）にリネーム
   - 下部の「シート1」をダブルクリック → `progress` と入力 → Enter
4. 1行目に以下のヘッダを入力（A1〜F1）：

   | A | B | C | D | E | F |
   |---|---|---|---|---|---|
   | 週識別子 | 投稿番号 | バッチ | 完了 | 完了時刻 | 操作者 |

5. A2以降は空でOK（スクリプトが自動追記）
6. URLからスプレッドシートIDをコピー
   - URL: `https://docs.google.com/spreadsheets/d/【ここがID】/edit`
   - 【ここがID】の部分（英数字の長い文字列）

---

## ステップ2：Apps Script デプロイ

1. 作成した `weekly-board-progress` スプレッドシートのメニュー：**拡張機能 → Apps Script**
2. 開いたプロジェクトの `Code.gs` の中身を全削除
3. このリポジトリの `backend/Code.gs` の中身を全コピペ
4. 4行目 `const SHEET_ID = 'SHEET_ID_HERE';` の `SHEET_ID_HERE` を、
   ステップ1でコピーしたスプレッドシートIDに書き換え
5. プロジェクト名を「Weekly Board Progress」に変更 → 💾保存

6. 右上の **「デプロイ」 → 「新しいデプロイ」**
7. 歯車アイコン → **「ウェブアプリ」** を選択
8. 設定：
   - 説明：`v1`
   - 次のユーザーとして実行：**「自分」**
   - アクセスできるユーザー：**「全員」**
9. 「デプロイ」→ 初回はGoogle認証ダイアログ
   - 「詳細」→「（プロジェクト名）に移動」→「許可」
10. デプロイ完了画面の **「ウェブアプリ URL」をコピー**
    - 形式：`https://script.google.com/macros/s/AKfycb.../exec`

---

## ステップ3：ダッシュボードに反映

1. `config.js` を開く
2. `progressApiUrl: ""` の `""` の中に、ステップ2のURLを貼る：

   ```js
   progressApiUrl: "https://script.google.com/macros/s/AKfycb.../exec",
   ```

3. 保存 → GitHubにpush

---

## ステップ4：動作確認

### 佳代子さん側（編集モード・既存ブクマそのまま）
- 公開URLに何もパラメータを付けないか、`?who=kayoko`
- チェックボックスを押すとGoogle Sheetの`progress`タブに即書き込み

### 担当者側（閲覧モード）
- 公開URLの末尾に **`?who=natsuko`** を付けてブクマ
  例：`https://iobschool.github.io/weekly-board/?who=natsuko`
- チェックボックスはグレーアウト（読み取り専用 → 誤チェック防止）
- 佳代子さんの完了状態がリアルタイムで見える
- 完了済みカードには `✅ 完了 / 5/14 14:32 / kayoko` のバッジ表示

### 進捗共有のリフレッシュ
- 右上「🔄 最新に更新」ボタンでサーバから最新状態を再取得

---

## トラブルシュート

### Q. チェックを押してもSheetに反映されない
- ブラウザのコンソール（F12 → Console）でエラー確認
- `progressApiUrl` が `/exec` で終わっているか
- Apps Scriptデプロイ時に「アクセスできるユーザー：全員」になっているか

### Q. 担当者側で何も見えない
- 公開URLに `?who=natsuko` を付けたか
- Sheetの`progress`タブの「週識別子」列が今週のISO週と一致しているか

### Q. 過去週のデータも見たい
- `progress` Sheetをそのまま開けば、全週分の履歴が残っている

---

## セキュリティ注意

- Apps Script Web App URLは「URLを知っている人なら誰でも呼べる」状態
- このURLは公開リポジトリの `config.js` に入るため、外部から見える状態
- 想定リスク：第三者が悪意でチェック状態を書き換える
- 影響範囲：Sheet `progress` タブのみ。実害は小（Sheetを開けば手動で巻き戻せる）
- 受け入れ可能と判断する場合のみセットアップしてください
