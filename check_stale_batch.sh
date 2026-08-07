#!/bin/bash
# Warn about stale バッチ (火曜/金曜) labels in data.csv.
#
# A batch label records which handoff day (Tuesday/Friday) a set of
# Flodesk/Vimeo編集/サイト運用 rows was actually dispatched to 佳代子さん on.
# If a batch's oldest 投稿日 has already passed relative to today, but
# the label doesn't match today's real weekday, the batch is being
# worked/handed off late and the label is stale — it should be
# relabeled to today's actual weekday before committing.
#
# Run this before every `git push` that touches data.csv.

set -euo pipefail
cd "$(dirname "$0")"

today=$(date +%Y-%m-%d)
today_wd_num=$(date +%u)   # 1=Mon..7=Sun
case $today_wd_num in
  1) today_wd_jp="月" ;;
  2) today_wd_jp="火" ;;
  3) today_wd_jp="水" ;;
  4) today_wd_jp="木" ;;
  5) today_wd_jp="金" ;;
  6) today_wd_jp="土" ;;
  7) today_wd_jp="日" ;;
esac

echo "今日: $today (${today_wd_jp}曜日)"
echo "---"

awk -F',' -v today="$today" -v today_wd="$today_wd_jp" '
function norm(d,   parts, y, m, dd) {
  if (d == "") return ""
  split(d, parts, "/")
  y = parts[1]; m = parts[2]; dd = parts[3]
  return sprintf("%04d-%02d-%02d", y, m, dd)
}
NR==1 { next }
{
  week=$1; batch=$2; posted=norm($5)
  if (batch != "火曜" && batch != "金曜") next
  if (posted == "") next
  key = week SUBSEP batch
  if (!(key in minDate) || posted < minDate[key]) minDate[key]=posted
  if (!(key in maxDate) || posted > maxDate[key]) maxDate[key]=posted
  count[key]++
}
END {
  found=0
  for (k in minDate) {
    split(k, parts, SUBSEP)
    week=parts[1]; batch=parts[2]
    batch_wd = (batch=="火曜") ? "火" : "金"
    # Only flag batches that are still live (their date range reaches
    # today or later) — a batch entirely in the past is finished
    # history, not a mislabeled pending task.
    if (minDate[k] < today && maxDate[k] >= today && batch_wd != today_wd) {
      found=1
      printf "\xe2\x9a\xa0\xef\xb8\x8f stale batch: %s / %s (%d rows, %s〜%s, oldest already past) — batch says %s曜 but today is %s曜. Consider relabeling to %s曜.\n", week, batch, count[k], minDate[k], maxDate[k], batch_wd, today_wd, today_wd
    }
  }
  if (!found) print "問題なし: 火曜/金曜バッチのラベルは今日時点で矛盾なし"
}' data.csv
