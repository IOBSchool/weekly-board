// データソース: 同リポジトリ内の data.csv を読み込む
// 担当者への変更依頼は Claude Code が data.csv を直接コミット
window.DASHBOARD_CONFIG = {
  csvUrl: "data.csv",
  // 1件あたりの作業分数（所要時間計算用）
  minutesPerPost: 5,
  // キャッシュ回避のためのクエリ付与
  bustCache: true,

  // 共有進捗バックエンド（Google Apps Script Web App）
  // 未設定（空文字）の場合は従来通りlocalStorageのみで動作
  // セットアップ手順は SETUP_SHARED_PROGRESS.md を参照
  progressApiUrl: "",

  // チェック操作者の識別（URLに ?who=kayoko / ?who=natsuko を付ければ上書き）
  defaultWho: "kayoko",

  // 「全件完了を報告」ボタンの通知先メール
  // ⚠️ 公開リポのため個人アドレスは置かない。空=mailto無効（画面上の完了表示のみ）。
  // 恒久策: progressApiUrl（GAS共有バックエンド）を設定すれば実名・メールなしで進捗共有可能。
  reportEmail: ""
};
