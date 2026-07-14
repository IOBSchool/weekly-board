/**
 * Weekly Task Board - 共有進捗バックエンド
 *
 * Google Sheets + Apps Script で、佳代子さんと担当者が
 * 同じチェック状態を見られるようにする。
 *
 * セットアップ手順は ../SETUP_SHARED_PROGRESS.md を参照。
 *
 * 必要なシート構成:
 *   タブ名: progress
 *   列: 週識別子 | 投稿番号 | バッチ | 完了 | 完了時刻 | 操作者
 */

const SHEET_ID = 'SHEET_ID_HERE'; // ← セットアップ時にスプレッドシートIDを貼る
const TAB = 'progress';

function _sheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
}

function _ensureHeader(sh) {
  if (sh.getLastRow() === 0) {
    sh.appendRow(['週識別子', '投稿番号', 'バッチ', '完了', '完了時刻', '操作者']);
  }
}

/**
 * GET: 指定週の完了状態を JSON で返す
 *   ?week=2026-W20
 */
function doGet(e) {
  const week = (e && e.parameter && e.parameter.week) || '';
  const sh = _sheet();
  _ensureHeader(sh);
  const values = sh.getDataRange().getValues();
  const result = {};
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (week && r[0] !== week) continue;
    if (!r[3]) continue;
    const key = String(r[1]) + '-' + String(r[2]);
    result[key] = {
      done: true,
      at: r[4] ? new Date(r[4]).toISOString() : '',
      by: r[5] || ''
    };
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, week: week, checks: result }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST: チェック状態を更新
 *   body (text/plain JSON): { week, num, batch, done, who }
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const week = String(body.week || '');
    const num = String(body.num || '');
    const batch = String(body.batch || '');
    const done = !!body.done;
    const who = String(body.who || '');
    if (!week || !num || !batch) {
      return _json({ ok: false, error: 'missing params' });
    }
    const sh = _sheet();
    _ensureHeader(sh);
    const values = sh.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === week &&
          String(values[i][1]) === num &&
          String(values[i][2]) === batch) {
        rowIndex = i + 1;
        break;
      }
    }
    const now = new Date();
    if (rowIndex > 0) {
      sh.getRange(rowIndex, 4, 1, 3).setValues([[done, done ? now : '', done ? who : '']]);
    } else {
      sh.appendRow([week, num, batch, done, done ? now : '', done ? who : '']);
    }
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
