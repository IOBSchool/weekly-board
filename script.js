(function () {
  const cfg = window.DASHBOARD_CONFIG || {};

  // ===== URLパラメータ =====
  function getParam(name) {
    const m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }
  const WHO = getParam('who') || cfg.defaultWho || 'kayoko';
  const ROLE = getParam('role') || (WHO === 'natsuko' ? 'viewer' : 'editor');

  // ===== ISO週の算出 =====
  function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + "-W" + String(weekNum).padStart(2, "0");
  }

  // ===== CSVパーサ =====
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { cell += c; }
      } else {
        if (c === '"') { inQ = true; }
        else if (c === ",") { row.push(cell); cell = ""; }
        else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
        else if (c === "\r") { /* skip */ }
        else { cell += c; }
      }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1)
      .filter(r => r.some(c => c && c.trim()))
      .map(r => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = (r[i] || "").trim());
        return obj;
      });
  }

  // ===== プレビュー用: ?week=2026-W36 で任意の週を表示確認できる =====
  function isoWeekStartDate(weekStr) {
    const [yStr, wStr] = weekStr.split("-W");
    const y = parseInt(yStr, 10), w = parseInt(wStr, 10);
    const jan4 = new Date(y, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Day + 1);
    const monday = new Date(week1Monday);
    monday.setDate(week1Monday.getDate() + (w - 1) * 7);
    return monday;
  }

  // ===== localStorage（フォールバック/キャッシュ） =====
  const weekOverride = getParam('week');
  const currentWeek = weekOverride || getISOWeek(new Date());

  function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = (x) => `${x.getMonth() + 1}/${x.getDate()}`;
    return `${fmt(mon)}〜${fmt(sun)}`;
  }
  const weekRange = getWeekRange(weekOverride ? isoWeekStartDate(weekOverride) : new Date());
  const storageKey = "weekly-board:" + currentWeek;
  function loadLocalChecks() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); }
    catch { return {}; }
  }
  function saveLocalChecks(obj) { localStorage.setItem(storageKey, JSON.stringify(obj)); }
  Object.keys(localStorage)
    .filter(k => k.startsWith("weekly-board:") && k !== storageKey)
    .forEach(k => localStorage.removeItem(k));

  // ===== 共有バックエンド（GAS） =====
  const useShared = !!cfg.progressApiUrl;

  async function fetchSharedChecks() {
    if (!useShared) return null;
    try {
      const url = cfg.progressApiUrl + (cfg.progressApiUrl.includes('?') ? '&' : '?')
        + 'week=' + encodeURIComponent(currentWeek) + '&t=' + Date.now();
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) return null;
      const json = await res.json();
      return json && json.checks ? json.checks : {};
    } catch (e) {
      console.warn('fetchSharedChecks failed', e);
      return null;
    }
  }

  function postSharedCheck(num, batch, done) {
    if (!useShared) return;
    const body = JSON.stringify({
      week: currentWeek, num: String(num), batch: String(batch),
      done: !!done, who: WHO
    });
    // text/plain で送ることでpreflight回避（GAS制約）
    fetch(cfg.progressApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    }).catch(e => console.warn('postSharedCheck failed', e));
  }

  // 統合checks (key -> { done, at, by })
  let CHECKS = {};
  function getCheckMeta(key) {
    const v = CHECKS[key];
    if (!v) return null;
    if (v === true) return { done: true };
    return v.done ? v : null;
  }

  // ===== データ取得 =====
  async function fetchData() {
    if (!cfg.csvUrl || cfg.csvUrl.includes("ここに")) {
      return { error: "config.jsにCSV公開URLを設定してください。" };
    }
    const url = cfg.bustCache ? cfg.csvUrl + (cfg.csvUrl.includes("?") ? "&" : "?") + "t=" + Date.now() : cfg.csvUrl;
    try {
      const res = await fetch(url);
      if (!res.ok) return { error: "データ取得に失敗しました（" + res.status + "）" };
      const text = await res.text();
      const objs = rowsToObjects(parseCSV(text));
      return { data: objs };
    } catch (e) {
      return { error: "ネットワークエラー: " + e.message };
    }
  }

  // ===== 描画 =====
  const mediaEmoji = {
    "Instagram": "📷", "Facebook": "📘", "Threads": "🧵",
    "note": "📝", "YouTube": "▶️", "Flodesk": "✉️"
  };

  function fmtDateTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return ''; }
  }

  function cardHTML(p, meta) {
    const emoji = mediaEmoji[p["媒体"]] || "📌";
    const key = p["投稿番号"] + "-" + p["バッチ"];
    const when = [p["投稿日"], p["投稿時刻"], p["曜日"] ? "(" + p["曜日"] + ")" : ""].filter(Boolean).join(" ");
    const links = [];
    if (p["本文ファイルURL"]) {
      const url = p["本文ファイルURL"];
      const isVimeoVideo = /vimeo\.com/.test(url);
      const linkLabel = p["媒体"] === "Vimeo編集"
                          ? (isVimeoVideo ? "🎬 元動画" : "📄 依頼書")
                      : p["媒体"] === "Instagram" ? "📁 FINAL素材"
                      : p["媒体"] === "サイト運用" ? "📘 手順書"
                      : "📄 メール本文";
      links.push(`<a href="${p["本文ファイルURL"]}" target="_blank" rel="noopener">${linkLabel}</a>`);
    }
    if (p["素材フォルダURL"]) {
      const subLabel = p["媒体"] === "Instagram" ? "🎯 共通CTA"
                     : p["媒体"] === "サイト運用" ? "📁 配布物"
                     : "📁 素材";
      links.push(`<a href="${p["素材フォルダURL"]}" target="_blank" rel="noopener">${subLabel}</a>`);
    }
    if (p["予約ツールURL"]) links.push(`<a href="${p["予約ツールURL"]}" target="_blank" rel="noopener">🔗 予約ツール</a>`);
    const note = p["特記事項"] ? `<div class="note">💡 ${escapeHTML(p["特記事項"])}</div>` : "";
    const stepTitle = p["ステップ"] ? `<div class="step-title">${escapeHTML(p["ステップ"])}</div>` : "";
    const checked = !!(meta && meta.done);
    let badge = '';
    if (checked) {
      const t = meta && meta.at ? fmtDateTime(meta.at) : '';
      const by = meta && meta.by ? escapeHTML(meta.by) : '';
      const parts = ['✅ 完了'];
      if (t) parts.push(t);
      if (by) parts.push(by);
      badge = `<span class="done-badge">${parts.join(' / ')}</span>`;
    }
    const disabled = ROLE === 'viewer' ? 'disabled' : '';
    return `
      <div class="card ${checked ? "done" : ""}" data-key="${escapeAttr(key)}" data-num="${escapeAttr(p["投稿番号"])}" data-batch="${escapeAttr(p["バッチ"])}">
        <div class="card-top">
          <input type="checkbox" ${checked ? "checked" : ""} ${disabled} aria-label="完了">
          <span class="num">#${escapeHTML(p["投稿番号"])}</span>
          <span class="media">${emoji} ${escapeHTML(p["媒体"])}</span>
          <span class="when">📅 予約日時：${escapeHTML(when)}</span>
          ${badge}
        </div>
        ${stepTitle}
        <div class="links">${links.join("")}</div>
        ${note}
      </div>
    `;
  }

  function escapeHTML(s) { return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function escapeAttr(s) { return escapeHTML(s); }

  let THIS_WEEK_POSTS = [];
  let THIS_WEEK_PENDING = { tue: [], fri: [], carousel: [] };
  function render(posts) {
    const thisWeek = posts.filter(p => p["週識別子"] === currentWeek);
    THIS_WEEK_POSTS = thisWeek;
    // 完了済みはボードから消す（記録はGoogle Sheets側の進捗シートに残る）
    const pending = thisWeek.filter(p => !getCheckMeta(p["投稿番号"] + "-" + p["バッチ"]));
    const tue = pending.filter(p => p["バッチ"] === "火曜");
    const fri = pending.filter(p => p["バッチ"] === "金曜");
    const carousel = pending.filter(p => p["バッチ"] === "カルーセル");

    const mins = cfg.minutesPerPost || 5;
    const roleLabel = ROLE === 'viewer' ? '（閲覧モード）' : '';
    document.getElementById("weekLabel").textContent =
      `今週（${weekRange}）の予約投稿 / 残り${pending.length}件（全${thisWeek.length}件）・所要時間目安 約${pending.length * mins}分 ${roleLabel}`;

    // 火曜・金曜の作業日を動的に表示
    const today = new Date();
    const dayN = today.getDay() || 7;
    const monday = new Date(today); monday.setDate(today.getDate() - dayN + 1);
    const tueDt = new Date(monday); tueDt.setDate(monday.getDate() + 1);
    const friDt = new Date(monday); friDt.setDate(monday.getDate() + 4);
    const fmtFull = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    const tueEl = document.getElementById("tueDate");
    const friEl = document.getElementById("friDate");
    if (tueEl) tueEl.textContent = `${fmtFull(tueDt)} (火)`;
    if (friEl) friEl.textContent = `${fmtFull(friDt)} (金)`;

    renderBatch("cardsTue", "countTue", tue, mins);
    renderBatch("cardsFri", "countFri", fri, mins);
    renderBatch("cardsCarousel", "countCarousel", carousel, mins);

    // 空のセクションは丸ごと非表示（混乱防止）
    const toggleSection = (id, hasContent) => {
      const el = document.getElementById(id);
      if (el) el.hidden = !hasContent;
    };
    toggleSection("batchTue", tue.length > 0);
    toggleSection("batchFri", fri.length > 0);
    toggleSection("batchCarousel", carousel.length > 0);

    updateProgress(thisWeek);
    THIS_WEEK_PENDING = { tue, fri, carousel };

    // チェックイベント
    document.querySelectorAll(".card").forEach(card => {
      const cb = card.querySelector("input[type=checkbox]");
      if (!cb || cb.disabled) return;
      cb.addEventListener("change", () => {
        const key = card.dataset.key;
        const num = card.dataset.num;
        const batch = card.dataset.batch;
        const done = cb.checked;
        // 共有書き込み
        postSharedCheck(num, batch, done);
        // ローカルキャッシュ
        const local = loadLocalChecks();
        if (done) local[key] = true; else delete local[key];
        saveLocalChecks(local);
        // 統合state更新
        if (done) {
          CHECKS[key] = { done: true, at: new Date().toISOString(), by: WHO };
        } else {
          delete CHECKS[key];
        }
        if (done) {
          // 完了したらフェードアウトしてボードから消す（記録はGoogle Sheetsの進捗シートに残る）
          card.classList.add("done", "fading-out");
          setTimeout(() => {
            const batchKey = batch === "火曜" ? "tue" : batch === "金曜" ? "fri" : "carousel";
            const list = THIS_WEEK_PENDING[batchKey];
            const idx = list.findIndex(p => (p["投稿番号"] + "-" + p["バッチ"]) === key);
            if (idx !== -1) list.splice(idx, 1);
            card.remove();
            const cardsIdMap = { tue: "cardsTue", fri: "cardsFri", carousel: "cardsCarousel" };
            const countIdMap = { tue: "countTue", fri: "countFri", carousel: "countCarousel" };
            const sectionIdMap = { tue: "batchTue", fri: "batchFri", carousel: "batchCarousel" };
            const mins = cfg.minutesPerPost || 5;
            const countEl = document.getElementById(countIdMap[batchKey]);
            if (countEl) countEl.textContent = list.length ? `${list.length}件・約${list.length * mins}分` : "";
            if (!list.length) {
              const cardsEl = document.getElementById(cardsIdMap[batchKey]);
              if (cardsEl) cardsEl.innerHTML = `<div class="empty">✅ 今週分は完了しました</div>`;
              const sectionEl = document.getElementById(sectionIdMap[batchKey]);
              if (sectionEl) sectionEl.hidden = true;
            }
            const pendingTotal = THIS_WEEK_PENDING.tue.length + THIS_WEEK_PENDING.fri.length + THIS_WEEK_PENDING.carousel.length;
            const weekLabelEl = document.getElementById("weekLabel");
            if (weekLabelEl) {
              const roleLabel = ROLE === 'viewer' ? '（閲覧モード）' : '';
              weekLabelEl.textContent = `今週（${weekRange}）の予約投稿 / 残り${pendingTotal}件（全${thisWeek.length}件）・所要時間目安 約${pendingTotal * mins}分 ${roleLabel}`;
            }
          }, 350);
        } else {
          card.classList.remove("done");
        }
        updateProgress(thisWeek);
      });
    });
  }

  function renderBatch(cardsId, countId, list, mins) {
    const countEl = document.getElementById(countId);
    const cardsEl = document.getElementById(cardsId);
    if (countEl) countEl.textContent = list.length ? `${list.length}件・約${list.length * mins}分` : "";
    if (!cardsEl) return;
    if (!list.length) { cardsEl.innerHTML = `<div class="empty">今週の予定はありません</div>`; return; }
    cardsEl.innerHTML = list.map(p => {
      const key = p["投稿番号"] + "-" + p["バッチ"];
      return cardHTML(p, getCheckMeta(key));
    }).join("");
  }

  function updateProgress(list) {
    const total = list.length;
    const done = list.filter(p => getCheckMeta(p["投稿番号"] + "-" + p["バッチ"])).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    document.getElementById("progressText").textContent = `${done} / ${total} 完了（${pct}%）`;
    document.getElementById("progressFill").style.width = pct + "%";
  }

  function showError(msg) {
    document.querySelector(".container").insertAdjacentHTML("afterbegin",
      `<div class="error">⚠️ ${escapeHTML(msg)}</div>`);
  }

  async function init() {
    // 1. 共有バックエンドから取得（失敗時はlocalStorageへフォールバック）
    const shared = await fetchSharedChecks();
    if (shared) {
      CHECKS = shared;
    } else {
      const local = loadLocalChecks();
      Object.keys(local).forEach(k => CHECKS[k] = { done: true });
    }
    // 2. データ取得・描画
    const { data, error } = await fetchData();
    if (error) { showError(error); return; }
    render(data || []);
  }

  document.getElementById("reloadBtn").addEventListener("click", () => location.reload());
  const doneAllBtn = document.getElementById("doneAllBtn");
  if (doneAllBtn) {
    doneAllBtn.addEventListener("click", () => {
      document.getElementById("doneMsg").hidden = false;

      const done = THIS_WEEK_POSTS.filter(p => {
        const key = p["投稿番号"] + "-" + p["バッチ"];
        return getCheckMeta(key);
      });
      const notDone = THIS_WEEK_POSTS.filter(p => {
        const key = p["投稿番号"] + "-" + p["バッチ"];
        return !getCheckMeta(key);
      });
      const fmtLine = (p) => {
        const when = [p["投稿日"], p["投稿時刻"], p["曜日"] ? "(" + p["曜日"] + ")" : ""].filter(Boolean).join(" ");
        return `・[${p["バッチ"]}#${p["投稿番号"]}] ${p["ステップ"] || p["媒体"]}　${when}`;
      };
      const subject = `【ダッシュボード完了報告】今週(${weekRange}) ${done.length}/${THIS_WEEK_POSTS.length}件完了`;
      const lines = [
        `今週（${weekRange}）の作業を完了報告します。`,
        ``,
        `■ 完了したタスク（${done.length}件）`,
        ...(done.length ? done.map(fmtLine) : ['（なし）']),
      ];
      if (notDone.length) {
        lines.push(``, `■ 未完了のタスク（${notDone.length}件）`, ...notDone.map(fmtLine));
      }
      lines.push(``, `― 佳代子`);
      const body = lines.join('\n');

      // 共有バックエンド(GAS)経由でサーバ送信。宛先メールは非公開GAS内のみ（公開ファイルに出さない）
      if (cfg.progressApiUrl) {
        fetch(cfg.progressApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'report', subject: subject, text: body, who: WHO })
        }).catch(e => console.warn('report failed', e));
      } else if (cfg.reportEmail) {
        const href = `mailto:${encodeURIComponent(cfg.reportEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = href;
      }
    });
  }

  init();
})();
