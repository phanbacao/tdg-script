// ==UserScript==
// @name         TDG-pancake
// @namespace    smh.pancake
// @version      1.2.2
// @updateURL    https://raw.githubusercontent.com/phanbacao/tdg-script/main/chatbot/pancake.user.js
// @downloadURL  https://raw.githubusercontent.com/phanbacao/tdg-script/main/chatbot/pancake.user.js
// @description  Bot gợi ý 3 phương án trả lời khách Zalo (Sơn Mộc Hương & Trầm Hương Hà Xá) trên Pancake – tự học từ nhân viên, tự rà soát mỗi đêm, nghe tin thoại, đọc ảnh, 1 ghi chú/khách, cào hội thoại về Sheet bộ não
// @match        https://pancake.vn/*
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__TDGP_LOADED) return;
  window.__TDGP_LOADED = true;

  // ===================== ⑦ CẤU HÌNH =====================
  const VERSION = '1.2.2';
  const RAW_URL = 'https://raw.githubusercontent.com/phanbacao/tdg-script/main/chatbot/pancake.user.js';
  const TITLE = 'TDG-pancake ' + VERSION;
  const DEFAULTS = {
    userName: '', geminiKey: '', model: 'gemini-flash-latest',
    sheetPub: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSyjBVTnCd7pyxmiUCqC8pwHrtMFCDA33764izkiBXqdAklXAyGb4K6AFJbNsVLH690C2DYYjvHHmFH',
    hook: '',
    autoSuggest: true, autoFill: true, autoNote: true, readImages: true, blink: true,
    scrape: true, scrapeDays: 183, kbRefreshMin: 30, waitMin: 5, minimized: false, panelW: 470,
    learn: true, selfReview: true,
    promoSMH: 'Mua đơn từ 150k tặng 1 hộp nụ trầm mix bách xanh\nMua đơn từ 300k tặng 1 vòng trầm chuẩn mix sen 8li\nMua đơn từ 500k tặng 1 hộp nụ cao cấp\nMua đơn từ 1 triệu tặng 1 hộp nụ đặc biệt',
    promoTHHX: '',
  };
  const CFG_KEY = 'tdgp_cfg_v1';
  const cfg = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(CFG_KEY) || '{}'));
  const saveCfg = () => localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  const PAGES = {
    'pzl_109540369391108006': { brand: 'Sơn Mộc Hương', short: 'SMH' },
    'pzl_51032425718211751': { brand: 'Trầm Hương Hà Xá', short: 'THHX' },
  };
  const pageOfConv = (convId) => Object.keys(PAGES).find((p) => String(convId || '').includes(p.replace('pzl_', '_') + '_')) || '';

  // ===================== TIỆN ÍCH =====================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pad = (n) => String(n).padStart(2, '0');
  const nowStr = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const ddmm = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
  const fmtT = (ts) => { const d = new Date(Number(ts)); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const strip = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const STOP = new Set('shop minh ban da a oi co khong ko la cho cua va thi de em anh chi nha nhe voi duoc dc roi nay kia do the nao gi may bao nhieu hoi xin cam on vay ah uh ok oke vang ma nhung hay neu khi luc dang se cung con thoi lam den toi ra vao len hon nhat rat qua cai ne ha hong'.split(' '));
  const toks = (s) => strip(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((t) => t.length > 1 && !STOP.has(t));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hash = (s) => { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };
  function overlap(a, b) { const A = new Set(toks(a)), B = toks(b); if (!A.size || !B.length) return 0; let n = 0; B.forEach((t) => { if (A.has(t)) n++; }); return n / Math.sqrt(A.size * B.length); }
  function similarity(a, b) { const g = (s) => { const t = strip(s).replace(/[^a-z0-9]/g, ''); const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const k = t.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; }; const A = g(a), B = g(b); let inter = 0, tot = 0; A.forEach((v, k) => { tot += v; if (B.has(k)) inter += Math.min(v, B.get(k)); }); B.forEach((v) => { tot += v; }); return tot ? (2 * inter) / tot : 0; }

  // ===================== TRẠNG THÁI + NHẬT KÝ =====================
  const S = { stage: '', log: [], active: null, sg: {}, busy: false, busyAt: 0, busyConv: '', tab: 'goi', tabManual: {}, kb: null, kbStatus: 'chưa tải', err: '', scrape: { on: false, stage: 'chờ', done: 0, total: 0, msgs: 0, unsynced: 0, last: '', err: '' }, waiting: [], waitingAt: 0, hist: [], fb: null, outreach: null, typingAt: 0, sending: false, lastFilled: '', donEdit: {}, force: {}, newVer: '' };
  function log(msg, cls, data) {
    S.log.unshift({ t: nowStr(), msg, cls: cls || '' }); if (S.log.length > 100) S.log.length = 100;
    if (cls === 'err') console.warn('[TDG-pancake]', msg);
    if (data !== false) hookSend({ action: 'log', rows: [[new Date().toISOString(), cfg.userName, cls || 'info', msg, data ? JSON.stringify(data).slice(0, 2000) : '']] });
    renderLog();
  }
  async function timed(name, fn) { const t0 = Date.now(); try { const r = await fn(); const ms = Date.now() - t0; if (ms > 15000) log(`${name} chậm: ${Math.round(ms / 1000)}s`, 'warn'); return r; } catch (e) { log(`${name} lỗi sau ${Math.round((Date.now() - t0) / 1000)}s: ${e.message}`, 'err'); throw e; } }

  // ===================== API PANCAKE =====================
  async function api(path, opt) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { const r = await fetch(path, Object.assign({ credentials: 'include' }, opt || {})); if (r.status === 429 || r.status >= 500) throw new Error('Pancake bận (' + r.status + ')'); return await r.json(); }
      catch (e) { if (attempt === 3) throw e; await sleep(1500 * attempt + rnd(0, 800)); }
    }
  }
  const custOfConv = (convId) => 'pzl_u_' + String(convId).split('_').pop();
  const IGNORE_ATT = ['reaction', 'pzl_chat_recommended'];
  const SYS_RX = /lời mời kết bạn|vừa kết bạn|đã đồng ý kết bạn|Sinh nhật của|SYSTEM MESSAGE|zalo_system|Hãy gửi lời ch/i;
  async function fetchMsgs(pid, convId, custId, pages) {
    let all = [], seen = new Set(), notes = [], count = 0;
    for (let i = 0; i < (pages || 1); i++) {
      const j = await api(`/api/v1/pages/${pid}/conversations/${convId}/messages?customer_id=${encodeURIComponent(custId)}${count ? '&current_count=' + count : ''}`);
      if (!j || j.success === false) throw new Error((j && j.message) || 'không đọc được tin nhắn');
      if (i === 0) notes = (j.notes || []).filter((n) => !n.removed_at).map((n) => ({ id: n.id, msg: String(n.message || ''), at: n.created_at }));
      const ms = (j.messages || []).filter((m) => !seen.has(m.id)); if (!ms.length) break;
      ms.forEach((m) => seen.add(m.id)); all = ms.concat(all); count += ms.length;
      if (pages > 1) await sleep(rnd(400, 900));
    }
    const cust = custOfConv(convId);
    const msgs = all.map((m) => {
      const text = String(m.original_message || m.message || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
      const sys = SYS_RX.test(text) || m.type === 'zalo_system_message';
      const att = (m.attachments || []).filter((a) => !IGNORE_ATT.includes(a.type)).map((a) => ({ type: a.type, url: a.url || a.file_url || a.origin_url || (a.payload && a.payload.url) || '', sec: a.seconds || 0, desc: a.type === 'location' ? [a.title || a.name, a.description].filter(Boolean).join(' – ') : '' }));
      const k = sys || (!text && !att.length) ? 2 : String((m.from || {}).id) === cust ? 1 : 0;
      return { id: m.id, t: m.inserted_at, k, text: text || (att.find((a) => a.type === 'location') ? '[Khách gửi vị trí] ' + att.find((a) => a.type === 'location').desc : ''), att };
    }).filter((m) => m.k !== 2);
    return { msgs, notes };
  }

  // ===================== ① HỘI THOẠI ĐANG MỞ =====================
  function reactState() {
    const ta = document.getElementById('replyBoxComposer'); if (!ta) return null;
    const fk = Object.keys(ta).find((k) => k.startsWith('__reactFiber')); let f = ta[fk];
    for (let i = 0; i < 60 && f; i++) {
      const mp = f.memoizedProps;
      if (mp && typeof mp === 'object' && typeof mp.selectedConv === 'string' && mp.chatMenuProps) {
        const sc = mp.chatMenuProps.selectedCustomer || {};
        return { convId: mp.selectedConv, pid: String(mp.chatMenuProps.currentPageId || ''), custId: sc.id || sc.customer_id || '', name: sc.name || '', token: (mp.auth && mp.auth.accessToken) || '', live: Array.isArray(mp.messages && mp.messages.data) ? mp.messages.data : null };
      }
      f = f.return;
    }
    return null;
  }
  function domNick() { const el = document.querySelector('.conversation-list-item.selected .name-text'); return el ? el.textContent.trim() : ''; }
  let lastKey = '';
  function watchActive() {
    const st = reactState();
    if (!st || !st.convId) { if (S.active) { S.active = null; render(); } lastKey = ''; return; }
    const pid = pageOfConv(st.convId) || st.pid;
    const key = pid + '|' + st.convId;
    const lastLive = st.live && st.live.length ? st.live[st.live.length - 1].id : '';
    if (key !== lastKey) {
      lastKey = key;
      if (S.active && S.active.convId !== st.convId) S.hist.push(S.active.convId);
      S.active = { convId: st.convId, pid, custId: st.custId, name: st.name || domNick(), page: PAGES[pid] || null, token: st.token, lastLive, opened: Date.now() };
      S.err = ''; S.fb = null; S.outreach = null;
      if (!S.tabManual[st.convId]) S.tab = 'goi';
      render();
      if (!PAGES[pid]) { log('Hội thoại không thuộc 2 Zalo → bỏ qua', '', false); return; }
      if (!st.custId) { log('Không lấy được mã khách – chưa soạn', 'warn'); return; }
      onConversation(false);
    } else if (S.active && lastLive && lastLive !== S.active.lastLive) {
      S.active.lastLive = lastLive; if (st.custId) S.active.custId = st.custId;
      onConversation(true);
    }
  }

  // ===================== ⑤ KHO TRI THỨC =====================
  function parseCSV(text) { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; } if (cell.length || row.length) { row.push(cell); rows.push(row); } return rows; }
  function rowsToObjects(rows) { if (!rows.length) return []; const h = rows[0].map((x) => norm(x)); return rows.slice(1).filter((r) => r.some((c) => c && c.trim())).map((r) => { const o = {}; h.forEach((k, i) => { o[k] = (r[i] || '').trim(); }); return o; }); }
  const col = (o, ...names) => { for (const n of names) { const nn = norm(n); const keys = Object.keys(o); const k = keys.find((x) => x === nn) || keys.find((x) => x.startsWith(nn)); if (k) return o[k]; } return ''; };
  const WANT = ['SHOP', 'GIỌNG ĐIỆU', 'CHÍNH SÁCH', 'NHÓM SẢN PHẨM', 'SẢN PHẨM', 'HỎI–ĐÁP', 'KHUYẾN MÃI', 'PANCAKE – CHÍNH SÁCH', 'PANCAKE – GIỌNG ĐIỆU', 'PANCAKE – HỎI–ĐÁP', 'PANCAKE – GIÁ'];
  const KB_KEY = 'tdgp_kb_v1';
  async function loadKB(force) {
    const cached = JSON.parse(localStorage.getItem(KB_KEY) || 'null');
    if (!force && cached && Date.now() - cached.at < cfg.kbRefreshMin * 60000) { S.kb = cached; S.kbStatus = kbSummary(); renderCfgInfo(); return; }
    S.kbStatus = 'đang tải…'; renderCfgInfo();
    await timed('Tải kho tri thức', async () => {
      const base = cfg.sheetPub.replace(/\/(pubhtml|pub).*$/, '');
      const html = await (await fetch(base + '/pubhtml?t=' + Date.now())).text();
      const names = [...html.matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*?gid=(\d+)/g)].map((m) => ({ name: m[1], gid: m[2] }));
      if (!names.length) throw new Error('Không đọc được danh sách bảng của Sheet');
      const nk = (s) => strip(s).replace(/[^a-z0-9]/g, ''); const tabs = {};
      for (const w of WANT) {
        const t = names.find((n) => nk(n.name) === nk(w)) || (w.startsWith('PANCAKE') ? null : names.find((n) => nk(n.name).startsWith(nk(w)) && !/thật|that/i.test(n.name) && !/^pancake/i.test(n.name)));
        if (!t) continue;
        tabs[w] = rowsToObjects(parseCSV(await (await fetch(base + '/pub?output=csv&gid=' + t.gid)).text())); await sleep(120);
      }
      const kb = { at: Date.now() };
      kb.voice = {}; (tabs['GIỌNG ĐIỆU'] || []).forEach((o) => { kb.voice[col(o, 'thương hiệu')] = col(o, 'hồ sơ giọng'); });
      kb.voiceP = {}; (tabs['PANCAKE – GIỌNG ĐIỆU'] || []).forEach((o) => { kb.voiceP[col(o, 'thương hiệu')] = col(o, 'hồ sơ giọng', 'nội dung'); });
      kb.policies = (tabs['CHÍNH SÁCH'] || []).map((o) => ({ th: col(o, 'thương hiệu'), muc: col(o, 'mục'), nd: col(o, 'nội dung') })).filter((p) => p.nd);
      kb.policiesP = (tabs['PANCAKE – CHÍNH SÁCH'] || []).map((o) => ({ th: col(o, 'thương hiệu'), muc: col(o, 'mục'), nd: col(o, 'nội dung') })).filter((p) => p.nd);
      kb.groups = (tabs['NHÓM SẢN PHẨM'] || []).map((o) => ({ th: col(o, 'thương hiệu'), nhom: col(o, 'nhóm'), mota: col(o, 'mô tả nhóm'), thanhphan: col(o, 'thành phần'), quycach: col(o, 'kích thước'), cachdung: col(o, 'cách dùng'), baoquan: col(o, 'bảo quản') })).filter((g) => g.nhom);
      kb.products = (tabs['SẢN PHẨM'] || []).map((o) => ({ th: col(o, 'thương hiệu'), nhom: col(o, 'nhóm'), ten: col(o, 'tên đầy đủ'), tenngan: col(o, 'tên ngắn'), gia: col(o, 'khoảng giá'), phanloai: col(o, 'phân loại'), diemrieng: col(o, 'điểm riêng') })).filter((p) => p.ten);
      kb.faq = (tabs['HỎI–ĐÁP'] || []).concat(tabs['PANCAKE – HỎI–ĐÁP'] || []).map((o) => ({ th: col(o, 'thương hiệu'), hoi: col(o, 'câu hỏi', 'khách hỏi'), dap: col(o, 'câu trả lời', 'shop trả lời') })).filter((q) => q.hoi && q.dap);
      kb.prices = (tabs['PANCAKE – GIÁ'] || []).map((o) => ({ th: col(o, 'thương hiệu'), sp: col(o, 'sản phẩm'), gia: col(o, 'giá'), ghichu: col(o, 'ghi chú') })).filter((p) => p.sp);
      kb.promos = (tabs['KHUYẾN MÃI'] || []).filter((o) => col(o, 'đang chạy')).map((o) => ({ th: col(o, 'thương hiệu'), ct: col(o, 'chương trình'), ad: col(o, 'áp dụng') }));
      kb.hasPancake = !!(kb.policiesP.length || Object.keys(kb.voiceP).length);
      S.kb = kb; try { localStorage.setItem(KB_KEY, JSON.stringify(kb)); } catch (e) { }
      S.kbStatus = kbSummary(); log('Đã tải kho: ' + S.kbStatus, 'ok', false);
    }).catch((e) => { S.kbStatus = 'lỗi: ' + e.message; if (cached) { S.kb = cached; S.kbStatus += ' (dùng bản cũ)'; } });
    renderCfgInfo();
  }
  function kbSummary() { const k = S.kb; if (!k) return 'chưa tải'; return `${k.products.length} SP · ${k.faq.length} hỏi–đáp · ${k.policies.length + k.policiesP.length} chính sách${k.hasPancake ? ' · có bộ não Pancake' : ' · kiến thức tạm'}`; }

  // ===================== TỰ HỌC (bài học từ nhân viên, dùng chung mọi máy qua Sheet) =====================
  // Bảng PANCAKE – BÀI HỌC: Mã | Thời gian | Người dạy | Kênh | Loại | Nhóm | Tình huống (khách nhắn) | Bot đã soạn | Câu đúng / bài học | Lý do | Mã hội thoại | Dùng
  const LES_KEY = 'tdgp_lessons_v1';
  const LEARN = Object.assign({ at: 0, list: [], local: [] }, JSON.parse(localStorage.getItem(LES_KEY) || '{}'));
  const NOTCUST_KEY = 'tdgp_notcust_v1'; const notCust = JSON.parse(localStorage.getItem(NOTCUST_KEY) || '{}');
  const saveNotCust = () => { try { localStorage.setItem(NOTCUST_KEY, JSON.stringify(notCust)); } catch (e) { } };
  const saveLearn = () => { try { LEARN.local = LEARN.local.slice(-300); localStorage.setItem(LES_KEY, JSON.stringify({ at: LEARN.at, list: LEARN.list.slice(-3000), local: LEARN.local })); } catch (e) { } };
  const allLessons = () => { const ids = new Set(LEARN.list.map((l) => l.id)); return LEARN.list.concat(LEARN.local.filter((l) => !ids.has(l.id))); };
  const rowToLesson = (r) => (!r || !r[0] || /^(không|ko|bỏ|no)/i.test(String(r[11] || '')) ? null : { id: String(r[0]), ts: Date.parse(r[1]) || 0, who: r[2] || '', br: r[3] || '', type: r[4] || '', nhom: r[5] || '', q: r[6] || '', bot: r[7] || '', a: r[8] || '', why: r[9] || '', conv: r[10] || '' });
  function applyNotCust() {
    allLessons().filter((l) => l.conv && /phải khách|là khách/.test(l.type)).sort((a, b) => a.ts - b.ts).forEach((l) => { if (l.type === 'không phải khách') notCust[l.conv] = l.why || 'không phải khách'; else delete notCust[l.conv]; });
    saveNotCust(); wrongCache = null;
  }
  async function loadLessons(force) {
    if (!cfg.hook || (!force && Date.now() - LEARN.at < 15 * 60000)) return;
    try {
      const j = await (await fetch(cfg.hook + (cfg.hook.includes('?') ? '&' : '?') + 'lessons=1&t=' + Date.now())).json();
      if (!j || !j.ok || !Array.isArray(j.rows)) throw new Error((j && j.error) || 'Apps Script chưa có phần bài học');
      LEARN.list = j.rows.map(rowToLesson).filter(Boolean); LEARN.at = Date.now();
      const ids = new Set(LEARN.list.map((l) => l.id)); LEARN.local = LEARN.local.filter((l) => !ids.has(l.id) && Date.now() - l.ts < 3 * 864e5);
      applyNotCust(); saveLearn(); renderCfgInfo();
    } catch (e) { LEARN.at = Date.now() - 10 * 60000; log('Không tải được bài học: ' + e.message, 'warn', false); }
  }
  function addLesson(o) {
    if (!cfg.learn && !/phải khách|là khách/.test(o.type)) return;
    const l = Object.assign({ id: 'L' + Date.now().toString(36) + rnd(100, 999), ts: Date.now(), who: cfg.userName || '?', br: '', type: '', nhom: '', q: '', bot: '', a: '', why: '', conv: '' }, o);
    LEARN.local.push(l); saveLearn(); if (/phải khách|là khách|sửa đơn/.test(l.type)) applyNotCust();
    hookSend({ action: 'lesson', rows: [[l.id, new Date(l.ts).toISOString(), l.who, l.br, l.type, l.nhom, String(l.q).slice(0, 800), String(l.bot).slice(0, 1500), String(l.a).slice(0, 1500), l.why, l.conv, 'Có']] });
    log(`📚 Bot học thêm (${l.type}): ${String(l.a || l.why).slice(0, 70)}`, 'ok', false);
  }
  // Giá trị nhân viên đã sửa lại trong tin đơn (vd địa chỉ Shop bị lấy nhầm) → lần sau không lấy nữa
  let wrongCache = null;
  function wrongVals() {
    if (wrongCache) return wrongCache;
    const w = { dc: new Set(), sdt: new Set() };
    allLessons().filter((l) => l.type === 'sửa đơn').forEach((l) => { const b = parseOrderBlock(l.bot) || {}, a = parseOrderBlock(l.a) || {}; ['dc', 'sdt'].forEach((k) => { if (b[k] && norm(b[k]) !== norm(a[k] || '')) w[k].add(norm(b[k])); }); });
    return (wrongCache = w);
  }
  function learnedFix(d) { try { const w = wrongVals(); if (d.dc && w.dc.has(norm(d.dc))) d.dc = ''; if (d.sdt && w.sdt.has(norm(d.sdt))) d.sdt = ''; } catch (e) { } return d; }
  function lessonsFor(br, text) {
    const L = allLessons().filter((l) => l.br === br);
    const sim = L.filter((l) => /mẫu câu|sửa sai/.test(l.type) && l.q && (l.a || l.why)).map((l) => ({ l, s: overlap(text, l.q) })).filter((x) => x.s > 0.25).sort((a, b) => b.s - a.s || b.l.ts - a.l.ts).slice(0, 6).map((x) => x.l);
    const gen = L.filter((l) => l.type === 'sửa sai' && !sim.includes(l)).slice(-6);
    const out = [];
    if (sim.length) out.push(`\n## BÀI HỌC NHÂN VIÊN ĐÃ DẠY (ưu tiên CAO NHẤT – tình huống giống thì trả lời theo đây)\n${sim.map((l) => `Khách: ${l.q}\n${l.bot ? 'Bot từng soạn (chưa đúng): ' + l.bot.slice(0, 200) + '\n' : ''}Nhân viên dạy: ${l.a || '(không ghi câu)'}${l.why ? ' — lý do: ' + l.why : ''}`).join('\n\n')}`);
    if (gen.length) out.push(`\n## LỖI BOT TỪNG MẮC – TRÁNH LẶP LẠI\n${gen.map((l) => `- ${l.why || 'sai'}${l.a ? ': nên nói "' + l.a.slice(0, 160) + '"' : ''}`).join('\n')}`);
    return out.join('\n');
  }

  // ===================== HỌC CÁCH NÓI TỪ CHAT CŨ =====================
  let PAIRS = [], PSTAT = { chot: 0, vui: 0, xau: 0 };
  const NEG_RX = /thất vọng|lừa đảo|(?<!đánh\s)(?<!\p{L})(lừa|chán|bực)(?!\p{L})|tệ quá|quá tệ|không bao giờ mua|ko mua nữa|không mua nữa|làm ăn kiểu|kém quá|1 sao|một sao|phốt|báo cáo shop/iu;
  const HAPPY_RX = /cảm ơn|cám ơn|thanks|tks|ok|oke|tốt|đẹp|ưng|thích|hài lòng|nhận được rồi|❤|👍|🥰|😍/i;
  async function buildPairs() {
    const out = [];
    await DB.each('conv', (c) => {
      if (!c.msgs) return;
      const ms = c.msgs.filter((m) => m.k !== 2 && (m.text || m.att));
      const orderIdx = ms.findIndex((m) => m.k === 0 && m.text && isOrderBlock(m.text));
      const custs = ms.filter((m) => m.k === 1 && m.text);
      const neg = custs.some((m) => NEG_RX.test(m.text));
      const lastC = custs[custs.length - 1];
      const happy = !neg && !!lastC && HAPPY_RX.test(lastC.text);
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i]; if (m.k !== 1 || !m.text || m.text.length < 4 || SYS_RX.test(m.text)) continue;
        const rep = []; let j = i + 1;
        while (j < ms.length && ms[j].k === 0) { if (ms[j].text && !isOrderBlock(ms[j].text)) rep.push(ms[j].text); j++; }
        const res = orderIdx > i ? 'chốt' : neg ? 'xấu' : happy ? 'vui' : '';
        if (rep.length) out.push({ br: c.br, q: m.text.slice(0, 300), a: rep.join(' / ').slice(0, 500), res });
      }
    });
    PAIRS = out.slice(-20000);
    PSTAT = { chot: PAIRS.filter((p) => p.res === 'chốt').length, vui: PAIRS.filter((p) => p.res === 'vui').length, xau: PAIRS.filter((p) => p.res === 'xấu').length };
    log(`Đã nạp ${PAIRS.length} cặp hỏi–đáp từ chat cũ (${PSTAT.chot} dẫn tới chốt đơn, ${PSTAT.vui} khách hài lòng, ${PSTAT.xau} bị loại vì khách không vui)`, '', false);
  }
  const similarPairs = (br, text, n) => PAIRS.filter((p) => p.br === br && p.res !== 'xấu').map((p) => ({ p, s: overlap(text, p.q) * (p.res === 'chốt' ? 1.35 : p.res === 'vui' ? 1.15 : 1) })).filter((x) => x.s > 0.22).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.p);

  // ===================== MÃ ĐƠN · SĐT · ĐỊA CHỈ · TIN TẠO ĐƠN =====================
  const RX_SHOPEE = /\b\d{6}[A-Z0-9]{8}\b/, RX_TIKTOK = /\b5\d{17}\b/, RX_TRACK = /\b(SPXVN\d{8,}[A-Z]?|VNGH\d{6,}[A-Z]?|GHN[A-Z0-9]{6,}|GHTK[A-Z0-9.]{6,}|\d{12}LEX)\b/i;
  const RX_PHONE = /(?<!\d)(?:\(?\+?84\)?|0)(?:[\s.\-]?\d){9}(?!\d)/g;
  // Địa chỉ + SĐT của Shop: KHÔNG BAO GIỜ là thông tin khách
  const SHOP_PHONES = ['0935907634', '0762222448', '0774222448'];
  const SHOP_ADDR_RX = /3\s*\/\s*29\s*e?\b|182\s*(\/\s*3\s*\/\s*29|lã xuân oai)|lã xuân oai[^\n]{0,20}\b182\b|đường\s*(số\s*)?182[^\n]{0,40}tăng nhơn|76\s*đường\s*(số\s*)?2[^\n]{0,40}vạn phúc/i;
  const isShopAddr = (t) => SHOP_ADDR_RX.test(String(t || ''));
  const ADDR_RX = /(phường|xã|quận|huyện|tỉnh|thành phố|tp\.?\s|thị xã|thị trấn|thôn|ấp|khu phố|\bkp\b|khóm|đường|hẻm|ngõ|ngách|số nhà|\bsn\b|tổ \d|chung cư|toà|tòa|lô |\d+\s*\/\s*\d+)/i;
  const CHAT_LINE_RX = /^(dạ|vâng|hôm nay|nay shop|nhờ|cảm ơn|shop (gửi|sẽ|lên|đi)|mình|bạn ơi|anh ơi|chị ơi)(\s|$)|dự kiến|nhận được (hàng|ạ)|kiểm tra (giúp|xem)|đúng chưa|nha ạ$/i;
  function findCodes(text) {
    const t = String(text || '').toUpperCase(); const out = {};
    let m = t.match(RX_TRACK); if (m) out.track = m[0];
    m = t.match(RX_TIKTOK); if (m) out.order = m[0], out.san = 'tiktok';
    if (!out.order) { m = t.match(RX_SHOPEE); if (m && !/^SPXVN/.test(m[0])) out.order = m[0], out.san = 'shopee'; }
    return out;
  }
  function phonesIn(text, keepShop) { return [...String(text || '').matchAll(RX_PHONE)].map((m) => m[0].replace(/[^\d+]/g, '')).map((p) => p.replace(/^\+?84/, '0')).filter((p) => /^0\d{9}$/.test(p) && (keepShop || !SHOP_PHONES.includes(p))); }
  const isOrderBlock = (t) => { const L = String(t || '').split('\n').filter((x) => x.trim()); return L.length >= 4 && phonesIn(t).length > 0 && /thu cod|thu hộ|tổng|ship|đổi|gửi|tặng|thu hồi|\d+\s*(hộp|vòng|sợi|kg|bịch|túi|cây|bộ|mặt|hạt|đốt)/i.test(t); };
  // Tách tin tạo đơn (nhân viên hay chép lại trong chat / ghi chú) thành từng phần
  function parseOrderBlock(t) {
    const L = String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const pi = L.findIndex((x) => phonesIn(x).length); if (pi < 0) return null;
    const d = { ten: '', sdt: phonesIn(L[pi])[0], dc: '', viec: '', qua: '', thu: '', ma: '' };
    const isThu = (x) => /thu cod|thu hộ|tổng (cod|tiền)|^tổng\b|miễn phí ship|freeship|free ship|phí ship|đã chuyển khoản|^\d+k?\s*[+*x×]\s*\d+|=\s*\d+\s*k\b/i.test(x);
    const isQua = (x) => /^(tặng|gửi tặng|kèm)(\s|$)/i.test(x);
    const PROD_RX = /(vòng|chuỗi|nhang|nụ trầm|\bnụ\b|lu thống|bách xanh|\d+\s*li\b|\bhạt\b|mặt phật|trụ trúc|charm|\bthan\b|lư xông)/iu;
    const UNIT = '(kg|g|gr|gram|hộp|vòng|sợi|bịch|túi|bó|cây|bộ|mặt|hạt|đốt|lọ|gói|chuỗi|miếng|thác|đế|lư|bình|chai|set|cặp|que|thẻ|ống|cuộn|khoanh|lách|trụ|charm|dây)';
    const isProd = (x) => new RegExp('^\\d+([.,]\\d+)?\\s*(x\\s*)?' + UNIT + '(?=[\\s,.:]|$)', 'iu').test(x) || /^(đổi|thu hồi|gửi bù|gửi đi|gửi lại|gửi thêm|giao|lấy về|lấy|bù)(?=[\s:,.]|$)/iu.test(x) || (/\b(SMH|THHX)\b/.test(x) && !ADDR_RX.test(x)) || (PROD_RX.test(x) && !ADDR_RX.test(x));
    const head = L.slice(0, pi);
    const codeLine = head.find((x) => findCodes(x).order || /^zalo\b/i.test(x));
    if (codeLine) { const c = findCodes(codeLine); if (c.order) d.ma = c.order; }
    const others = head.filter((x) => x !== codeLine && !findCodes(x).order);
    // dòng trước SĐT có thể là tên HOẶC địa chỉ (có người ghi địa chỉ trước SĐT)
    const headAddr = others.filter((x) => ADDR_RX.test(x) && x.length > 12);
    const nameLine = others.filter((x) => !headAddr.includes(x)).pop();
    if (nameLine) d.ten = nameLine.replace(/^(tên|người nhận)\s*[:：]?\s+/i, '').replace(/^khách\s*[:：]\s*/i, '').replace(/\s*(sđt|sdt|số điện thoại|đt)\s*[:：]?.*$/i, '').trim();
    const pLine = L[pi].replace(RX_PHONE, ' ').replace(/(sđt|sdt|số điện thoại|đt)\s*[:：]?/gi, ' ').replace(/[()+]/g, ' ').trim();
    if (!d.ten && pLine && pLine.length < 40 && !ADDR_RX.test(pLine)) d.ten = pLine.replace(/^[\s,.\-_:]+|[\s,.\-_:]+$/g, '');
    const rest = L.slice(pi + 1);
    let i = 0; const dcL = headAddr.map((x) => x.replace(/^(địa chỉ|đ\/c|dc)\s*[:：]?\s*/i, ''));
    while (rest[i] && !isThu(rest[i]) && !isQua(rest[i]) && !isProd(rest[i]) && !CHAT_LINE_RX.test(rest[i]) && dcL.length < 3) { dcL.push(rest[i].replace(/^(địa chỉ|đ\/c|dc)\s*[:：]?\s*/i, '')); i++; }
    d.dc = dcL.join(', ');
    const viec = [];
    for (; i < rest.length; i++) { const x = rest[i]; if (isThu(x)) d.thu = d.thu ? d.thu + ' ' + x : x; else if (isQua(x)) d.qua = d.qua ? d.qua + ', ' + x : x; else if (CHAT_LINE_RX.test(x) && !isProd(x)) continue; else viec.push(x); }
    d.viec = viec.join('\n');
    if (isShopAddr(d.dc)) d.dc = '';
    return d;
  }
  // Đọc thông tin từ toàn bộ hội thoại + ghi chú (không cần AI)
  function extractInfo(msgs, notes) {
    const out = { ten: '', sdt: '', dc: '', viec: '', qua: '', thu: '', ma: '', track: '', from: [] };
    const blocks = [];
    (notes || []).forEach((n) => { if (isOrderBlock(n.msg)) blocks.push({ src: 'ghi chú', t: n.msg, at: n.at || 0 }); });
    (msgs || []).forEach((m) => { if (m.text && isOrderBlock(m.text)) blocks.push({ src: m.k ? 'khách' : 'Shop', t: m.text, at: Date.parse(m.t + 'Z') || 0 }); });
    blocks.sort((a, b) => b.at - a.at);
    for (const b of blocks) { const d = parseOrderBlock(b.t); if (!d) continue; Object.keys(d).forEach((k) => { if (!out[k] && d[k]) out[k] = d[k]; }); out.from.push('tin tạo đơn (' + b.src + ')'); if (out.ten && out.sdt && out.dc && out.viec) break; }
    const custText = (msgs || []).filter((m) => m.k).map((m) => m.text).join('\n');
    const allText = (msgs || []).map((m) => m.text).join('\n') + '\n' + (notes || []).map((n) => n.msg).join('\n');
    const c = findCodes(custText); if (c.order && !out.ma) out.ma = c.order; if (c.track) out.track = c.track;
    if (!out.ma) { const c2 = findCodes(allText); if (c2.order) out.ma = c2.order; }
    if (!out.sdt) { const ps = phonesIn(custText); if (ps.length) { out.sdt = ps[ps.length - 1]; out.from.push('SĐT trong tin khách'); } }
    if (!out.dc) {
      const m = custText.match(/(?:địa chỉ(?: đơn vị| nhận)?|đ\/c|dc)\s*[:：]\s*([^\n]{8,})/i);
      if (m) { const v = m[1].replace(/\s*(sđt|sdt|số điện thoại|đt)\s*[:：]?[\s\d.+()\-]*$/i, '').replace(RX_PHONE, '').replace(/[\s,.\-]+$/, '').trim(); if (v.length >= 8 && !isShopAddr(v)) { out.dc = v; out.from.push('địa chỉ trong tin khách'); } }
    }
    if (!out.dc) { const loc = (msgs || []).filter((m) => m.k).flatMap((m) => m.att || []).filter((a) => a.type === 'location' && a.desc).pop(); if (loc) { out.dc = loc.desc; out.from.push('vị trí khách gửi'); } }
    if (!out.ten) { const m = custText.match(/(?:tên(?: đơn vị| người nhận)?|người nhận)\s*[:：]\s*([^\n,]{2,40}?)(?=\s*(?:sđt|sdt|số điện thoại|đt\b|địa chỉ|đ\/c|\bdc\b|[,\n]|\d{3})|\s*$)/im); if (m) out.ten = m[1].trim(); }
    if (isShopAddr(out.dc)) out.dc = '';
    if (SHOP_PHONES.includes(out.sdt)) out.sdt = '';
    learnedFix(out);
    return out;
  }
  async function readQR(url) {
    if (typeof window.jsQR !== 'function' || !url) return '';
    try { const b = await (await fetch(url)).blob(); const bmp = await createImageBitmap(b); const sc = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)); const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc); const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0, cv.width, cv.height); const d = cx.getImageData(0, 0, cv.width, cv.height); const r = window.jsQR(d.data, d.width, d.height); return r && r.data ? r.data : ''; } catch (e) { return ''; }
  }
  async function imagePart(url) {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 9000);
    try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) return null; const b = await r.blob(); if (!b.size || b.size > 4.5e6) return null; const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(b); }); let mime = b.type || 'image/jpeg'; if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) mime = 'image/jpeg'; return data ? { inline_data: { mime_type: mime, data } } : null; } catch (e) { return null; } finally { clearTimeout(to); }
  }

  // ===================== NGHE TIN NHẮN THOẠI (Gemini) =====================
  const AUD_KEY = 'tdgp_audio_v1'; const audMem = JSON.parse(localStorage.getItem(AUD_KEY) || '{}');
  async function transcribe(m) {
    const a = m.att.find((x) => x.type === 'audio' && x.url); if (!a) return '';
    if (audMem[m.id]) return audMem[m.id];
    if (!cfg.geminiKey) return '';
    try {
      const b = await (await fetch(a.url)).blob(); if (!b.size || b.size > 6e6) return '';
      const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(b); });
      const mime = /^audio\//.test(b.type) ? b.type : 'audio/aac';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model || 'gemini-flash-lite-latest'}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Chép lại nguyên văn lời nói tiếng Việt trong đoạn ghi âm (khách hàng nhắn cho shop bán trầm hương). Chỉ trả về chữ, không giải thích.' }, { inline_data: { mime_type: mime, data } }] }], generationConfig: { maxOutputTokens: 400 } }) });
      const j = await r.json(); const t = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((x) => x.text || '').join('').trim();
      if (t) { audMem[m.id] = t; const ks = Object.keys(audMem); if (ks.length > 400) ks.slice(0, ks.length - 400).forEach((k) => delete audMem[k]); localStorage.setItem(AUD_KEY, JSON.stringify(audMem)); }
      return t;
    } catch (e) { return ''; }
  }
  // Shop ĐÃ HỎI gì – khách ĐÃ TRẢ LỜI gì (để bot không hỏi lại)
  function askedKnown(msgs) {
    const asked = [], known = [];
    const isQ = (t) => /\?/.test(t) || (/(^|[^\p{L}])(hỏi|hay|nào|bao nhiêu|mấy|chưa|hông|không|đúng không|được không)(?=[^\p{L}]|$)/iu.test(t) && /(ạ|nha|nhé|ko|không|chưa)\s*$/iu.test(t));
    msgs.slice(-24).forEach((m, i, arr) => {
      if (!m.k && m.text && m.text.length < 160 && isQ(m.text)) { asked.push(m.text); const nx = arr[i + 1]; if (nx && nx.k && nx.text) known.push(m.text.slice(0, 60) + ' → ' + nx.text.slice(0, 80)); }
    });
    return { asked: asked.slice(-6), known: known.slice(-6) };
  }

  // ===================== GEMINI =====================
  // Chạy đua: model trong ⚙ trước; sau 6 giây chưa xong thì gọi thêm flash-lite-latest; sau 14 giây gọi thêm flash-latest. Model nào báo 404 thì bỏ qua cho đến khi tải lại trang.
  const GEMINI_RACE = [{ model: null, delay: 0 }, { model: 'gemini-flash-lite-latest', delay: 3000 }, { model: 'gemini-flash-latest', delay: 8000 }, { model: 'gemini-3.8-flash', delay: 15000 }];
  const DEAD_MODELS = new Set();
  const OUT_SCHEMA = { type: 'OBJECT', properties: { reply_1: { type: 'STRING' }, kieu_1: { type: 'STRING' }, reply_2: { type: 'STRING' }, kieu_2: { type: 'STRING' }, reply_3: { type: 'STRING' }, kieu_3: { type: 'STRING' }, goi_khach: { type: 'STRING' }, tinh_huong: { type: 'STRING' }, mo_the_don: { type: 'BOOLEAN' }, chuyen_nguoi: { type: 'BOOLEAN' }, ly_do: { type: 'STRING' }, mo_ta_anh: { type: 'STRING' }, don_ten: { type: 'STRING' }, don_sdt: { type: 'STRING' }, don_dia_chi: { type: 'STRING' }, don_ma_san: { type: 'STRING' }, don_viec: { type: 'STRING' }, don_qua: { type: 'STRING' }, don_thu: { type: 'STRING' }, bao_hanh_tom_tat: { type: 'STRING' }, nhom: { type: 'STRING' }, khong_phai_khach: { type: 'BOOLEAN' }, loai_hoi_thoai: { type: 'STRING' } }, required: ['reply_1', 'reply_2', 'reply_3', 'goi_khach', 'mo_the_don'] };
  async function callGemini(systemText, userText, images, onModel) {
    if (!cfg.geminiKey) throw new Error('Chưa nhập key Gemini (⚙)');
    const parts = [{ text: userText }].concat(images || []);
    const body = (noThink) => { const gc = { temperature: 0.6, maxOutputTokens: 2000, responseMimeType: 'application/json', responseSchema: OUT_SCHEMA }; if (noThink) gc.thinkingConfig = { thinkingBudget: 0 }; return JSON.stringify({ systemInstruction: { parts: [{ text: systemText }] }, contents: [{ role: 'user', parts }], generationConfig: gc }); };
    const plan = GEMINI_RACE.map((p) => ({ ...p, model: p.model || cfg.model || 'gemini-flash-latest' })).filter((p, i, a) => a.findIndex((x) => x.model === p.model) === i).filter((p) => !DEAD_MODELS.has(p.model));
    if (!plan.length) throw new Error('Không còn model nào dùng được – kiểm tra tên model trong ⚙');
    let done = false; const ctrls = [], errs = [];
    const one = async (p) => {
      await sleep(p.delay); if (done) throw new Error('bỏ'); if (onModel) onModel(p.model);
      for (let attempt = 1; attempt <= 3; attempt++) {
        const ac = new AbortController(); ctrls.push(ac);
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey }, body: body(p.noThink) });
          if (r.status === 429 || r.status === 503) { await sleep(1000 * attempt); throw new Error('Gemini bận (' + r.status + ')'); }
          const j = await r.json();
          if (r.status === 404) { DEAD_MODELS.add(p.model); log('Model ' + p.model + ' không còn dùng được → bỏ qua', 'warn', false); throw new Error('model không tồn tại'); }
          if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
          const c = ((j.candidates || [])[0] || {}).content; const s = c ? (c.parts || []).map((x) => x.text || '').join('') : '';
          if (!s) throw new Error('Gemini không trả nội dung');
          let out; try { out = JSON.parse(s); } catch (e) { const m = s.match(/\{[\s\S]*\}/); if (!m) throw new Error('sai định dạng'); out = JSON.parse(m[0]); }
          if (!String(out.reply_1 || '').trim()) throw new Error('câu trả lời rỗng');
          out._model = p.model; return out;
        } catch (e) { if (done || e.name === 'AbortError') throw new Error('bỏ'); errs.push(p.model + ': ' + String(e.message).slice(0, 100)); if (/API key|not found|invalid|permission|không tồn tại/i.test(e.message) || attempt === 3) throw e; }
      }
    };
    const timeout = sleep(60000).then(() => { if (!done) throw new Error('quá 60 giây'); return new Promise(() => { }); });
    try { const out = await Promise.race([Promise.any(plan.map(one)), timeout]); if (errs.length) log('Gemini: ' + errs.join(' | '), 'warn', false); return out; }
    catch (e) { throw new Error('Không gọi được Gemini – ' + (errs.join(' | ') || e.message)); }
    finally { done = true; ctrls.forEach((c) => { try { c.abort(); } catch (x) { } }); }
  }

  // ===================== ② PROMPT =====================
  const ZALO_RULES = (brand) => `
## KÊNH: ZALO CỦA ${brand.toUpperCase()} (kênh riêng của shop, KHÔNG phải sàn)
- ĐƯỢC: mời khách ghé (xem mục ĐỊA ĐIỂM CỦA SHOP); xin tên – SĐT – địa chỉ để lên đơn; nhận chuyển khoản; book Grab giao gấp; nhắc khách đặt trên Shopee/TikTok nếu khách tiện hơn. Quy định cấm của sàn KHÔNG áp dụng ở đây.
- Khách hỏi giá trên sàn rẻ hơn: nói nhẹ nhàng giá sàn tuỳ thời điểm và mã giảm, khách tiện đặt bên nào cũng được.
- Mẫu chỉ còn ở một nơi (Vạn Phúc hoặc kho Q9) thì nói rõ để khách khỏi đi nhầm.

## ĐỊA ĐIỂM CỦA SHOP (dùng khi khách hỏi chỗ mua / chỗ bảo hành / muốn ghé xem)
- Kho Quận 9: 3/29E đường 182 Lã Xuân Oai, Tăng Nhơn Phú A (Thủ Đức) – đủ hàng, mua hàng và bảo hành trực tiếp; khách đến thì bấm chuông, nên nhắn Shop 1 tin trước khi đi.
- Showroom Vạn Phúc: 76 đường số 2, KĐT Vạn Phúc, Hiệp Bình (Thủ Đức) – chủ yếu trưng bày vài món, ít bán trực tiếp.
- Khách hỏi chỗ mua / bảo hành → đưa CẢ HAI nơi để khách tự chọn, nói rõ kho Quận 9 đủ hàng và bảo hành được ngay.
- Địa chỉ trên và các SĐT 0935907634, 0762222448, 0774222448 là CỦA SHOP – TUYỆT ĐỐI không điền vào don_dia_chi / don_sdt.

## XƯNG HÔ
Shop tự xưng "Shop" (khi chủ động nhắn khách sàn lần đầu được xưng "em bên Shop"). Gọi khách "bạn"; khách tự xưng anh/a → "anh"; chị/c → "chị"; khách xưng "em" → vẫn gọi "bạn". KHÔNG gọi khách là "mình". Ghi xưng hô vào goi_khach ("bạn" / "anh" / "chị").

## QUY TẮC VIẾT (giống hệt nhân viên thật)
- Mỗi phương án = ĐÚNG 1 tin nhắn, 1–3 câu ngắn, KHÔNG xuống dòng. Mở đầu "Dạ", kết "ạ" / "nha" / "nhé ạ". Không dấu chấm/hỏi/than cuối tin. Không emoji.
- Dùng "để mộc" (KHÔNG "nguyên mộc"). "Để mộc, không keo sáp" chỉ nói cho vòng trầm hương, không nói cho bách xanh. Không nói "tự nhiên" cho trầm chuẩn.
- Chỉ trả lời đúng điều khách hỏi, không dán mô tả dài, không quảng cáo thêm, không chào lại nếu đã chào.
- Khách gửi nhiều tin chưa trả lời: đọc hết, trả lời đủ ý trong 1 tin. Khách gửi ảnh thì nói đúng về ảnh (sản phẩm, lỗi, mã đơn trong ảnh…). Tin ghi "(tin thoại)" là lời khách nói đã chép lại – coi như khách nhắn chữ.
- Dòng "[SHOP ĐÃ GỬI N ẢNH SẢN PHẨM]" nghĩa là Shop đã gửi hình mẫu rồi → KHÔNG đề nghị gửi hình nữa, chỉ hỏi khách ưng mẫu nào.
- KHÔNG hỏi lại câu Shop đã hỏi trong hội thoại (xem mục SHOP ĐÃ HỎI). Khách chưa trả lời: nhắc nhẹ đúng 1 ý, và nếu Shop đã hỏi cùng 1 ý từ 2 lần → KHÔNG hỏi lần 3, đổi cách: đưa thẳng gợi ý mẫu/tầm giá phù hợp với điều khách đã nói, hoặc đề nghị cách khác (vd đo cổ tay bằng tờ tiền 100k rồi chụp gửi Shop).
- Tin cuối của khách chỉ là ok / cảm ơn / sticker: cả 3 phương án là câu kết ngắn, khác nhau, không hỏi thêm.
- KHÔNG tự khẳng định còn/hết hàng: nói "Shop kiểm tra kho rồi báo bạn ngay nha". Không hứa chữa bệnh, đổi vận. Không bịa thông số, chính sách, giá.
- Không lặp lại y hệt câu Shop đã nhắn trong hội thoại.
- KHÔNG hứa ngày giao, giờ gửi hay việc đã làm (đã lên đơn, đã gửi, đã đóng gói…) nếu trong hội thoại Shop chưa nói điều đó. Không bịa việc Shop sẽ làm.
- Khi soạn câu Shop chủ động nhắn (khách chưa nhắn gì mới): ngắn, đúng việc đang dở (vd Shop đã xin mã đơn mà khách chưa gửi → nhắc nhẹ đúng điều đó), không mở chủ đề mới.

## BẢO HÀNH / ĐỔI TRẢ (khách mua trên sàn nhắn qua Zalo)
- Chưa có mã đơn → xin mã đơn hàng trước (khách gửi mã vận đơn SPXVN…/VNGH… thì nhờ gửi mã đơn hàng trên app).
- Đổi size trong 30 ngày từ khi nhận hàng. Hướng dẫn đo: quấn tờ 100k sát cổ tay, hai mép áp sát, chụp gửi Shop.
- Size vòng 108: 6li hợp tay ~15,5cm; 7li ~17cm; 8li 18–20cm (vừa khít ~19,5cm); 6li 4 vòng ≈ 8li 5 vòng.
- Cách xử lý: (1) đổi size – Shop tạo 2 đơn song song, 1 giao vòng mới, 1 thu hồi vòng cũ; (2) tháo bớt hạt cho vừa, Shop tặng dây + kim xâu; (3) giữ vòng cũ, mua vòng mới giá ưu đãi; (4) khách nhấn hoàn trên sàn rồi đặt lại size mới.
- Xâu lại: nút thắt giấu trong hạt, đẩy hạt tìm hạt cứng; 1m dây chia đôi, gập đôi xâu, cột 3 nút rồi giấu vào hạt.
- Vòng mất mùi: hàng để mộc, mở hộp mùi rõ nhất rồi dịu lại; đeo đều tay, hơi ấm cơ thể giúp thơm, sậm và bóng hơn; hạn chế nước.
- Khách báo vỡ / sai hàng / thiếu hàng: xin lỗi, xin ảnh, xin mã đơn, hẹn Shop kiểm tra và gửi bù / thu hồi. Không hứa thời gian cụ thể nếu chưa có.
- Shop giao đúng size ghi trên đơn; hạt có thể lệch khoảng 0,5mm so với số li ghi (đo tay bên Shop), đó không phải giao sai – hỏi khách đeo có vừa không rồi mới tính đổi.
- Thay dây, bảo hành, sửa vòng: CHỈ cho sản phẩm mua tại Shop. Vòng mua nơi khác thì không nhận, mời khách hỏi nơi đã mua. Khách mất mã đơn: hỏi tên/SĐT đặt hàng hoặc ảnh sản phẩm để Shop tra, không yêu cầu quá nhiều.
- Cách Shop hay chốt trên Zalo: xin "tên, SĐT, địa chỉ" trong 1 câu; báo "nay Shop đi đơn, tầm 1–3 ngày nhận" (HCM 1–2 ngày, tỉnh xa 2–5 ngày); quà tặng theo mục KHUYẾN MÃI ĐANG CHẠY (nếu có).

## ĐÁNH GIÁ TRÊN SÀN
KHÔNG đề nghị tặng quà để đổi đánh giá 5 sao. KHÔNG tự nhờ khách sửa đánh giá.

## GIÁ
Ưu tiên PANCAKE – GIÁ, sau đó mức giá nhân viên từng báo trong CHAT CŨ (cách báo giá, giá khách quen, giá theo kg/số lượng), sau đó giá sàn. Không tự giảm thêm ngoài những gì nhân viên từng áp dụng; chưa chắc thì "Shop kiểm tra rồi báo lại".

## BA PHƯƠNG ÁN
reply_1: trả lời thẳng đúng ý khách (hợp nhất, sẽ điền sẵn vào ô chat). reply_2: trả lời kèm 1 câu hỏi lại để tư vấn sâu hơn (hỏi ý khác với điều đã hỏi trong hội thoại). reply_3: hướng tới chốt đơn (xin thông tin lên đơn / mời ghé cửa hàng / đề xuất giải pháp cụ thể). Khách chỉ xã giao thì cả 3 là câu kết ngắn. kieu_1..3: 2–4 chữ. tinh_huong: 1 câu ngắn mô tả tình huống. chuyen_nguoi=true khi khiếu nại nặng, đòi hoàn tiền, mua sỉ, hoặc bạn không chắc (vẫn soạn câu mềm).

## THÔNG TIN ĐƠN (điền don_*; KHÔNG bịa – không có thì để trống)
Thông tin có thể nằm trong tin của KHÁCH, trong tin của SHOP (Shop hay chép lại thông tin đơn), trong GHI CHÚ, hoặc trong ảnh. Hệ thống đã trích sẵn một phần ở mục "THÔNG TIN ĐÃ TRÍCH" – kiểm tra lại và bổ sung phần thiếu.
CHỈ lấy thông tin KHÁCH đã gửi (hoặc Shop đã chép lại thành tin tạo đơn). Địa chỉ/SĐT Shop nhắn cho khách để khách ghé KHÔNG phải của khách.
don_viec / don_qua / don_thu: CHỈ điền khi khách ĐÃ CHỐT (đồng ý lấy, đã gửi tên/SĐT/địa chỉ, hoặc đang đổi trả có mã đơn). Đang tư vấn, khách chưa quyết (vd "để anh xem") → để trống, KHÔNG đoán.
don_ten (tên người nhận), don_sdt, don_dia_chi (đầy đủ), don_ma_san (mã đơn sàn nếu là khách sàn), don_viec (vd "Đổi 108 TRẦM CHUẨN 7li SMH sang 108 TRẦM CHUẨN 6li SMH" hoặc "5 hộp nụ cao cấp THHX 140k*5"), don_qua (quà Shop đã hứa), don_thu (vd "Thu cod: 700k, miễn phí ship ạ").
mo_the_don=true khi khách hỏi bảo hành/đổi trả/lỗi hàng hoặc đã gửi thông tin nhận hàng. bao_hanh_tom_tat: 1 dòng nếu khách báo lỗi/bảo hành (vd "báo vỡ 2 hạt, đã xin ảnh"), không thì để trống. mo_ta_anh: mô tả ngắn ảnh khách gửi.

## LOẠI HỘI THOẠI
nhom: "bán hàng" (tư vấn, báo giá, chốt đơn mới) hoặc "bảo hành" (đổi size, lỗi, vỡ, thiếu, thay dây, xâu lại, hỏi đơn đã mua).
khong_phai_khach=true khi người nhắn KHÔNG phải khách mua hàng: nhân viên nội bộ của Shop (gửi video/tài liệu công việc, báo chuyển khoản nội bộ, trao đổi việc), nhà cung cấp/đối tác (thùng carton, vận chuyển, in ấn, nhập hàng…), tin quảng cáo/spam. loai_hoi_thoai: "khách mua" | "nhân viên nội bộ" | "nhà cung cấp" | "quảng cáo". Không chắc → khong_phai_khach=false.`;

  const promoOf = (sh) => String((sh === 'THHX' ? cfg.promoTHHX : cfg.promoSMH) || '').trim();
  function buildSystem(page, lastText) {
    const kb = S.kb || { voice: {}, voiceP: {}, policies: [], policiesP: [], groups: [], products: [], faq: [], prices: [], promos: [] };
    const br = page.brand, sh = page.short;
    const prods = kb.products.filter((p) => !p.th || p.th === br).map((p) => ({ p, s: overlap(lastText, p.ten + ' ' + p.tenngan + ' ' + p.nhom) })).filter((x) => x.s > 0.15).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.p);
    const grps = kb.groups.filter((g) => !g.th || g.th === br).map((g) => ({ g, s: overlap(lastText, g.nhom + ' ' + g.mota) })).filter((x) => x.s > 0.12).sort((a, b) => b.s - a.s).slice(0, 2).map((x) => x.g);
    const faq = kb.faq.filter((q) => !q.th || q.th === br).map((q) => ({ q, s: overlap(lastText, q.hoi) })).filter((x) => x.s > 0.3).sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.q);
    const pairs = similarPairs(sh, lastText, 10);
    const notSan = (p) => !/ngoài sàn|kênh khác|thẻ bảo hành|liên hệ|nền tảng/i.test(p.nd);
    return [
      `Bạn là nhân viên chăm sóc khách hàng của ${br}, đang trả lời khách trên Zalo của shop (qua Pancake). Tên nội bộ: TDG-pancake. Mục tiêu: trả lời ĐÚNG ý khách, GIỐNG HỆT cách nhân viên thật nhắn, và hỗ trợ chốt đơn / bảo hành gọn gàng.`,
      ZALO_RULES(br),
      kb.voiceP[br] ? `\n## GIỌNG ĐIỆU ZALO\n${kb.voiceP[br]}` : (kb.voice[br] ? `\n## GIỌNG ĐIỆU\n${kb.voice[br]}` : ''),
      kb.policiesP.length ? `\n## CHÍNH SÁCH RIÊNG ZALO (ưu tiên cao nhất)\n${kb.policiesP.filter((p) => !p.th || p.th === br).map((p) => `- ${p.muc}: ${p.nd}`).join('\n')}` : '',
      `\n## CHÍNH SÁCH CHUNG\n${kb.policies.filter((p) => (!p.th || p.th === br) && notSan(p)).map((p) => `- ${p.muc}: ${p.nd}`).join('\n')}`,
      kb.prices.length ? `\n## PANCAKE – GIÁ\n${kb.prices.filter((p) => !p.th || p.th === br).map((p) => `- ${p.sp}: ${p.gia}${p.ghichu ? ' (' + p.ghichu + ')' : ''}`).join('\n')}` : '',
      promoOf(sh) ? `\n## KHUYẾN MÃI ĐANG CHẠY (Zalo/web ${br} – nhân viên sửa trong ⚙)\n${promoOf(sh)}\nCách dùng: khách hỏi quà/khuyến mãi, hoặc đơn đã đủ mốc → báo đúng quà theo mốc cao nhất đạt được (ghi vào don_qua khi đã chốt). Đơn gần tới mốc kế tiếp → được gợi ý nhẹ 1 câu thêm sản phẩm để nhận quà cao hơn, không ép. Không tự thêm quà ngoài danh sách.` : '',
      kb.promos.length ? `\n## KHUYẾN MÃI\n${kb.promos.filter((p) => !p.th || p.th === br).map((p) => `- ${p.ct} | ${p.ad}`).join('\n')}` : '',
      grps.length ? grps.map((g) => `\n## KIẾN THỨC NHÓM: ${g.nhom}\n${[g.mota, g.thanhphan && 'Thành phần: ' + g.thanhphan, g.quycach && 'Kích thước: ' + g.quycach, g.cachdung && 'Cách dùng: ' + g.cachdung, g.baoquan && 'Bảo quản: ' + g.baoquan].filter(Boolean).join('\n')}`).join('\n') : '',
      prods.length ? `\n## SẢN PHẨM LIÊN QUAN (giá sàn tham khảo)\n${prods.map((p) => `- ${p.tenngan || p.ten} | ${p.gia} | ${p.phanloai}${p.diemrieng ? ' | ' + p.diemrieng : ''}`).join('\n')}` : '',
      faq.length ? `\n## CÂU TRẢ LỜI CHUẨN (ưu tiên dùng)\n${faq.map((q) => `Hỏi: ${q.hoi}\nĐáp: ${q.dap}`).join('\n\n')}` : '',
      lessonsFor(sh, lastText),
      pairs.length ? `\n## NHÂN VIÊN THẬT ĐÃ TRẢ LỜI TRÊN ZALO (bắt chước cách nói, cách báo giá; câu đánh dấu ← đã dẫn tới chốt đơn / khách hài lòng thì ưu tiên học)\n${pairs.map((p) => `Khách: ${p.q}\nShop: ${p.a}${p.res === 'chốt' ? '  ← cuộc này đã chốt đơn' : p.res === 'vui' ? '  ← khách hài lòng' : ''}`).join('\n\n')}` : '',
    ].filter(Boolean).join('\n');
  }
  const MINH_RX = /(^|[^\p{L}])(?<!(?:shop|bên|chúng|ben)\s)(mình)(?=[^\p{L}]|$)/giu;
  function finishText(t, pron) {
    let s = String(t || '').replace(/\s*\n+\s*/g, ' ').replace(/Nguyên mộc/g, 'Để mộc').replace(/nguyên mộc/gi, 'để mộc').replace(/[\s.?!。]+$/u, '').trim();
    const to = pron === 'anh' || pron === 'chị' ? pron : 'bạn';
    // "cho mình xin / để mình kiểm tra" = Shop tự xưng → đổi thành Shop; còn lại "mình" là gọi khách → đổi thành bạn/anh/chị
    s = s.replace(/\b(cho|để)\s+mình\s+(xin|kiểm tra|xem|gửi|lên đơn|tư vấn|hỗ trợ|báo|hỏi|kiểm)/giu, '$1 Shop $2');
    s = s.replace(MINH_RX, (m, a, w) => a + (w[0] === 'M' ? to[0].toUpperCase() + to.slice(1) : to));
    s = s.replace(/\b(b)ên mình\b/giu, (m, b) => b + 'ên Shop').replace(/\bshop mình\b/gi, 'Shop');
    if (s) s = s[0].toUpperCase() + s.slice(1);
    return s;
  }

  // ===================== SOẠN GỢI Ý =====================
  let curReq = 0;
  async function onConversation(isNew) {
    const A = S.active; if (!A || !A.page || !A.custId) return;
    const req = ++curReq;
    let data;
    try { data = await timed('Đọc tin nhắn', () => fetchMsgs(A.pid, A.convId, A.custId, 2)); } catch (e) { S.err = 'Không đọc được tin nhắn: ' + e.message; render(); return; }
    if (req !== curReq || S.active !== A) return;
    A.msgs = data.msgs; A.notes = data.notes;
    A.info = extractInfo(data.msgs, data.notes);
    render();
    const last = data.msgs[data.msgs.length - 1];
    const sg = S.sg[A.convId];
    if (sg && last && sg.lastMsgId !== last.id && !last.k) sg.staffReplied = true;
    if (!last || !last.k) { compareSent(A); render(); return; }
    if (sg && sg.lastMsgId === last.id) { render(); return; }
    if (notCust[A.convId] && !S.force[A.convId]) { render(); return; }
    A.closed = pendingOf(data.msgs).every(isClosing);
    if (A.closed) { log('Khách đã kết thúc (cảm ơn/ok/sticker) → không tự soạn', '', false); render(); return; }
    if (!cfg.autoSuggest && !isNew && sg) return;
    suggest(false);
  }
  const pendingOf = (msgs) => { let i = msgs.length; while (i > 0 && msgs[i - 1].k) i--; return msgs.slice(i); };
  const CLOSE_WORDS = /^(ok|oke|okê|okie|oki|okay|okela|dạ|vâng|ừ|uk|ừm|ờ|cảm ơn|cám ơn|thanks|thank you|thank|tks|dạ vâng|vâng ạ|dạ ok|dạ cảm ơn|ok cảm ơn|được rồi|rồi|xong)( (shop|bạn|em|e|nhé|nha|ạ|nhiều|shop nhé|shop nha|bạn nhé|nhé ạ|ạ shop))*$/i;
  const isClosing = (m) => { if (!m.k) return false; const t = norm(m.text).replace(/[\s.!,~?]+$/g, '').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F❤♥]/gu, '').trim(); if (!t) return (m.att || []).length > 0 && m.att.every((a) => a.type === 'sticker'); return CLOSE_WORDS.test(t); };
  const curSg = () => (S.active && S.sg[S.active.convId]) || null;
  const aiBusyHere = () => S.busy && S.active && S.busyConv === S.active.convId;
  async function suggest(manual, extra) {
    const A = S.active; if (!A || !A.page) return;
    if (S.busy) { if (manual) S.err = 'Bot đang soạn, đợi xíu'; render(); return; }
    if (!A.msgs) { try { const d = await fetchMsgs(A.pid, A.convId, A.custId, 2); A.msgs = d.msgs; A.notes = d.notes; A.info = extractInfo(d.msgs, d.notes); } catch (e) { S.err = e.message; render(); return; } }
    if (!S.kb) await loadKB(false);
    S.busy = true; S.busyAt = Date.now(); S.busyConv = A.convId; S.err = ''; S.aiModel = ''; render();
    const convId = A.convId; const t0 = Date.now();
    try {
      const out = await draftFor(A, extra);
      if (out.notCust) {
        notCust[convId] = out.loai || 'không phải khách'; saveNotCust(); delete S.sg[convId];
        addLesson({ type: 'không phải khách', br: A.page.short, q: (A.msgs || []).filter((m) => m.k).slice(-2).map((m) => m.text).join(' / ').slice(0, 300), why: out.loai || 'bot tự nhận ra', conv: convId, who: 'bot tự nhận' });
        log(`Bot nhận ra đây không phải khách mua (${out.loai || '?'}) → không soạn`, 'ok', { conv: convId });
        return;
      }
      out.orig = out.opts.map((o) => o.text);
      if (S.active && S.active.convId === convId) { S.sg[convId] = out; if (!S.tabManual[convId]) S.tab = out.openDon ? 'don' : 'goi'; if (cfg.autoFill) pickOpt(0, false); }
      else S.sg[convId] = out;
      log(`Soạn xong (${out.sec}s, ${out.model})${out.handoff ? ' · nên chuyển người' : ''}`, 'ok', { conv: convId, opts: out.opts.map((o) => o.text), don: out.don });
      maybeAutoNote(convId, out);
    } catch (e) { S.err = e.message; log('Soạn lỗi: ' + e.message, 'err'); }
    finally { S.busy = false; S.busyConv = ''; render(); }
  }
  async function draftFor(A, extra) {
    const t0 = Date.now();
    const msgs = A.msgs.slice(-40).map((m) => Object.assign({}, m));
    // nghe tin thoại của khách (6 tin gần nhất), chữ chép được thay vào chỗ "[audio]"
    const auds = msgs.filter((m) => m.k && m.att.some((a) => a.type === 'audio')).slice(-6);
    for (const m of auds) { S.stage = 'nghe thoại'; renderZone(); const t = await transcribe(m); if (t) { m.text = (m.text ? m.text + ' ' : '') + '(tin thoại) ' + t; m.voice = true; } }
    S.stage = '';
    const lastCust = msgs.filter((m) => m.k).slice(-4).map((m) => m.text).join(' ');
    const attLabel = (m) => { const types = m.att.map((a) => a.type); if (!types.length) return ''; if (!m.k && types.includes('photo')) return ` [SHOP ĐÃ GỬI ${types.filter((t) => t === 'photo').length} ẢNH SẢN PHẨM]`; return ' [' + types.map((t) => (t === 'audio' && m.voice ? 'thoại' : t)).join(', ') + ']'; };
    const transcript = msgs.map((m) => `${m.k ? 'KHÁCH' : 'SHOP'} [${String(m.t).slice(5, 16).replace('T', ' ')}]: ${m.text || ''}${attLabel(m)}`).join('\n');
    const pendIdx = (() => { let i = msgs.length; while (i > 0 && msgs[i - 1].k) i--; return i; })();
    const pend = msgs.slice(pendIdx);
    // ảnh khách gửi: lấy trong CẢ hội thoại gần đây (4 ảnh mới nhất), không chỉ cụm tin đang chờ
    const custPhotos = cfg.readImages ? msgs.filter((m) => m.k).flatMap((m) => m.att.filter((a) => a.type === 'photo' && a.url).map((a) => ({ url: a.url, t: String(m.t).slice(5, 16).replace('T', ' ') }))).slice(-4) : [];
    const images = [], qrs = [], imgNotes = [];
    for (const ph of custPhotos) { const p = await imagePart(ph.url); if (p) { images.push(p); imgNotes.push(`ảnh #${images.length} khách gửi lúc ${ph.t}`); } const q = await readQR(ph.url); if (q) qrs.push(q); }
    const ak = askedKnown(msgs);
    const info = A.info || extractInfo(A.msgs, A.notes);
    if (qrs.length) { const c = findCodes(qrs.join(' ')); if (c.order && !info.ma) info.ma = c.order; if (c.track && !info.track) info.track = c.track; }
    const notesTxt = (A.notes || []).map((n) => n.msg).filter(Boolean).slice(-4).join('\n---\n');
    const user = [
      `Hôm nay: ${new Date().toLocaleDateString('vi-VN')}. Tên khách trên Zalo: ${A.name || '(không rõ)'}.`,
      notesTxt ? `GHI CHÚ ĐÃ LƯU Ở Ô THÔNG TIN:\n${notesTxt}` : '',
      `THÔNG TIN ĐÃ TRÍCH (hệ thống đọc từ chat/ghi chú – kiểm tra lại):\n${['ten', 'sdt', 'dc', 'ma', 'viec', 'qua', 'thu'].map((k) => `${({ ten: 'Tên', sdt: 'SĐT', dc: 'Địa chỉ', ma: 'Mã đơn sàn', viec: 'Sản phẩm/việc', qua: 'Quà', thu: 'Thu' })[k]}: ${info[k] || '(chưa có)'}`).join('\n')}${info.track ? `\nKhách gửi MÃ VẬN ĐƠN ${info.track} (không phải mã đơn hàng)` : ''}`,
      qrs.length ? `MÃ QR ĐỌC ĐƯỢC TỪ ẢNH: ${qrs.join(' | ')}` : '',
      imgNotes.length ? `ẢNH KHÁCH GỬI (đính kèm bên dưới theo thứ tự): ${imgNotes.join('; ')}. Hãy xem kỹ: ảnh đo cổ tay (tờ tiền quấn tay) → đọc số đo/tư vấn size; ảnh đơn hàng → đọc mã đơn, sản phẩm; ảnh sản phẩm lỗi → mô tả lỗi.` : '',
      ak.asked.length ? `SHOP ĐÃ HỎI (TUYỆT ĐỐI không hỏi lại):\n${ak.asked.map((q) => '- ' + q).join('\n')}${ak.known.length ? '\nKHÁCH ĐÃ TRẢ LỜI:\n' + ak.known.map((q) => '- ' + q).join('\n') : ''}` : '',
      extra || '',
      `HỘI THOẠI (cũ → mới):\n${transcript}`,
      pend.length ? `TIN KHÁCH ĐANG CHỜ TRẢ LỜI (${pend.length} tin): ${pend.map((m) => m.text || '[' + m.att.map((a) => a.type).join(',') + ']').join(' | ')}` : 'KHÁCH CHƯA NHẮN GÌ MỚI (tin cuối là của Shop hoặc khách chỉ cảm ơn/ok). Soạn câu Shop chủ động nhắn: ngắn, chỉ nhắc đúng việc đang dở dựa trên câu Shop vừa nói (vd Shop đã xin thông tin/mã đơn mà khách chưa gửi → nhắc nhẹ). CẤM nói "đã gửi hàng", "đã lên đơn", "đã chuẩn bị xong", "đang giao", hẹn ngày giờ… nếu Shop chưa nói ĐÚNG như vậy trong hội thoại. Hội thoại đã xong xuôi thì soạn câu cảm ơn/chúc ngắn, không hứa gì.',
      `Hãy soạn 3 phương án.`,
    ].filter(Boolean).join('\n\n');
    const out = await callGemini(buildSystem(A.page, lastCust || transcript.slice(-500)), user, images, (m) => { S.aiModel = m; });
    if (out.khong_phai_khach && !S.force[A.convId] && !extra) return { notCust: true, loai: out.loai_hoi_thoai || '' };
    const pron = norm(out.goi_khach);
    // chỉ nhận thông tin đơn có trong tin KHÁCH / ghi chú / tin tạo đơn – không lấy địa chỉ, SĐT Shop nhắn cho khách
    const custSrc = [msgs.filter((m) => m.k).map((m) => m.text).join('\n'), (A.notes || []).map((n) => n.msg).join('\n'), (A.msgs || []).filter((m) => !m.k && m.text && isOrderBlock(m.text)).map((m) => m.text).join('\n')].join('\n');
    const srcToks = new Set(toks(custSrc));
    const supported = (v) => { const t = toks(v); return t.length > 0 && t.filter((x) => srcToks.has(x)).length / t.length >= 0.6; };
    let aiDc = String(out.don_dia_chi || '').trim(); if (aiDc && (isShopAddr(aiDc) || !supported(aiDc))) { if (aiDc) log('Bỏ địa chỉ AI đoán (không có trong tin khách): ' + aiDc.slice(0, 60), '', false); aiDc = ''; }
    const custPhones = phonesIn(custSrc + '\n' + (A.name || ''));
    const aiPhone = phonesIn(out.don_sdt || '').find((x) => custPhones.includes(x)) || '';
    // Có tin tạo đơn thật (Shop đã chép / ghi chú) → tin đó là nguồn chính xác nhất; AI chỉ bù phần thiếu
    const fromBlock = (info.from || []).some((f) => /tin tạo đơn/.test(f));
    const pick = (ai, loc) => (fromBlock ? (loc || ai || '') : (ai || loc || ''));
    const chot = fromBlock || !!info.ma || phonesIn(custSrc).length > 0;
    const aiOrd = (v) => (chot ? v : '');
    const don = { ten: pick(out.don_ten, info.ten), sdt: info.sdt || aiPhone, dc: pick(aiDc, info.dc), ma: info.ma || out.don_ma_san || '', viec: pick(aiOrd(out.don_viec), info.viec), qua: pick(aiOrd(out.don_qua), info.qua), thu: pick(aiOrd(out.don_thu), info.thu) };
    if (don.ma && !findCodes(don.ma).order) don.ma = info.ma || '';
    if (isShopAddr(don.dc)) don.dc = ''; if (SHOP_PHONES.includes(don.sdt)) don.sdt = '';
    learnedFix(don);
    const nhom = /bảo hành/i.test(out.nhom || '') ? 'bảo hành' : /bán/i.test(out.nhom || '') ? 'bán hàng' : (info.ma || out.bao_hanh_tom_tat ? 'bảo hành' : 'bán hàng');
    return {
      convId: A.convId, lastMsgId: (msgs[msgs.length - 1] || {}).id, at: Date.now(), model: out._model, sec: Math.round((Date.now() - t0) / 1000),
      opts: [1, 2, 3].map((k) => ({ text: finishText(out['reply_' + k], pron), kieu: out['kieu_' + k] || '', sent: false })).filter((o) => o.text),
      pron: out.goi_khach || 'bạn', tinh: out.tinh_huong || '', handoff: !!out.chuyen_nguoi, lydo: out.ly_do || '', img: out.mo_ta_anh || '',
      don, bh: out.bao_hanh_tom_tat || '', openDon: !!out.mo_the_don || !!(info.track), track: info.track || '', cur: -1, sent: null, staffReplied: false,
      nhom, q: (pend.length ? pend.map((m) => m.text || '[' + m.att.map((a) => a.type).join(',') + ']').join(' / ') : lastCust).slice(0, 400),
    };
  }
  function resuggest() { const A = S.active; if (!A) return; if (notCust[A.convId]) S.force[A.convId] = true; const sg = S.sg[A.convId]; if (sg) sg.lastMsgId = null; clearOurFill(); suggest(true); }
  function markNotCust(on) { const A = S.active; if (!A || !A.page) return; if (on) { notCust[A.convId] = 'nhân viên đánh dấu'; delete S.sg[A.convId]; delete S.force[A.convId]; addLesson({ type: 'không phải khách', br: A.page.short, why: 'nhân viên đánh dấu', conv: A.convId }); } else { delete notCust[A.convId]; S.force[A.convId] = true; addLesson({ type: 'là khách', br: A.page.short, why: 'nhân viên đánh dấu là khách', conv: A.convId }); resuggest(); } saveNotCust(); S.waitingAt = 0; refreshWaiting(); render(); }

  // ===================== ③ ĐƠN & BẢO HÀNH =====================
  const donComplete = (d) => !!(d && d.ten && d.sdt && d.dc && d.viec);
  function orderText(d, page) {
    const san = d.ma ? (RX_TIKTOK.test(d.ma) ? 'tiktok' : RX_SHOPEE.test(d.ma) ? 'shopee' : '') : '';
    const L = [d.ma ? `${d.ma} ${page.short.toLowerCase()}${san ? ' ' + san : ''}` : `ZALO ${page.short}`, d.ten || '⚠ THIẾU TÊN', d.sdt || '⚠ THIẾU SĐT', d.dc || '⚠ THIẾU ĐỊA CHỈ', d.viec || '⚠ THIẾU SẢN PHẨM'];
    if (d.qua) L.push(/^(tặng|gửi tặng|kèm)/i.test(d.qua) ? d.qua : 'Tặng ' + d.qua);
    if (d.thu) L.push(d.thu);
    return L.join('\n');
  }
  function donOf(A) { const sg = S.sg[A.convId]; if (sg && sg.don) return sg.don; const i = A.info || {}; return { ten: i.ten || '', sdt: i.sdt || '', dc: i.dc || '', ma: i.ma || '', viec: i.viec || '', qua: i.qua || '', thu: i.thu || '' }; }
  async function postNote(A, text) {
    const t0 = Date.now();
    const tryApi = async () => {
      const url = `/api/v1/pages/${A.pid}/customers/${encodeURIComponent(A.custId)}/notes${A.token ? '?access_token=' + encodeURIComponent(A.token) : ''}`;
      const body = { message: text, conversation_id: A.convId, images: '[]', links: '[]' };
      let r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
      if (!r || !r.success) { const fd = new FormData(); Object.entries(body).forEach(([k, v]) => fd.append(k, v)); r = await fetch(url, { method: 'POST', credentials: 'include', body: fd }).then((x) => x.json()).catch(() => null); }
      return !!(r && r.success);
    };
    const tryUi = async () => {
      const ta = document.querySelector('.textarea-note-content textarea') || document.getElementById('note-content'); if (!ta || !S.active || S.active.convId !== A.convId) return false;
      ta.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text); ta.dispatchEvent(new Event('input', { bubbles: true })); await sleep(300);
      if (norm(ta.value) !== norm(text)) return false;
      const ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      ['keydown', 'keypress', 'keyup'].forEach((k) => ta.dispatchEvent(new KeyboardEvent(k, ev))); await sleep(1500); return !ta.value;
    };
    const verify = async () => { try { const d = await fetchMsgs(A.pid, A.convId, A.custId, 1); A.notes = d.notes; return d.notes.some((n) => norm(n.msg) === norm(text)); } catch (e) { return false; } };
    // 1.2.1: gõ vào ô "Nhập ghi chú" của Pancake trước → ghi chú hiện ngay trên màn hình (gửi ngầm thì Pancake không tự hiện, nhân viên tưởng chưa ghi rồi bấm nhiều lần)
    let how = 'gõ ô ghi chú'; let ok = (await tryUi()) && (await sleep(800), await verify());
    if (!ok) { if (await verify()) ok = true; else { how = 'gửi ngầm – tải lại trang mới thấy'; ok = (await tryApi()) && (await verify()); } }
    log(ok ? `Đã ghi ô Thông tin (${how}, ${Math.round((Date.now() - t0) / 1000)}s)` : 'KHÔNG ghi được ô Thông tin – Cao chép tay giúp', ok ? 'ok' : 'err', { conv: A.convId, text });
    render(); return ok;
  }
  // Sửa ghi chú đã có: Pancake không có lệnh sửa công khai → bấm bút chì, điền chữ, bấm Lưu (chỉ khi đang mở đúng khách)
  async function editNote(A, note, text) {
    if (!S.active || S.active.convId !== A.convId) return false;
    const els = [...document.querySelectorAll('.note-el')];
    const el = els.find((e) => norm(e.textContent).includes(norm(note.msg).slice(0, 120))) || els.find((e) => norm(e.textContent).includes(norm(note.msg.split('\n')[0].slice(0, 40))));
    if (!el) return false;
    const btn = el.querySelector('.edit-note-btn'); if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(600);
    const ta = el.querySelector('textarea') || document.querySelector('.note-el textarea'); if (!ta) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text); ta.dispatchEvent(new Event('input', { bubbles: true })); await sleep(400);
    const save = [...document.querySelectorAll('button')].find((b) => /^Lưu$/.test(b.textContent.trim()) && b.offsetParent); if (!save) return false;
    save.click(); await sleep(1800);
    try { const d = await fetchMsgs(A.pid, A.convId, A.custId, 1); A.notes = d.notes; return d.notes.some((n) => norm(n.msg) === norm(text)); } catch (e) { return false; }
  }
  // Ghi chú đơn của khách = ghi chú có dạng tin tạo đơn mới nhất (bot hoặc nhân viên đều có thể đã viết)
  const orderNoteOf = (A) => (A.notes || []).filter((n) => isOrderBlock(n.msg)).sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))[0] || null;
  const NOTE_KEY = 'tdgp_notes_v1'; const noteMem = JSON.parse(localStorage.getItem(NOTE_KEY) || '{}');
  function saveNoteMem() { const ks = Object.keys(noteMem); if (ks.length > 500) ks.sort((a, b) => noteMem[a].at - noteMem[b].at).slice(0, ks.length - 500).forEach((k) => delete noteMem[k]); localStorage.setItem(NOTE_KEY, JSON.stringify(noteMem)); }
  // Một khách = một ghi chú đơn. Đủ thông tin mới ghi; có thay đổi thì SỬA ghi chú đó, không tạo thêm.
  async function maybeAutoNote(convId, sg) {
    if (!cfg.autoNote) return; const A = S.active; if (!A || A.convId !== convId) return;
    if (!donComplete(sg.don)) return;
    const mem = noteMem[convId] || { order: '', at: 0 };
    const txt = orderText(sg.don, A.page); const h = hash(norm(txt));
    if (h === mem.order || Date.now() - mem.at < 2 * 60000) return;
    const cur = orderNoteOf(A);
    if ((A.notes || []).some((x) => norm(x.msg) === norm(txt))) { mem.order = h; noteMem[convId] = mem; saveNoteMem(); return; }
    let ok;
    if (cur) { ok = await editNote(A, cur, txt); if (ok) log('Đã sửa ghi chú đơn (không tạo thêm)', 'ok', { conv: convId, text: txt }); else { log('Không sửa được ghi chú đơn – không tạo thêm, nhân viên bấm 📝 để sửa', 'warn', { conv: convId }); mem.at = Date.now(); noteMem[convId] = mem; saveNoteMem(); return; } }
    else ok = await postNote(A, txt);
    if (ok) { mem.order = h; mem.at = Date.now(); noteMem[convId] = mem; saveNoteMem(); render(); }
  }

  const donLearned = new Set();
  function learnDon(A, finalText) {
    if (!A || !A.page || S.donEdit[A.convId] === undefined) return;
    const botText = orderText(donOf(A), A.page); if (norm(botText) === norm(finalText)) return;
    const k = A.convId + hash(norm(finalText)); if (donLearned.has(k)) return; donLearned.add(k);
    addLesson({ type: 'sửa đơn', br: A.page.short, nhom: (curSg() || {}).nhom || '', bot: botText, a: finalText, why: 'nhân viên sửa tin tạo đơn', conv: A.convId });
  }
  // ===================== Ô CHAT · GỬI =====================
  const chatBox = () => document.getElementById('replyBoxComposer');
  function setChat(ta, text) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text); ta.dispatchEvent(new Event('input', { bubbles: true })); S.lastFilled = text; }
  const isBotText = (t) => { const n = norm(t); return !!n && (n === norm(S.lastFilled) || Object.values(S.sg).some((s) => s.opts.some((o) => norm(o.text) === n))); };
  function flashChatBox(ta) { try { ta.classList.remove('tdg-flashbox'); void ta.offsetWidth; ta.classList.add('tdg-flashbox'); setTimeout(() => ta.classList.remove('tdg-flashbox'), 1300); } catch (e) { } }
  function pickOpt(i, force, keepFocus) {
    const sg = curSg(); if (!sg || !sg.opts[i]) return false;
    if (force && aiBusyHere()) return false;
    const nick = domNick(); if (nick && S.active.name && similarity(nick, S.active.name) < 0.6) { S.err = `Khung chat đang là "${nick}", không phải "${S.active.name}" – không điền`; render(); return false; }
    const ta = chatBox(); if (!ta) { S.err = 'Không tìm thấy ô chat'; render(); return false; }
    const text = ((els.opt && els.opt[i]) ? els.opt[i].value : sg.opts[i].text).trim(); if (!text) return false;
    const cur = (ta.value || '').trim();
    if (!force && cur && !isBotText(cur)) { log('Ô chat đang có chữ nhân viên gõ dở → không ghi đè', 'warn', false); return false; }
    if (sg.cur === i && cur === text) { render(); return true; }
    setChat(ta, text); sg.cur = i; S.err = ''; flashChatBox(ta);
    if (force && !keepFocus) { try { ta.focus(); ta.setSelectionRange(text.length, text.length); } catch (e) { } }
    render(); return true;
  }
  function clearOurFill() { const ta = chatBox(); if (ta && (ta.value || '').trim() && isBotText(ta.value)) setChat(ta, ''); const sg = curSg(); if (sg) sg.cur = -1; }
  async function sendOpt(i) {
    const A = S.active; const sg = curSg(); if (!sg || !sg.opts[i] || S.sending) return;
    if (aiBusyHere()) return;
    const text = ((els.opt && els.opt[i]) ? els.opt[i].value : sg.opts[i].text).trim(); if (!text) return;
    S.sending = true; render(); const t0 = Date.now();
    try {
      if (!pickOpt(i, true, true)) throw new Error('không điền được ô chat');
      await sleep(250);
      const btn = document.querySelector('[aria-label="Gửi tin nhắn"]') || document.querySelector('[title="Gửi tin nhắn"]');
      if (btn) btn.click(); else chatBox().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      await sleep(1500);
      if (chatBox() && chatBox().value.trim() === text) { chatBox().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); await sleep(1500); }
      let ok = false;
      for (let k = 0; k < 4 && !ok; k++) { try { const d = await fetchMsgs(A.pid, A.convId, A.custId, 1); ok = d.msgs.slice(-6).some((m) => !m.k && norm(m.text) === norm(text)); if (ok) { A.msgs = d.msgs; sg.lastMsgId = d.msgs[d.msgs.length - 1].id; } } catch (e) { } if (!ok) await sleep(1500); }
      sg.opts[i].sent = true; sg.sent = i + 1; sg.opts[i].text = text;
      log(ok ? `Đã gửi phương án ${i + 1} (${Math.round((Date.now() - t0) / 1000)}s)` : `Bấm gửi phương án ${i + 1} nhưng chưa thấy tin trong hội thoại – kiểm tra giúp`, ok ? 'ok' : 'err', { conv: A.convId, text });
      const botOrig = (sg.orig || [])[i] || text; const sua = similarity(text, botOrig) < 0.85;
      hookSend({ action: 'log', rows: [[new Date().toISOString(), cfg.userName, 'gui', A.page.short + ' ' + A.convId, JSON.stringify({ chon: i + 1, bot: sg.orig || sg.opts.map((o) => o.text), gui: text, sua, nhom: sg.nhom || '' })]] });
      if (sua && text.length >= 8) addLesson({ type: 'mẫu câu', br: A.page.short, nhom: sg.nhom, q: sg.q, bot: botOrig, a: text, why: 'nhân viên sửa gợi ý trước khi gửi', conv: A.convId });
    } catch (e) { S.err = 'Gửi lỗi: ' + e.message; log('Gửi lỗi: ' + e.message, 'err'); }
    finally { S.sending = false; render(); }
  }
  function compareSent(A) {
    const sg = S.sg[A.convId]; if (!sg || sg.compared || sg.sent) return;
    const after = (A.msgs || []).filter((m) => !m.k && Date.parse(m.t + 'Z') > sg.at - 2000);
    const real = after.map((m) => m.text).filter(Boolean).join(' / '); if (!real) return;
    sg.compared = true; sg.staffReplied = true;
    const used = sg.opts.some((o) => after.some((m) => similarity(m.text, o.text) >= 0.85));
    hookSend({ action: 'log', rows: [[new Date().toISOString(), cfg.userName, used ? 'gui' : 'so-sanh', A.page.short + ' ' + A.convId, JSON.stringify({ bot: sg.orig || sg.opts.map((o) => o.text), nhan_vien: real, nhom: sg.nhom || '', sua: false, tu_go: !used })]] });
    const realTxt = after.filter((m) => m.text && !isOrderBlock(m.text)).map((m) => m.text).join(' / ');
    if (!used && realTxt.length >= 8 && sg.q) addLesson({ type: 'mẫu câu', br: A.page.short, nhom: sg.nhom, q: sg.q, bot: (sg.orig || [])[0] || (sg.opts[0] || {}).text || '', a: realTxt.slice(0, 600), why: 'nhân viên tự trả lời khác gợi ý', conv: A.convId });
  }

  // ===================== KHÁCH CHỜ · TRƯỚC / TIẾP =====================
  async function refreshWaiting() {
    if (Date.now() - S.waitingAt < 40000) return;
    S.waitingAt = Date.now();
    try {
      const list = [];
      for (const pid of Object.keys(PAGES)) {
        const j = await api(`/api/v1/conversations?pages[${pid}]=0&unread_first=true&mode=OR&cursor_mode=true`);
        for (const c of (j && j.conversations) || []) {
          if (c.id.includes('_g_') || notCust[c.id]) continue;
          const lastByCust = !!(c.last_sent_by && String(c.last_sent_by.id || c.last_sent_by) === custOfConv(c.id));
          const social = /^\s*(\[(sticker|photo|reaction)\]|ok|oke|okie|dạ|vâng|cảm ơn|cám ơn|thanks|thank|tks|❤|👍|😊|🙏|rồi|uk|ừ|ừm)/i.test(String(c.snippet || '')) && String(c.snippet || '').length < 30;
          const waiting = !c.seen || (c.unread_count > 0) || (lastByCust && !social);
          if (!waiting) continue;
          const since = Date.parse((c.last_customer_interactive_at || c.updated_at) + 'Z') || Date.now();
          if (Date.now() - since > 12 * 3600e3) continue;
          list.push({ convId: c.id, pid, short: PAGES[pid].short, name: (c.from || {}).name || '', since, min: Math.max(0, Math.round((Date.now() - since) / 60000)), snippet: c.snippet || '' });
        }
      }
      list.sort((a, b) => a.since - b.since);
      S.waiting = list; renderHead(); renderNav(); renderDet();
    } catch (e) { log('Không lấy được danh sách khách chờ: ' + e.message, 'warn', false); }
  }
  function listItems() { return [...document.querySelectorAll('.conversation-list-item')]; }
  function itemConvId(el) { try { const fk = Object.keys(el).find((k) => k.startsWith('__reactFiber')); let f = el[fk]; for (let i = 0; i < 4 && f; i++) { const mp = f.memoizedProps || {}; if (typeof mp.id === 'string' && /^pzl_/.test(mp.id)) return mp.id; f = f.return; } } catch (e) { } return ''; }
  async function openConv(convId, name) {
    const t0 = Date.now();
    const find = () => listItems().find((el) => itemConvId(el) === convId);
    let el = find();
    const holder = document.querySelector('.rc-virtual-list-holder');
    if (!el && holder) { for (let i = 0; i < 25 && !el; i++) { holder.scrollTop += holder.clientHeight * 0.8; await sleep(250); el = find(); } if (!el) { holder.scrollTop = 0; await sleep(300); el = find(); } }
    if (!el && name) {
      const inp = document.querySelector('.conversation-menu-search-input');
      if (inp) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, name); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); await sleep(1800); el = find() || listItems().find((x) => (x.querySelector('.name-text') || {}).textContent === name); }
    }
    if (!el) { S.err = `Không tìm thấy "${name || convId}" trong danh sách bên trái`; log(S.err, 'warn', false); render(); return false; }
    el.scrollIntoView({ block: 'center' }); el.click();
    for (let k = 0; k < 20; k++) { await sleep(250); const st = reactState(); if (st && st.convId === convId) { log(`Đã mở ${name || convId} (${Math.round((Date.now() - t0) / 100) / 10}s)`, '', false); return true; } }
    S.err = 'Bấm vào khách nhưng Pancake chưa mở hội thoại'; render(); return false;
  }
  async function nextWaiting() {
    S.waitingAt = 0; await refreshWaiting();
    const cur = S.active && S.active.convId;
    const w = S.waiting.find((x) => x.convId !== cur);
    if (!w) { S.err = ''; els.zst && (els.zst.textContent = 'Không còn khách nào đang chờ'); renderNav(); return; }
    await openConv(w.convId, w.name);
  }
  async function prevConv() { const id = S.hist.pop(); if (!id) { S.err = 'Chưa có khách trước đó'; render(); return; } const name = (S.waiting.find((w) => w.convId === id) || {}).name || ''; await openConv(id, name); S.hist.pop(); }

  // ===================== PHẢN HỒI 👍/👎 =====================
  function feedback(good, reason, note) {
    const A = S.active; const sg = curSg(); if (!sg) return;
    hookSend({ action: 'log', rows: [[new Date().toISOString(), cfg.userName, good ? '👍' : '👎', A.page.short + ' ' + A.convId, JSON.stringify({ ly_do: reason || '', ghi_chu: note || '', bot: sg.opts.map((o) => o.text), khach: (A.msgs || []).filter((m) => m.k).slice(-3).map((m) => m.text) })]] });
    if (!good && (reason || note)) addLesson({ type: 'sửa sai', br: A.page.short, nhom: sg.nhom, q: sg.q, bot: (sg.orig || sg.opts.map((o) => o.text)).join(' | '), a: note || '', why: reason || '', conv: A.convId });
    log(good ? 'Đã ghi 👍' : `Đã ghi 👎 (${reason || 'không lý do'}) – bot sẽ học`, 'ok', false); S.fb = null; render();
  }
  async function draftOutreach(f) {
    const A = S.active; if (!A || !A.page) return;
    const extra = `YÊU CẦU ĐẶC BIỆT: Shop CHỦ ĐỘNG nhắn khách vừa đánh giá ${f.sao} sao sản phẩm "${f.sp}" trên ${f.san}${f.lydo ? ' (khách ghi: ' + f.lydo + ')' : ''}. Viết theo mẫu nhân viên: "Dạ chào anh/chị ạ. Dạ em bên Shop ${A.page.brand} ${f.san} ạ. Dạ Shop có thấy mình đánh giá ${f.sao} sao sản phẩm … ạ. Dạ Shop xin lỗi … Dạ không biết sản phẩm mình mua có vấn đề gì để Shop hỗ trợ bảo hành cho mình nhé ạ". Xin lỗi chân thành, hỏi rõ vấn đề, đưa hướng hỗ trợ (đổi, gửi bù, thu hồi hoàn tiền). Ở tin mở đầu này được xưng "em bên Shop" và gọi "mình". KHÔNG nhắc quà, KHÔNG xin sửa đánh giá. reply_1 mở đầu đầy đủ như mẫu; reply_2 ngắn gọn; reply_3 hỏi thẳng vấn đề. Các reply này được dài 3–5 câu.`;
    S.outreach = null; S.tab = 'goi'; render();
    const sg = S.sg[A.convId]; if (sg) sg.lastMsgId = null;
    await suggest(true, extra);
  }

  // ===================== ⑥ APPS SCRIPT =====================
  const HOOK_Q = []; let flushing = false;
  function hookSend(obj) { if (!cfg.hook) return false; HOOK_Q.push(obj); if (HOOK_Q.length > 300) HOOK_Q.splice(0, HOOK_Q.length - 300); flushHook(); return true; }
  async function flushHook() {
    if (flushing || !cfg.hook) return; flushing = true;
    try { while (HOOK_Q.length) { const ok = await postHook(HOOK_Q[0]); if (!ok) { await sleep(rnd(20000, 40000)); continue; } HOOK_Q.shift(); await sleep(rnd(300, 800)); } } finally { flushing = false; }
  }
  async function postHook(obj) {
    try { const r = await fetch(cfg.hook, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(obj) }); const j = await r.json().catch(() => null); return !!(j && j.ok); }
    catch (e) { try { await fetch(cfg.hook, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(obj) }); return true; } catch (x) { return false; } }
  }
  async function hookPing() { if (!cfg.hook) return 'chưa có link'; try { const t = await (await fetch(cfg.hook + (cfg.hook.includes('?') ? '&' : '?') + 'ping=1')).text(); return /TDG-pancake Apps Script/.test(t) ? 'kết nối được ✓' : 'link trả về lạ: ' + t.slice(0, 60); } catch (e) { return 'không kết nối được: ' + e.message; } }

  // ===================== ④ CÀO DỮ LIỆU =====================
  const DB = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('tdg_pancake', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('conv', { keyPath: 'id' }); d.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (store, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
    return { get: (s, k) => tx(s, 'readonly', (o) => o.get(k)), put: (s, v, k) => tx(s, 'readwrite', (o) => (k === undefined ? o.put(v) : o.put(v, k))), each: async (s, cb) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(s, 'readonly'); const c = t.objectStore(s).openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { cb(cur.value); cur.continue(); } }; t.oncomplete = res; t.onerror = () => rej(t.error); }); } };
  })();
  const userBusy = () => { const ta = chatBox(); return (ta && document.activeElement === ta && ta.value.trim()) || S.busy || S.sending; };
  async function scrapeLoop() {
    if (S.scrape.on) return; S.scrape.on = true; log('Bắt đầu cào dữ liệu', '', false);
    while (cfg.scrape) {
      const t0 = Date.now();
      try { await scrapeRound(); await syncRound(); await buildPairs(); S.scrape.stage = 'xong lượt, chờ lượt sau'; S.scrape.last = nowStr(); log(`Xong 1 lượt cào (${Math.round((Date.now() - t0) / 1000)}s): ${S.scrape.done} hội thoại, ${S.scrape.msgs} tin`, 'ok', false); }
      catch (e) { S.scrape.err = e.message; log('Cào lỗi: ' + e.message + ' → thử lại sau', 'err'); }
      renderCfgInfo(); await sleep(rnd(8, 14) * 60000);
    }
    S.scrape.on = false; S.scrape.stage = 'đã tắt'; renderCfgInfo();
  }
  async function scrapeRound() {
    const lim = Date.now() - cfg.scrapeDays * 864e5; const queue = [];
    for (const pid of Object.keys(PAGES)) {
      S.scrape.stage = 'lấy danh sách ' + PAGES[pid].short; renderCfgInfo();
      let cnt = 0; const seen = new Set();
      for (let i = 0; i < 80; i++) {
        const j = await api(`/api/v1/pages/${pid}/conversations?current_count=${cnt}`); const cs = (j && j.conversations) || []; let nw = 0, old = 0;
        for (const c of cs) { if (seen.has(c.id)) continue; seen.add(c.id); nw++; if (new Date(c.updated_at + 'Z').getTime() < lim) { old++; continue; } if (c.id.includes('_g_') || !c.seen) continue; const cu = ((c.customers || [])[0] || {}).id; if (!cu) continue; queue.push({ id: c.id, pid, br: PAGES[pid].short, cu, t: c.updated_at, name: (c.from || {}).name || '' }); }
        cnt += cs.length; if (!nw || old > 5) break; await sleep(rnd(500, 1100));
      }
    }
    S.scrape.total = queue.length; S.scrape.done = 0; S.scrape.msgs = 0;
    for (const q of queue) {
      if (!cfg.scrape) return;
      while (userBusy()) { S.scrape.stage = 'tạm dừng (đang gõ/soạn)'; renderCfgInfo(); await sleep(4000); }
      const old = await DB.get('conv', q.id);
      if (old && old.t === q.t) { S.scrape.done++; S.scrape.msgs += (old.msgs || []).length; continue; }
      S.scrape.stage = `cào ${q.br} ${S.scrape.done + 1}/${queue.length}`; renderCfgInfo();
      try {
        const d = await fetchMsgs(q.pid, q.id, q.cu, old ? 2 : 8);
        const byId = new Map(((old && old.msgs) || []).map((m) => [m.id, m]));
        d.msgs.forEach((m) => { if (!byId.has(m.id)) byId.set(m.id, { id: m.id, t: m.t, k: m.k, text: m.text, att: m.att.map((a) => a.type).join(','), synced: 0 }); });
        const msgs = [...byId.values()].sort((a, b) => (a.t < b.t ? -1 : 1)); const noteHash = hash(d.notes.map((n) => n.msg).join('|'));
        await DB.put('conv', { id: q.id, pid: q.pid, br: q.br, cu: q.cu, name: q.name, t: q.t, msgs, notes: d.notes, noteHash, notesSynced: old && old.noteHash === noteHash ? old.notesSynced : 0 });
        S.scrape.msgs += msgs.length;
      } catch (e) { S.scrape.err = q.id + ': ' + e.message; }
      S.scrape.done++; await sleep(rnd(600, 1400));
    }
  }
  async function syncRound() {
    if (!cfg.hook) { S.scrape.stage = 'chờ link Apps Script'; let n = 0; await DB.each('conv', (c) => { n += (c.msgs || []).filter((m) => !m.synced).length; }); S.scrape.unsynced = n; return; }
    S.scrape.stage = 'đẩy lên Sheet'; renderCfgInfo();
    const convs = []; await DB.each('conv', (c) => convs.push(c));
    let batch = { SMH: [], THHX: [] }, notes = [], refs = [];
    const flush = async () => { for (const br of ['SMH', 'THHX']) { if (!batch[br].length) continue; if (!(await postHook({ action: 'chat', tab: 'PANCAKE – CHAT ' + br, rows: batch[br] }))) throw new Error('Apps Script không nhận dữ liệu'); } if (notes.length && !(await postHook({ action: 'notes', rows: notes }))) throw new Error('Apps Script không nhận ghi chú'); for (const c of refs) await DB.put('conv', c); batch = { SMH: [], THHX: [] }; notes = []; refs = []; await sleep(rnd(800, 1600)); };
    let pending = 0;
    for (const c of convs) {
      const un = (c.msgs || []).filter((m) => !m.synced); const noteNew = c.notes && c.notes.length && c.notesSynced !== c.noteHash;
      if (!un.length && !noteNew) continue;
      un.forEach((m) => { batch[c.br].push([m.id, c.id, c.name, String(m.t).replace('T', ' ').slice(0, 19), m.k ? 'Khách' : 'Shop', m.text, m.att]); m.synced = 1; });
      if (noteNew) { c.notes.forEach((n) => notes.push([n.id || '', c.br, c.id, c.name, n.at ? new Date(n.at).toISOString().slice(0, 19).replace('T', ' ') : '', n.msg])); c.notesSynced = c.noteHash; }
      refs.push(c); pending += un.length; if (batch.SMH.length + batch.THHX.length >= 400) await flush();
    }
    await flush(); S.scrape.unsynced = 0; if (pending) log(`Đã đẩy ${pending} tin lên Sheet`, 'ok', false);
  }

  // ===================== TỰ RÀ SOÁT MỖI ĐÊM =====================
  // Từ 22h: rà soát ngày hôm nay. Trước 22h: nếu hôm qua chưa ai rà soát thì rà soát bù. Apps Script chỉ nhận bản đầu tiên của mỗi ngày (nhiều máy không bị trùng).
  const REV_KEY = 'tdgp_review_v1';
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let reviewing = false;
  async function selfReviewTick(force) {
    if (reviewing || !cfg.hook || (!force && (!cfg.selfReview || userBusy()))) return;
    const now = new Date(); const day = new Date(now.getTime() - (now.getHours() >= 22 ? 0 : 864e5)); const dkey = ymd(day);
    if (!force && localStorage.getItem(REV_KEY) === dkey) return;
    reviewing = true; const t0 = Date.now();
    try {
      const from = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(), to = from + 864e5;
      const rows = [], cnt = {}; let nConv = 0, chot = 0, bh = 0, unans = 0;
      const add = (type, c, detail) => { cnt[type] = (cnt[type] || 0) + 1; if (rows.length < 400) rows.push([dkey, cfg.userName, type, c.br, c.name, String(detail).slice(0, 500), c.id]); };
      await DB.each('conv', (c) => {
        const ms = (c.msgs || []).filter((m) => m.k !== 2); const inDay = ms.filter((m) => { const t = Date.parse(m.t + 'Z'); return t >= from && t < to; });
        if (!inDay.length) return; nConv++;
        const info = extractInfo(ms, c.notes || []);
        if (inDay.some((m) => m.k === 0 && m.text && isOrderBlock(m.text))) chot++;
        if (info.ma) bh++;
        if (info.ten && ADDR_RX.test(info.ten) && info.ten.length > 12) add('Tên khách bị đọc thành địa chỉ', c, info.ten);
        if (info.dc && /\b\d+([.,]\d+)?\s*(kg|hộp|bó|vòng|bịch|túi)\b|gửi bù|thu cod|thu hộ/i.test(info.dc)) add('Địa chỉ lẫn dòng sản phẩm', c, info.dc);
        if (info.viec && info.viec.split('\n').some((x) => CHAT_LINE_RX.test(x))) add('Ô sản phẩm lẫn câu chat', c, info.viec);
        if (isShopAddr(info.dc) || SHOP_PHONES.includes(info.sdt)) add('Lấy nhầm địa chỉ/SĐT của Shop', c, info.dc + ' ' + info.sdt);
        const blk = ms.filter((m) => m.k === 0 && m.text && isOrderBlock(m.text)).pop();
        if (blk) { const d = parseOrderBlock(blk.text) || {}; if (!d.sdt || !d.dc || !d.ten) add('Tin tạo đơn đọc thiếu', c, blk.text.replace(/\n/g, ' / ')); }
        const negM = inDay.find((m) => m.k === 1 && m.text && NEG_RX.test(m.text)); if (negM) add('Khách không hài lòng', c, negM.text);
        const last = ms[ms.length - 1]; const lt = last ? Date.parse(last.t + 'Z') : 0;
        if (last && last.k === 1 && lt >= from && lt < to && Date.now() - lt > 2 * 3600e3 && !isClosing(Object.assign({}, last, { att: [] })) && !notCust[c.id]) { unans++; add('Khách nhắn chưa được trả lời (quá 2 tiếng)', c, last.text || '[' + last.att + ']'); }
      });
      const L = allLessons().filter((l) => { const t = l.ts; return t >= from && t < to; });
      const sum = { hoi_thoai: nConv, chot_don: chot, bao_hanh: bh, chua_tra_loi: unans, loi: cnt, bai_hoc_moi: L.length, cap_chat_cu: PAIRS.length, cap_chot_don: PSTAT.chot };
      rows.unshift([dkey, cfg.userName, 'TÓM TẮT', '', '', JSON.stringify(sum), '']);
      const ok = await postHook({ action: 'review', day: dkey, rows });
      if (ok) { localStorage.setItem(REV_KEY, dkey); log(`Tự rà soát ngày ${dkey} xong (${Math.round((Date.now() - t0) / 1000)}s): ${nConv} hội thoại, ${Object.values(cnt).reduce((a, b) => a + b, 0)} điểm cần xem`, 'ok', { sum }); }
      else log('Tự rà soát: Apps Script chưa nhận – sẽ thử lại sau', 'warn', false);
    } catch (e) { log('Tự rà soát lỗi: ' + e.message, 'err'); }
    finally { reviewing = false; }
  }
  // ===================== KIỂM TRA BẢN MỚI (GitHub) =====================
  const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
  async function checkUpdate() { try { const t = await (await fetch(RAW_URL + '?t=' + Date.now(), { cache: 'no-store' })).text(); const m = t.match(/@version\s+([\d.]+)/); if (m && cmpVer(m[1], VERSION) > 0) { if (S.newVer !== m[1]) log('Có bản mới TDG-pancake ' + m[1] + ' – Tampermonkey sẽ tự cập nhật, hoặc bấm nút ⬆ trên bảng', 'ok', false); S.newVer = m[1]; renderHead(); } } catch (e) { } }

  // ===================== GIAO DIỆN (theo TDG-duoke) =====================
  const css = `
#tdg .upd{margin-left:6px;padding:2px 8px;border-radius:10px;background:#16a34a;color:#fff;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer}
#tdg #tdg-zact{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
#tdg #tdg-zact:empty{display:none}
#tdg #tdg-zact button{flex:1;min-width:120px;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-size:12px;cursor:pointer}
#tdg #tdg-zact button.p{background:#0f766e;color:#fff;border-color:#0f766e}
#tdg textarea.promo{width:100%;min-height:72px;font-size:12px;box-sizing:border-box}
#tdg{--ai:#7c3aed;--ai2:#c4b5fd;--ok:#14b8a6;--okd:#0f766e;--wait:#f97316;--late:#dc2626;--off:#cbd5e1;--att:#fef3c7;
position:fixed;right:14px;bottom:10px;z-index:999998;width:470px;max-width:calc(100vw - 28px);max-height:78vh;display:flex;flex-direction:column;background:#fff;border:2px solid var(--ok);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);font:14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;box-sizing:border-box}
#tdg *{box-sizing:border-box}#tdg button,#tdg input,#tdg select,#tdg textarea{font-family:inherit}
#tdg.min{width:auto;min-width:300px}
#tdg.s-wait{animation:tdgW 1s ease-in-out infinite}#tdg.s-late{animation:tdgL .5s ease-in-out infinite}#tdg.s-ai{animation:tdgA .5s ease-in-out infinite}
@keyframes tdgW{50%{border-color:var(--wait);box-shadow:0 0 0 5px #fdba74,0 10px 30px rgba(0,0,0,.18)}}
@keyframes tdgL{50%{border-color:var(--late);box-shadow:0 0 0 6px #fca5a5,0 10px 30px rgba(0,0,0,.18)}}
@keyframes tdgA{50%{border-color:var(--ai);box-shadow:0 0 0 5px var(--ai2),0 10px 30px rgba(0,0,0,.18)}}
#tdg.still{animation:none !important}
#tdg .hd{display:flex;align-items:center;gap:6px;padding:6px 7px 6px 12px;background:var(--okd);color:#fff;border-radius:11px 11px 0 0;cursor:default;user-select:none;flex:0 0 auto}
#tdg.min .hd{border-radius:11px;cursor:pointer;padding:9px 8px 9px 14px}
#tdg .hd b{font-size:14px;flex:1;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
#tdg .hd .br{font-size:11.5px;font-weight:700;background:rgba(255,255,255,.2);padding:2px 8px;border-radius:999px}
#tdg .wb{display:none;font-size:12.5px;font-weight:800;background:var(--wait);color:#fff;padding:3px 10px;border-radius:999px;white-space:nowrap;cursor:pointer}
#tdg .wb.on{display:inline-block}#tdg .wb.red{background:var(--late)}
#tdg .aib{display:none;font-size:12px;font-weight:800;background:var(--ai);color:#fff;padding:3px 9px;border-radius:999px}#tdg.min .aib.on{display:inline-block}
#tdg .mn{height:34px;padding:0 10px;border-radius:8px;background:rgba(255,255,255,.2);font-size:14px;font-weight:800;cursor:pointer;border:0;color:#fff;white-space:nowrap}
#tdg .tabs{display:flex;border-bottom:1px solid #e2e8f0;flex:0 0 auto}#tdg.min .tabs{display:none}
#tdg .tab{flex:1;text-align:center;padding:7px;font-weight:700;color:#64748b;cursor:pointer;font-size:13px}
#tdg .tab.on{color:var(--okd);border-bottom:3px solid var(--okd)}
#tdg .bd{padding:6px 10px 8px;overflow:auto;flex:1 1 auto}#tdg.min .bd{display:none}
#tdg .ctx{display:flex;flex-wrap:wrap;gap:5px}
#tdg .chip{border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:2px 9px;font-size:12px;color:#334155;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
#tdg .chip b{color:#0f172a}#tdg .chip.bad{border-color:var(--late);color:var(--late);font-weight:700}
#tdg .chip.att{background:var(--att);border-color:#f59e0b;color:#92400e}
#tdg .chip.ok{background:#ccfbf1;border-color:var(--ok);color:#115e59}
#tdg .more{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin:3px 2px 6px}
#tdg .more a{color:var(--okd);cursor:pointer;text-decoration:none;font-weight:600}
#tdg .det{display:none;border:1px solid #e2e8f0;border-radius:10px;padding:6px 9px;font-size:12px;color:#475569;margin-bottom:6px;line-height:1.6}
#tdg .det.show{display:block}#tdg .det b{color:#0f172a}
#tdg .det a.w{display:inline-block;background:#fff7ed;border:1px solid #fdba74;border-radius:999px;padding:0 8px;margin:1px 3px 1px 0;cursor:pointer;color:#7c2d12}
#tdg .nav{display:flex;gap:6px}
#tdg .nav button{border:1px solid #cbd5e1;background:#f8fafc;border-radius:10px;padding:8px 10px;font-weight:700;font-size:13px;cursor:pointer;color:#1f2937}
#tdg .nav .nx{flex:1;background:#ea580c;border-color:#ea580c;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:8px}
#tdg .nav .nx small{font-weight:600;opacity:.92;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tdg .nav .nx.none{background:#f0fdf4;border-color:#86efac;color:#166534}
#tdg .zone{margin:7px 0 6px;border-radius:12px;padding:6px;border:2.5px solid var(--ok)}
#tdg .zone.ai{border-color:var(--ai);animation:tdgZ .5s ease-in-out infinite}@keyframes tdgZ{50%{box-shadow:0 0 0 4px var(--ai2)}}
#tdg .zone.idle{border-color:#e2e8f0}
#tdg .zst{display:flex;align-items:center;gap:8px;border-radius:8px;padding:6px 10px;font-weight:800;font-size:13px;background:#f1f5f9;color:#475569}
#tdg .zst.ai{background:#ede9fe;color:#5b21b6;font-size:14.5px}#tdg .zst.ai .sec{margin-left:auto;font-size:22px;font-weight:900}
#tdg .zst.ai .dt{width:10px;height:10px;border-radius:50%;background:var(--ai);box-shadow:0 0 0 4px var(--ai2);animation:tdgD .5s infinite}@keyframes tdgD{50%{opacity:.25}}
#tdg .zst.ok{background:#ccfbf1;color:#115e59}#tdg .zst.sent{background:#e2e8f0;color:#334155}#tdg .zst.err{background:#fee2e2;color:#991b1b}
#tdg .zst .h{margin-left:auto;font-weight:600;font-size:11.5px;opacity:.85;text-align:right}
#tdg .o{display:flex;gap:6px;margin-top:6px;align-items:stretch;border:1.5px solid #e2e8f0;border-radius:10px;padding:5px;cursor:pointer;background:#fff}
#tdg .o.cur{border-color:var(--okd);border-width:2.5px;background:#f0fdfa}#tdg .o.dim{opacity:.45}#tdg .o.dim:hover{opacity:.85}#tdg .o.sent{background:#f8fafc}
#tdg .o .k{width:32px;flex:0 0 32px;border-radius:8px;background:var(--okd);color:#fff;font-weight:800;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:15px;line-height:1.05;border:0;cursor:pointer}
#tdg .o .k small{font-size:9px;font-weight:600;opacity:.8}
#tdg .o .t{flex:1;min-width:0;display:flex;flex-direction:column}
#tdg .o .tg{font-size:11px;color:#64748b;font-weight:600;display:flex;gap:6px;align-items:center}
#tdg .o .tg .inb{margin-left:auto;color:var(--okd);font-weight:800;display:none}#tdg .o.cur .tg .inb{display:inline}
#tdg .o textarea{border:0;outline:0;resize:none;background:transparent;font-size:14px;line-height:1.4;color:#1f2937;padding:1px 0;min-height:38px;overflow:hidden;cursor:text}
#tdg .o .s{width:60px;flex:0 0 60px;border:0;border-radius:8px;background:var(--okd);color:#fff;font-weight:800;font-size:13.5px;cursor:pointer}
#tdg .o .s:disabled{background:var(--off);color:#64748b;cursor:not-allowed}
#tdg .o.sk{cursor:default}#tdg .o.sk .k{background:var(--off)}
#tdg .o.sk .t{height:44px;border-radius:8px;background:linear-gradient(90deg,#f8fafc,#ede9fe,#f8fafc);background-size:200% 100%;animation:tdgS 1.2s linear infinite}@keyframes tdgS{to{background-position:-200% 0}}
#tdg .o textarea.flash{animation:tdgF 1.6s ease-out 1}@keyframes tdgF{0%{background:#ccfbf1}100%{background:transparent}}
#tdg .flag{background:var(--att);border:1px solid #f59e0b;color:#92400e;border-radius:10px;padding:5px 9px;font-size:12.5px;margin:0 0 6px}
#tdg .flag.red{background:#fee2e2;border-color:#dc2626;color:#991b1b;font-weight:700}
#tdg .ft{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}
#tdg .ft .i{border:1px solid #e2e8f0;border-radius:8px;padding:4px 8px;font-size:12px;color:#475569;background:#fff;cursor:pointer}
#tdg .ft .i:hover{background:#f1f5f9}#tdg .ft .i.on{background:#ecfeff;border-color:var(--okd)}
#tdg .ft .sp{flex:1}#tdg .ft .hint{font-size:10.5px;color:#94a3b8;text-align:right;line-height:1.3}
#tdg .err{color:#b91c1c;font-size:12px;margin-top:4px;word-break:break-word;font-weight:600}
#tdg .fbx{margin:6px 0;border:1.5px solid #be123c;border-radius:12px;padding:9px 11px;background:#fff7f8}
#tdg .fbx h4{margin:0 0 7px;color:#9f1239;font-size:13.5px;display:flex;justify-content:space-between}
#tdg .opt{display:inline-block;border:1px solid #cbd5e1;border-radius:999px;padding:4px 11px;margin:0 5px 6px 0;font-size:12.5px;background:#fff;cursor:pointer}
#tdg .opt.on{background:var(--okd);color:#fff;border-color:var(--okd)}
#tdg .fbx select,#tdg .fbx input[type=text],#tdg .fbx textarea{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;font-size:13px;margin:2px 0 8px;background:#fff}
#tdg .row{display:flex;gap:8px;margin-top:8px;align-items:center}
#tdg .b{flex:1;border:1px solid #cbd5e1;background:#f8fafc;border-radius:10px;padding:9px 8px;font-size:13.5px;font-weight:700;text-align:center;cursor:pointer;color:#1f2937;white-space:nowrap}
#tdg .b.p{background:var(--okd);color:#fff;border-color:var(--okd)}
#tdg .redo{display:block;width:100%;margin:6px 0 0;border:0;border-radius:10px;background:#7c3aed;color:#fff;font-weight:800;font-size:15px;padding:10px 8px;cursor:pointer;box-shadow:0 2px 6px rgba(124,58,237,.35)}
#tdg .redo:hover{background:#6d28d9}#tdg .redo:disabled{background:#c4b5fd;cursor:default;box-shadow:none}
#tdg .cfg{display:none;position:fixed;right:14px;bottom:10px;z-index:999999;width:440px;max-width:calc(100vw - 28px);max-height:88vh;background:#fff;border:2px solid var(--okd);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.28);flex-direction:column;overflow:hidden}
#tdg .cfg.show{display:flex}
#tdg .cfg .ch2{display:flex;align-items:center;gap:8px;padding:9px 10px 9px 14px;background:var(--okd);color:#fff;font-weight:800;font-size:14px}
#tdg .cfg .ch2 span{flex:1}#tdg .cfg .ch2 .x{border:0;background:rgba(255,255,255,.2);color:#fff;border-radius:8px;width:32px;height:30px;font-size:17px;font-weight:800;cursor:pointer}
#tdg .cfg .cb2{padding:9px 12px;overflow:auto;flex:1 1 auto;background:#f8fafc}
#tdg .cfg .cf2{padding:8px 12px;border-top:1px solid #e2e8f0;background:#fff;flex:0 0 auto}
#tdg .cfg .dirty{display:none;color:#b45309;font-size:12.5px;font-weight:700;margin-bottom:6px}#tdg .cfg.isdirty .dirty{display:block}
#tdg .cfg label{font-size:12px;color:#475569;display:block}
#tdg .cfg input{width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:5px 6px;font-size:12.5px;margin:2px 0 6px}
#tdg .cfg label.ck{display:flex;gap:6px;align-items:center;margin-bottom:5px}#tdg .cfg label.ck input{width:auto;margin:0}
#tdg .cfg .kb{font-size:11.5px;color:#64748b;margin-top:6px;line-height:1.5}
#tdg .cfg .sc{font-size:12px;color:#1f2937;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;margin-top:6px;line-height:1.5}
#tdg .cfg .foot{font-size:11px;color:#94a3b8;margin-top:4px}
#tdg .lg{margin-top:6px;background:#0f172a;color:#cbd5e1;border-radius:8px;padding:4px 8px;font-size:10px;line-height:1.5;max-height:140px;overflow:auto}
#tdg .lg div{border-bottom:1px dashed #1e293b}#tdg .lg .err{color:#fca5a5;font-size:10px;margin:0;font-weight:400}#tdg .lg .ok{color:#86efac}#tdg .lg .warn{color:#fcd34d}
#tdg .rz{position:absolute;left:-5px;top:0;bottom:0;width:10px;cursor:ew-resize;z-index:3}
#tdg .rz:hover,#tdg .rz.on{background:linear-gradient(90deg,transparent 2px,var(--ok) 2px,var(--ok) 6px,transparent 6px)}#tdg.min .rz{display:none}
#tdg ul.chk{list-style:none;padding:0;margin:4px 0 6px}#tdg ul.chk li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dashed #e2e8f0;font-size:12.5px}
#tdg ul.chk li span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tdg .okk{color:#15803d;font-weight:700}#tdg .no{color:#b91c1c;font-weight:700}#tdg .mini{font-size:11px;color:#64748b}
#tdg textarea.don{width:100%;min-height:150px;border:1.5px solid #cbd5e1;border-radius:10px;padding:7px 9px;font-size:13.5px;line-height:1.45;background:#fffdf7}
.tdg-flashbox{animation:tdgBox 1.2s ease-out 1 !important}@keyframes tdgBox{0%{background:#ccfbf1 !important;box-shadow:0 0 0 3px #14b8a6 inset}100%{background:transparent;box-shadow:none}}
`;
  let panel, els = {};
  function buildUi() {
    const st = document.createElement('style'); st.id = 'tdgp-style'; st.textContent = css; document.head.appendChild(st);
    panel = document.createElement('div'); panel.id = 'tdg'; if (cfg.minimized) panel.classList.add('min');
    const PW_MIN = 360, pwMax = () => Math.min(980, window.innerWidth - 28);
    panel.innerHTML = `<div class="rz" id="tdg-rz" title="Kéo để co giãn"></div>
      <div class="hd"><b>${TITLE}</b><span class="br" id="tdg-br" style="display:none"></span><span class="aib" id="tdg-aib">AI…</span><a class="upd" id="tdg-upd" style="display:none" target="_blank" title="Cài bản mới ngay"></a><span class="wb" id="tdg-wb" title="Mở khách chờ tiếp theo (Alt+W)"></span><button class="mn" id="tdg-min">▾ Thu gọn</button></div>
      <div class="tabs"><div class="tab on" id="tdg-tab-goi">💬 Gợi ý</div><div class="tab" id="tdg-tab-don">📦 Đơn &amp; Bảo hành</div></div>
      <div class="bd">
        <div class="ctx" id="tdg-ctx"></div>
        <div class="more"><span id="tdg-morel">bot đọc hội thoại + ghi chú, không gửi gì khi chưa bấm</span><a id="tdg-detbtn">chi tiết ▾</a></div>
        <div class="det" id="tdg-det"></div>
        <div class="nav"><button id="tdg-prev" title="Quay lại khách vừa xem (Alt+Q)">◂ Trước</button><button class="nx" id="tdg-next" title="Mở khách đang chờ tiếp theo (Alt+W)"></button></div>
        <div id="tdg-pane-goi">
          <div class="zone idle" id="tdg-zone"><div class="zst" id="tdg-zst"></div><button class="redo" id="tdg-redo" title="Bot soạn lại 3 câu khác (Alt+R)">↻ Soạn lại 3 câu khác</button><div id="tdg-lines"></div><div id="tdg-zact"></div></div>
          <div id="tdg-flag"></div>
          <div id="tdg-fb"></div>
          <div class="ft"><button class="i" id="tdg-up" title="Bot soạn tốt">👍 Tốt</button><button class="i" id="tdg-down" title="Báo câu trả lời sai">👎 Sai</button><button class="i" id="tdg-outreach" title="Soạn tin Shop chủ động nhắn khách đánh giá xấu trên sàn">✉ Khách đánh giá xấu</button><span class="sp"></span><span class="hint">Alt+1/2/3 điền · Enter gửi · Alt+R · Alt+W/Q · Alt+K</span><button class="i" id="tdg-cfgbtn" title="Cấu hình (Alt+K)">⚙</button></div>
        </div>
        <div id="tdg-pane-don" style="display:none">
          <ul class="chk" id="tdg-chk"></ul>
          <textarea class="don" id="tdg-don"></textarea>
          <div class="row" style="margin-top:6px"><button class="b p" id="tdg-copy">📋 Chép (gửi Lark)</button><button class="b" id="tdg-note">📝 Ghi ô Thông tin</button></div>
          <div class="mini" id="tdg-donnotes" style="margin-top:6px"></div>
          <div class="ft"><span class="sp"></span><span class="hint" id="tdg-autonote"></span><button class="i" id="tdg-cfgbtn2" title="Cấu hình (Alt+K)">⚙</button></div>
        </div>
        <div class="err" id="tdg-err"></div>
      </div>
      <div class="cfg" id="tdg-cfg">
        <div class="ch2"><span>⚙ Cấu hình ${TITLE}</span><button class="x" id="tdg-cfgx">✕</button></div>
        <div class="cb2">
          <label class="ck"><input type="checkbox" id="c-auto"> Tự soạn khi khách nhắn</label>
          <label class="ck"><input type="checkbox" id="c-fill"> Tự điền phương án 1 vào ô chat</label>
          <label class="ck"><input type="checkbox" id="c-note"> Tự ghi ô Thông tin khi đủ thông tin đơn (1 ghi chú/khách, có thay đổi thì sửa)</label>
          <label class="ck"><input type="checkbox" id="c-img"> Đọc ảnh khách gửi</label>
          <label class="ck"><input type="checkbox" id="c-blink"> Panel nhấp nháy theo trạng thái</label>
          <label class="ck"><input type="checkbox" id="c-scrape"> Cào hội thoại chạy ngầm (${cfg.scrapeDays} ngày gần nhất)</label>
          <label class="ck"><input type="checkbox" id="c-learn"> Tự học từ nhân viên (câu tự gõ, câu sửa, 👎, sửa tin đơn)</label>
          <label class="ck"><input type="checkbox" id="c-review"> Tự rà soát mỗi đêm + gửi báo cáo</label>
          <label>Khuyến mãi đang chạy – Zalo Sơn Mộc Hương (mỗi dòng 1 mốc)</label><textarea class="promo" id="c-promo-smh"></textarea>
          <label>Khuyến mãi đang chạy – Zalo Trầm Hương Hà Xá (để trống nếu không có)</label><textarea class="promo" id="c-promo-thhx"></textarea>
          <div class="kb" id="c-learninfo"></div>
          <div class="row" style="margin-top:4px"><button class="b" data-act="relearn">⟳ Tải lại bài học</button><button class="b" data-act="reviewnow">🔍 Rà soát ngay</button></div>
          <div class="kb">Người dùng: <b id="c-user">${esc(cfg.userName || '(đang lấy từ tài khoản Pancake…)')}</b></div>
          <label>API key Gemini</label><input type="password" id="c-key" placeholder="dán key vào đây">
          <label>Model</label><input id="c-model">
          <label>Link Sheet bộ não (đã xuất bản)</label><input id="c-sheet">
          <label>Link Apps Script Pancake</label><input id="c-hook" placeholder="https://script.google.com/macros/s/…/exec">
          <label>Khách chờ quá (phút) thì panel nháy đỏ</label><input id="c-wait" type="number" min="1">
          <div class="kb" id="c-kb"></div>
          <div class="sc" id="c-sc"></div>
          <div class="row" style="margin-top:6px"><button class="b" id="c-ping">Thử Apps Script</button><button class="b" id="c-scrapenow">Cào ngay</button></div>
          <div class="foot" id="c-foot"></div>
          <div class="lg" id="tdg-log"></div>
        </div>
        <div class="cf2"><div class="dirty">● Bạn vừa thay đổi – nhớ bấm Lưu cấu hình</div><div class="row" style="margin-top:0"><button class="b p" id="c-save">✓ Lưu cấu hình</button><button class="b" id="c-reload">⟳ Tải lại kho</button></div></div>
      </div>`;
    document.body.appendChild(panel);
    const $ = (id) => panel.querySelector('#' + id);
    els = { upd: $('tdg-upd'), zact: $('tdg-zact'), br: $('tdg-br'), aib: $('tdg-aib'), wb: $('tdg-wb'), min: $('tdg-min'), tabGoi: $('tdg-tab-goi'), tabDon: $('tdg-tab-don'), ctx: $('tdg-ctx'), det: $('tdg-det'), detbtn: $('tdg-detbtn'), prev: $('tdg-prev'), next: $('tdg-next'), paneGoi: $('tdg-pane-goi'), paneDon: $('tdg-pane-don'), zone: $('tdg-zone'), zst: $('tdg-zst'), redo: $('tdg-redo'), lines: $('tdg-lines'), flag: $('tdg-flag'), fb: $('tdg-fb'), up: $('tdg-up'), down: $('tdg-down'), outreach: $('tdg-outreach'), chk: $('tdg-chk'), don: $('tdg-don'), copy: $('tdg-copy'), note: $('tdg-note'), donnotes: $('tdg-donnotes'), autonote: $('tdg-autonote'), err: $('tdg-err'), cfg: $('tdg-cfg'), log: $('tdg-log'), opt: [] };
    const applyW = () => { panel.style.width = panel.classList.contains('min') ? '' : Math.max(PW_MIN, Math.min(pwMax(), Number(cfg.panelW) || 470)) + 'px'; };
    applyW(); window.addEventListener('resize', applyW);
    const toggleMin = () => { panel.classList.toggle('min'); cfg.minimized = panel.classList.contains('min'); els.min.textContent = cfg.minimized ? '▴ Mở rộng' : '▾ Thu gọn'; applyW(); saveCfg(); render(); };
    els.min.textContent = cfg.minimized ? '▴ Mở rộng' : '▾ Thu gọn';
    els.min.onclick = (e) => { e.stopPropagation(); toggleMin(); };
    els.wb.onclick = (e) => { e.stopPropagation(); nextWaiting(); };
    panel.querySelector('.hd').addEventListener('click', (e) => { if (panel.classList.contains('min') && e.target !== els.min && e.target !== els.wb) toggleMin(); });
    const rz = $('tdg-rz'); let rs = null;
    rz.addEventListener('mousedown', (e) => { rs = { x: e.clientX, w: panel.getBoundingClientRect().width }; rz.classList.add('on'); document.body.style.userSelect = 'none'; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (!rs) return; panel.style.width = Math.max(PW_MIN, Math.min(pwMax(), rs.w + (rs.x - e.clientX))) + 'px'; });
    window.addEventListener('mouseup', () => { if (!rs) return; rs = null; rz.classList.remove('on'); document.body.style.userSelect = ''; cfg.panelW = Math.round(panel.getBoundingClientRect().width); saveCfg(); });
    els.tabGoi.onclick = () => { S.tab = 'goi'; if (S.active) S.tabManual[S.active.convId] = true; render(); };
    els.tabDon.onclick = () => { S.tab = 'don'; if (S.active) S.tabManual[S.active.convId] = true; render(); };
    els.detbtn.onclick = () => { els.det.classList.toggle('show'); els.detbtn.textContent = els.det.classList.contains('show') ? 'thu gọn ▴' : 'chi tiết ▾'; renderDet(); };
    els.prev.onclick = prevConv; els.next.onclick = nextWaiting;
    els.redo.onclick = () => { if (S.active && S.active.page) resuggest(); else { S.err = 'Chưa mở hội thoại Zalo nào'; render(); } };
    els.up.onclick = () => feedback(true);
    els.down.onclick = () => { S.fb = S.fb ? null : { reasons: [], note: '' }; render(); };
    els.outreach.onclick = () => { S.outreach = S.outreach ? null : { san: 'Shopee', sao: '1', sp: '', lydo: '' }; render(); };
    els.copy.onclick = async () => { const t = els.don.value; learnDon(S.active, t); try { await navigator.clipboard.writeText(t); } catch (e) { els.don.select(); document.execCommand('copy'); } els.copy.textContent = '✓ Đã chép'; log('Đã chép tin tạo đơn', 'ok', false); setTimeout(() => { els.copy.textContent = '📋 Chép (gửi Lark)'; }, 1500); };
    els.note.onclick = async () => {
      const A = S.active; const b = els.note; if (!A || !A.page) return; if (b.dataset.busy) return;
      const t = els.don.value.trim(); if (!t) { b.textContent = '⚠ Tin đơn đang trống'; setTimeout(render, 2500); return; }
      if (/⚠ THIẾU/.test(t) && !confirm('Tin còn ô thiếu (⚠). Vẫn ghi vào ô Thông tin?')) return;
      b.dataset.busy = '1'; b.disabled = true; b.textContent = '⏳ Đang kiểm tra ghi chú…'; learnDon(A, t);
      let res = '';
      try {
        try { const d = await fetchMsgs(A.pid, A.convId, A.custId, 1); A.notes = d.notes; } catch (e) {}
        const cur = orderNoteOf(A);
        if ((A.notes || []).some((n) => norm(n.msg) === norm(t))) { res = '✅ Đã có sẵn – không ghi thêm'; log('Ghi chú đơn này đã có sẵn – không ghi thêm', 'ok', { conv: A.convId }); }
        else if (cur) { b.textContent = '⏳ Đang sửa ghi chú cũ…'; const ok = await editNote(A, cur, t); if (ok) { res = '✅ Đã sửa ghi chú'; log('Đã sửa ghi chú đơn', 'ok', { conv: A.convId, text: t }); } else { res = '⚠ Không sửa được'; log('Không sửa được ghi chú đơn – không tạo thêm', 'warn', { conv: A.convId }); alert('Không sửa được ghi chú đơn trên Pancake. Bạn bấm bút chì ✏ ở ghi chú trong ô Thông tin để sửa tay nhé.'); } }
        else { b.textContent = '⏳ Đang ghi…'; const ok = await postNote(A, t); res = ok ? '✅ Đã ghi ô Thông tin' : '⚠ Không ghi được – xem nhật ký'; }
        if (/^✅/.test(res)) { const m = noteMem[A.convId] || { order: '', at: 0 }; m.order = hash(norm(t)); m.at = Date.now(); noteMem[A.convId] = m; saveNoteMem(); }
      } catch (e) { res = '⚠ Lỗi: ' + e.message; log('Ghi ô Thông tin lỗi: ' + e.message, 'err'); }
      b.textContent = res; setTimeout(() => { delete b.dataset.busy; b.disabled = false; render(); }, 2500);
    };
    els.don.oninput = () => { if (S.active) S.donEdit[S.active.convId] = els.don.value; };
    // cấu hình
    const C = (id) => $(id);
    const fillCfg = () => { C('c-auto').checked = !!cfg.autoSuggest; C('c-fill').checked = !!cfg.autoFill; C('c-note').checked = !!cfg.autoNote; C('c-img').checked = !!cfg.readImages; C('c-blink').checked = !!cfg.blink; C('c-scrape').checked = !!cfg.scrape; C('c-learn').checked = !!cfg.learn; C('c-review').checked = !!cfg.selfReview; C('c-promo-smh').value = cfg.promoSMH || ''; C('c-promo-thhx').value = cfg.promoTHHX || ''; C('c-key').value = cfg.geminiKey; C('c-model').value = cfg.model; C('c-sheet').value = cfg.sheetPub; C('c-hook').value = cfg.hook; C('c-wait').value = cfg.waitMin; C('c-user').textContent = cfg.userName || '(đang lấy từ tài khoản Pancake…)'; els.cfg.classList.remove('isdirty'); renderCfgInfo(); };
    const cfgShow = (on) => { els.cfg.classList.toggle('show', on); if (on) fillCfg(); };
    const applyCfg = () => { const wasScrape = cfg.scrape; cfg.autoSuggest = C('c-auto').checked; cfg.autoFill = C('c-fill').checked; cfg.autoNote = C('c-note').checked; cfg.readImages = C('c-img').checked; cfg.blink = C('c-blink').checked; cfg.scrape = C('c-scrape').checked; cfg.learn = C('c-learn').checked; cfg.selfReview = C('c-review').checked; cfg.promoSMH = C('c-promo-smh').value.trim(); cfg.promoTHHX = C('c-promo-thhx').value.trim(); cfg.geminiKey = C('c-key').value.trim(); cfg.model = C('c-model').value.trim() || DEFAULTS.model; cfg.sheetPub = C('c-sheet').value.trim() || DEFAULTS.sheetPub; cfg.hook = C('c-hook').value.trim(); cfg.waitMin = Number(C('c-wait').value) || DEFAULTS.waitMin; saveCfg(); els.cfg.classList.remove('isdirty'); log('Đã lưu cấu hình', 'ok', false); if (cfg.scrape && !wasScrape) scrapeLoop(); if (cfg.hook) flushHook(); if (!S.kb) loadKB(true); render(); };
    panel.querySelector('.cb2').addEventListener('input', () => els.cfg.classList.add('isdirty')); panel.querySelector('.cb2').addEventListener('change', () => els.cfg.classList.add('isdirty'));
    C('tdg-cfgx').onclick = () => { if (els.cfg.classList.contains('isdirty') && !confirm('Có thay đổi chưa lưu. Đóng và bỏ thay đổi?')) return; cfgShow(false); };
    C('c-save').onclick = () => { applyCfg(); cfgShow(false); };
    C('c-reload').onclick = () => loadKB(true);
    C('c-ping').onclick = async () => { cfg.hook = C('c-hook').value.trim(); C('c-ping').textContent = '⏳'; const r = await hookPing(); C('c-ping').textContent = 'Thử Apps Script'; C('c-sc').textContent = 'Apps Script: ' + r; };
    C('c-scrapenow').onclick = () => { if (!S.scrape.on) { cfg.scrape = true; saveCfg(); scrapeLoop(); } else C('c-sc').textContent = 'Đang cào rồi · ' + S.scrape.stage; };
    S.toggleCfg = () => cfgShow(!els.cfg.classList.contains('show'));
    $('tdg-cfgbtn').onclick = S.toggleCfg; $('tdg-cfgbtn2').onclick = S.toggleCfg;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keydown', (e) => { const t = e.target; if (t && /TEXTAREA|INPUT/.test(t.tagName) && !t.closest('#tdg')) S.typingAt = Date.now(); }, true);
    panel.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]'); if (!t) return;
      const act = t.dataset.act, val = t.dataset.val;
      if (act === 'pickopt') pickOpt(Number(val), true);
      else if (act === 'sendopt') sendOpt(Number(val));
      else if (act === 'wait') { const w = S.waiting.find((x) => x.convId === val); if (w) openConv(w.convId, w.name); }
      else if (act === 'reason' && S.fb) { const r = S.fb.reasons; const i = r.indexOf(val); if (i >= 0) r.splice(i, 1); else r.push(val); renderFb(true); }
      else if (act === 'fbsend' && S.fb) feedback(false, S.fb.reasons.join(', '), (els.fb.querySelector('#tdg-fbn') || {}).value);
      else if (act === 'fbclose') { S.fb = null; render(); }
      else if (act === 'orgo' && S.outreach) { const o = S.outreach; o.san = els.fb.querySelector('#tdg-osan').value; o.sao = els.fb.querySelector('#tdg-osao').value; o.sp = els.fb.querySelector('#tdg-osp').value.trim(); o.lydo = els.fb.querySelector('#tdg-oly').value.trim(); if (!o.sp) { alert('Nhập tên sản phẩm khách đánh giá'); return; } draftOutreach(o); }
      else if (act === 'orclose') { S.outreach = null; render(); }
      else if (act === 'notcust') { if (confirm('Đánh dấu "' + ((S.active || {}).name || '') + '" KHÔNG phải khách mua? Bot sẽ không soạn cho người này trên mọi máy.')) markNotCust(true); }
      else if (act === 'iscust') markNotCust(false);
      else if (act === 'forcedraft') { if (S.active) { S.force[S.active.convId] = true; resuggest(); } }
      else if (act === 'proactive') resuggest();
      else if (act === 'relearn') { loadLessons(true).then(() => { renderCfgInfo(); }); }
      else if (act === 'reviewnow') { localStorage.removeItem(REV_KEY); selfReviewTick(true); }
    });
    render();
  }
  function onKey(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const c = e.code || ''; const map = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
    if (map[c] !== undefined) { e.preventDefault(); e.stopPropagation(); if (!aiBusyHere()) pickOpt(map[c], true); }
    else if (c === 'KeyR') { e.preventDefault(); els.redo.onclick(); }
    else if (c === 'KeyW') { e.preventDefault(); e.stopPropagation(); nextWaiting(); }
    else if (c === 'KeyQ') { e.preventDefault(); e.stopPropagation(); prevConv(); }
    else if (c === 'KeyK') { e.preventDefault(); e.stopPropagation(); S.toggleCfg(); }
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(38, ta.scrollHeight + 2) + 'px'; }

  function render() { if (!panel) return; renderHead(); renderCtx(); renderDet(); renderNav(); renderTabs(); renderZone(); renderFlag(); renderFb(); renderDon(); els.err.textContent = S.err ? '⚠ ' + S.err : ''; }
  function renderHead() {
    const A = S.active; const page = A && A.page;
    els.br.style.display = page ? '' : 'none'; els.br.textContent = page ? 'Zalo ' + page.short : '';
    if (els.upd) { els.upd.style.display = S.newVer ? '' : 'none'; els.upd.textContent = '⬆ Bản ' + S.newVer; els.upd.href = RAW_URL; }
    const n = S.waiting.length; const late = S.waiting.some((w) => w.min >= cfg.waitMin);
    els.wb.className = 'wb' + (n ? ' on' : '') + (late ? ' red' : ''); els.wb.textContent = n ? `⏳ ${n} khách chờ` : '';
    els.aib.className = 'aib' + (S.busy ? ' on' : '');
    const typing = Date.now() - S.typingAt < 30000;
    panel.className = (cfg.minimized ? 'min ' : '') + (cfg.blink && !typing ? (aiBusyHere() ? 's-ai' : late ? 's-late' : n ? 's-wait' : '') : (aiBusyHere() ? 's-ai still' : late ? 's-late still' : n ? 's-wait still' : ''));
    if (!cfg.minimized) panel.classList.remove('min');
  }
  function renderCtx() {
    const A = S.active; const sg = curSg();
    if (!A) { els.ctx.innerHTML = '<span class="chip">Chưa mở hội thoại nào</span>'; return; }
    if (!A.page) { els.ctx.innerHTML = `<span class="chip bad">Hội thoại này không thuộc 2 Zalo (${/^\d+$/.test(A.pid) ? 'Facebook' : 'kênh khác'}) → bot bỏ qua</span>`; return; }
    const nick = domNick(); const okNick = !nick || !A.name || similarity(nick, A.name) >= 0.6;
    const info = A.info || {};
    const chip = (html, cls, title) => `<span class="chip${cls ? ' ' + cls : ''}" title="${esc(title || '')}">${html}</span>`;
    const pendN = (A.msgs || []).length ? (() => { let i = A.msgs.length; while (i > 0 && A.msgs[i - 1].k) i--; return A.msgs.length - i; })() : 0;
    const pendAtt = pendN ? A.msgs.slice(-pendN).flatMap((m) => m.att.map((a) => a.type)) : [];
    els.ctx.innerHTML = [
      chip(`<b>${esc(A.name || '…')}</b> ${okNick ? '✓' : '✗ khung chat là ' + esc(nick)}`, okNick ? '' : 'bad'),
      chip(esc(A.page.short) + ' · Zalo', '', A.page.brand),
      sg && sg.tinh ? chip(esc(sg.tinh.slice(0, 48)), '', sg.tinh) : '',
      chip('gọi: ' + esc((sg && sg.pron) || 'bạn')),
      info.ma ? chip('mã đơn ' + esc(info.ma), 'ok') : '',
      info.track && !info.ma ? chip('⚠ mã vận đơn ' + esc(info.track) + ' – cần mã đơn hàng', 'bad') : '',
      (A.notes || []).length ? chip('📝 ' + A.notes.length + ' ghi chú', '', A.notes.map((n) => n.msg).join('\n---\n')) : '',
      S.kb && !S.kb.hasPancake ? chip('kiến thức tạm', 'att', 'Chưa có bộ não Pancake – đang dùng kho sàn + quy tắc Zalo') : '',
      pendAtt.length ? chip('📎 Khách gửi: ' + esc(pendAtt.join(', ')), 'att') : '',
      sg && sg.handoff ? chip('nên chuyển người', 'bad', sg.lydo) : '',
    ].filter(Boolean).join('');
  }
  function renderDet() {
    if (!els.det.classList.contains('show')) return;
    const A = S.active; const sg = curSg(); const info = (A && A.info) || {};
    els.det.innerHTML = [
      A && A.page ? `<div><b>Đã trích:</b> ${['ten', 'sdt', 'dc', 'viec'].map((k) => info[k] ? '✓' : '✗').join(' ')} tên/SĐT/địa chỉ/sản phẩm${info.from && info.from.length ? ' · từ ' + esc([...new Set(info.from)].join(', ')) : ''}</div>` : '',
      sg && sg.img ? `<div><b>Ảnh khách gửi:</b> ${esc(sg.img)}</div>` : '',
      sg ? `<div><b>AI:</b> ${esc(sg.model)} · ${sg.sec} giây</div>` : '',
      sg && sg.handoff ? `<div><b>Bot đề nghị chuyển người:</b> ${esc(sg.lydo)}</div>` : '',
      S.waiting.length ? `<div><b>Đang chờ:</b> ${S.waiting.slice(0, 8).map((w) => `<a class="w" data-act="wait" data-val="${esc(w.convId)}" title="${esc(w.snippet)}">${esc(w.name)} ${w.min}p</a>`).join('')}${S.waiting.length > 8 ? ' +' + (S.waiting.length - 8) : ''}</div>` : '',
      `<div><b>Kho:</b> ${esc(S.kbStatus)} · ${PAIRS.length} cặp chat cũ (${PSTAT.chot} đã chốt đơn) · ${allLessons().length} bài học từ nhân viên</div>`,
      sg && sg.nhom ? `<div><b>Nhóm:</b> ${esc(sg.nhom)}</div>` : '',
    ].filter(Boolean).join('') || 'Chưa có thêm thông tin';
  }
  function renderNav() {
    const cur = S.active && S.active.convId; const w = S.waiting.find((x) => x.convId !== cur);
    els.next.className = 'nx' + (w ? '' : ' none');
    els.next.innerHTML = w ? `<span>Khách chờ tiếp ▸</span><small>${esc(w.name)} · ${w.min}p · ${w.short}</small>` : `<span>✓ Không có khách chờ</span><small>${S.waiting.length ? '' : 'đang theo dõi 2 Zalo'}</small>`;
    els.prev.disabled = !S.hist.length;
  }
  function renderTabs() { els.tabGoi.classList.toggle('on', S.tab === 'goi'); els.tabDon.classList.toggle('on', S.tab === 'don'); els.paneGoi.style.display = S.tab === 'goi' ? '' : 'none'; els.paneDon.style.display = S.tab === 'don' ? '' : 'none'; }
  function renderZone() {
    const sg = curSg(); const busy = aiBusyHere(); const secs = Math.round((Date.now() - S.busyAt) / 1000);
    els.zone.className = 'zone ' + (busy ? 'ai' : sg ? '' : 'idle');
    els.redo.disabled = busy || !S.active || !S.active.page;
    if (busy) els.zst.className = 'zst ai', els.zst.innerHTML = `<span class="dt"></span>${S.stage === 'nghe thoại' ? 'ĐANG NGHE TIN THOẠI' : 'AI ĐANG SOẠN 3 PHƯƠNG ÁN'}${S.aiModel && S.aiModel !== cfg.model ? ' (dự phòng)' : ''}<span class="sec">${secs}s</span>`;
    else if (!S.active) els.zst.className = 'zst', els.zst.innerHTML = 'Mở một khách Zalo bên trái (hoặc bấm "Khách chờ tiếp") để bắt đầu';
    else if (!S.active.page) els.zst.className = 'zst', els.zst.innerHTML = 'Hội thoại này không phải Zalo SMH/THHX';
    else if (notCust[S.active.convId] && !S.force[S.active.convId]) els.zst.className = 'zst', els.zst.innerHTML = `🚫 KHÔNG PHẢI KHÁCH MUA HÀNG<span class="h">${esc(notCust[S.active.convId])} · bot không soạn, không tính khách chờ</span>`;
    else if (!sg && S.active.closed) els.zst.className = 'zst sent', els.zst.innerHTML = `✓ KHÁCH ĐÃ KẾT THÚC<span class="h">khách nhắn cảm ơn / ok / sticker – không cần trả lời</span>`;
    else if (sg && sg.staffReplied && !sg.sent) els.zst.className = 'zst sent', els.zst.innerHTML = `✓ NHÂN VIÊN ĐÃ TỰ TRẢ LỜI<span class="h">khách nhắn tiếp bot sẽ soạn tiếp · ↻ để soạn lại</span>`;
    else if (sg && sg.sent) els.zst.className = 'zst sent', els.zst.innerHTML = `✓ ĐÃ GỬI phương án ${sg.sent}<span class="h">chờ khách nhắn tiếp</span>`;
    else if (sg) els.zst.className = 'zst ok', els.zst.innerHTML = `✓ ĐÃ SOẠN lúc ${fmtT(sg.at)} · ${sg.sec}s<span class="h">Alt+1/2/3 đổi câu · Enter gửi</span>`;
    else if (S.err) els.zst.className = 'zst err', els.zst.textContent = '⚠ ' + S.err.slice(0, 120);
    else els.zst.className = 'zst', els.zst.textContent = (S.active.msgs && S.active.msgs.length && !S.active.msgs[S.active.msgs.length - 1].k) ? 'Shop đang là người nhắn cuối – khách nhắn tiếp bot sẽ soạn · ↻ để soạn ngay' : 'Chưa có câu gợi ý – bấm ↻ Soạn lại nếu cần';
    renderLines(busy, sg);
    const A = S.active; const z = [];
    if (A && A.page && !busy) {
      const nc = notCust[A.convId] && !S.force[A.convId];
      const ended = !sg && (A.closed || (A.msgs && A.msgs.length && !A.msgs[A.msgs.length - 1].k));
      if (nc) z.push('<button class="p" data-act="forcedraft">Vẫn soạn</button><button data-act="iscust">✓ Là khách mua</button>');
      else { if (ended) z.push('<button class="p" data-act="proactive">✍ Soạn câu nhắn chủ động</button>'); z.push('<button data-act="notcust" title="Nhân viên nội bộ, nhà cung cấp, quảng cáo… – bot sẽ nhớ cho mọi máy">🚫 Không phải khách</button>'); }
    }
    const zh = z.join(''); if (els.zact.innerHTML !== zh) els.zact.innerHTML = zh;
  }
  function renderLines(busy, sg) {
    if (busy) { if (els.lines.dataset.at !== 'busy') { els.lines.dataset.at = 'busy'; els.lines.innerHTML = [1, 2, 3].map((i) => `<div class="o sk"><div class="k">${i}<small>Alt</small></div><div class="t"></div><button class="s" disabled>Gửi</button></div>`).join(''); els.opt = []; } return; }
    if (!sg) { if (els.lines.dataset.at !== 'none') { els.lines.dataset.at = 'none'; els.lines.innerHTML = ''; els.opt = []; } return; }
    if (els.lines.dataset.at !== String(sg.at)) {
      els.lines.dataset.at = String(sg.at);
      els.lines.innerHTML = sg.opts.map((o, i) => `<div class="o" data-i="${i}"><button class="k" data-act="pickopt" data-val="${i}" title="Điền phương án ${i + 1} vào ô chat (Alt+${i + 1})">${i + 1}<small>Alt</small></button><div class="t"><div class="tg"><span>${esc(o.kieu)}</span><span class="inb">● đang trong ô chat</span></div><textarea>${esc(o.text)}</textarea></div><button class="s" data-act="sendopt" data-val="${i}" title="Gửi luôn phương án ${i + 1}">Gửi</button></div>`).join('');
      els.opt = [...els.lines.querySelectorAll('textarea')];
      els.opt.forEach((ta, i) => {
        autosize(ta);
        ta.oninput = () => { autosize(ta); sg.opts[i].text = ta.value; if (sg.cur === i) { const cb = chatBox(); if (cb && isBotText(cb.value)) setChat(cb, ta.value); } };
        ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pickOpt(i, true); } };
        ta.onfocus = () => { if (sg.cur !== i && !sg.sent) pickOpt(i, true, true); };
      });
      els.lines.querySelectorAll('.o').forEach((b) => { b.addEventListener('click', (e) => { if (e.target.closest('button') || e.target.closest('textarea')) return; pickOpt(Number(b.dataset.i), true); }); });
    }
    els.lines.querySelectorAll('.o').forEach((box, i) => { const o = sg.opts[i]; if (!o) return; box.classList.toggle('cur', sg.cur === i && !sg.sent && !sg.staffReplied); box.classList.toggle('dim', (!!sg.sent && !o.sent) || !!sg.staffReplied); box.classList.toggle('sent', !!o.sent); const b = box.querySelector('.s'); b.textContent = o.sent ? '✓' : S.sending ? '…' : 'Gửi'; b.disabled = !!o.sent || S.sending; });
  }
  function renderFlag() {
    const sg = curSg(); const A = S.active; const info = (A && A.info) || {};
    const parts = [];
    if (info.track && !info.ma) parts.push(`<div class="flag red">Khách gửi mã vận đơn ${esc(info.track)} → cần xin mã đơn hàng trên app</div>`);
    if (sg && sg.bh) parts.push(`<div class="flag">Bảo hành: ${esc(sg.bh)}</div>`);
    if (sg && donComplete(sg.don) && S.tab === 'goi') parts.push(`<div class="flag">📦 Đã đủ thông tin lên đơn – xem thẻ "Đơn &amp; Bảo hành"</div>`);
    els.flag.innerHTML = parts.join('');
  }
  function renderFb(force) {
    const html = [];
    if (S.fb) {
      if (!force && document.activeElement && els.fb.contains(document.activeElement)) return;
      html.push(`<div class="fbx"><h4>👎 Bot sai ở đâu?<a data-act="fbclose" style="cursor:pointer">✕</a></h4>${['Sai kiến thức', 'Sai giá', 'Sai giọng', 'Sai xưng hô', 'Dài quá', 'Không đúng ý khách', 'Sai thông tin đơn', 'Khác'].map((r) => `<span class="opt${S.fb.reasons.includes(r) ? ' on' : ''}" data-act="reason" data-val="${r}">${r}</span>`).join('')}<input type="text" id="tdg-fbn" placeholder="Câu đúng phải là… (bot sẽ học câu này cho lần sau)" value="${esc(S.fb.note)}"><div class="row" style="margin-top:2px"><button class="b p" data-act="fbsend">Gửi phản hồi</button><button class="b" style="flex:0 0 70px" data-act="fbclose">Huỷ</button></div></div>`);
    }
    if (S.outreach) {
      if (!force && document.activeElement && els.fb.contains(document.activeElement)) return;
      const o = S.outreach;
      html.push(`<div class="fbx" style="border-color:#f59e0b;background:#fffbeb"><h4 style="color:#92400e">✉ Tin Shop chủ động nhắn khách đánh giá xấu<a data-act="orclose" style="cursor:pointer">✕</a></h4><div class="row" style="margin-top:0"><select id="tdg-osan"><option${o.san === 'Shopee' ? ' selected' : ''}>Shopee</option><option${o.san === 'Tiktok' ? ' selected' : ''}>Tiktok</option></select><select id="tdg-osao"><option>1</option><option>2</option><option>3</option></select><span class="mini">sao</span></div><input type="text" id="tdg-osp" placeholder="Sản phẩm khách đánh giá (vd 108 trầm chuẩn 6li)" value="${esc(o.sp)}"><input type="text" id="tdg-oly" placeholder="Lý do khách ghi (nếu có)" value="${esc(o.lydo)}"><div class="row" style="margin-top:2px"><button class="b p" data-act="orgo">Soạn 3 phương án</button></div></div>`);
    }
    els.fb.innerHTML = html.join('');
    if (S.outreach) { const s = els.fb.querySelector('#tdg-osao'); if (s) s.value = S.outreach.sao; }
  }
  function renderDon() {
    const A = S.active; const sg = curSg();
    if (!A || !A.page) { els.chk.innerHTML = '<li>Mở một khách Zalo để xem thông tin đơn</li>'; if (document.activeElement !== els.don) els.don.value = ''; els.donnotes.textContent = ''; return; }
    const d = donOf(A); const info = A.info || {};
    const li = (lab, v, miss) => `<li><span>${lab}</span>${v ? `<span class="okk" title="${esc(v)}">✓ ${esc(String(v).split('\n')[0].slice(0, 34))}</span>` : `<span class="no">✗ ${miss || 'thiếu'}</span>`}</li>`;
    els.chk.innerHTML = li('Mã đơn sàn', d.ma, info.track ? 'khách gửi mã vận đơn' : 'chưa có (đơn mới thì bỏ qua)') + li('Tên', d.ten) + li('SĐT', d.sdt) + li('Địa chỉ', d.dc) + li('Sản phẩm / việc', d.viec) + `<li><span>Ngày đặt · đã đánh giá</span><span class="mini">bản 2.0 tự tra sàn</span></li>`;
    const txt = S.donEdit[A.convId] !== undefined ? S.donEdit[A.convId] : orderText(d, A.page);
    if (document.activeElement !== els.don && els.don.value !== txt) els.don.value = txt;
    const ns = (A.notes || []); const cur = orderNoteOf(A);
    if (!els.note.dataset.busy) els.note.textContent = cur ? '📝 Sửa ghi chú đơn' : '📝 Ghi ô Thông tin';
    els.donnotes.innerHTML = ns.length ? `Ghi chú đã có (${ns.length})${cur ? ' · bot sẽ sửa ghi chú đơn hiện có, không tạo thêm' : ''}: ${ns.slice(-3).map((n) => esc(n.msg.split('\n')[0].slice(0, 40))).join(' · ')}` : 'Chưa có ghi chú ở ô Thông tin · đủ tên/SĐT/địa chỉ/sản phẩm bot mới ghi';
    els.autonote.textContent = 'Tự ghi ô Thông tin: ' + (cfg.autoNote ? 'BẬT' : 'tắt');
  }
  function renderCfgInfo() { if (!panel) return; const sc = S.scrape; const k = panel.querySelector('#c-kb'); if (k) k.textContent = 'Kho tri thức: ' + S.kbStatus; const e = panel.querySelector('#c-sc'); if (e && !/Apps Script:/.test(e.textContent)) e.innerHTML = `<b>Cào dữ liệu</b>: ${cfg.scrape ? (sc.on ? '● đang chạy' : 'chờ') : 'đã tắt'} · ${esc(sc.stage)}<br>Hội thoại ${sc.done}/${sc.total} · ${sc.msgs} tin · chờ gửi Sheet ${sc.unsynced}${sc.last ? ' · lượt cuối ' + sc.last : ''}${sc.err ? `<br><span class="no">Lỗi gần nhất: ${esc(sc.err)}</span>` : ''}`; const f = panel.querySelector('#c-foot'); if (f) f.textContent = `Người dùng: ${cfg.userName || '?'} · ${TITLE}${S.newVer ? ' · có bản mới ' + S.newVer : ''}`; const li = panel.querySelector('#c-learninfo'); if (li) { const all = allLessons(); li.innerHTML = `<b>Tự học</b>: ${all.length} bài học (${all.filter((l) => l.type === 'mẫu câu').length} mẫu câu · ${all.filter((l) => l.type === 'sửa sai').length} sửa sai · ${all.filter((l) => l.type === 'sửa đơn').length} sửa đơn · ${Object.keys(notCust).length} không phải khách)${LEARN.local.length ? ' · ' + LEARN.local.length + ' bài chưa lên Sheet' : ''}<br>Chat cũ: ${PAIRS.length} cặp · ${PSTAT.chot} dẫn tới chốt đơn · ${PSTAT.vui} khách hài lòng · ${PSTAT.xau} bị loại<br>Rà soát gần nhất: ${esc(localStorage.getItem(REV_KEY) || 'chưa')}${LEARN.at ? ' · tải bài học lúc ' + fmtT(LEARN.at) : ''}`; } }
  function renderLog() { if (!els.log) return; els.log.innerHTML = S.log.slice(0, 60).map((l) => `<div class="${l.cls}">${l.t} ${esc(l.msg)}</div>`).join(''); }

  // ===================== NGƯỜI DÙNG = TÀI KHOẢN PANCAKE =====================
  async function loadUser() { try { const j = await api('/api/v1/users/me'); const n = j && j.data && j.data.name; if (n && n !== cfg.userName) { cfg.userName = n; saveCfg(); renderCfgInfo(); const u = panel && panel.querySelector('#c-user'); if (u) u.textContent = n; } } catch (e) { } }

  // ===================== KHỞI ĐỘNG =====================
  buildUi();
  loadUser(); loadKB(false); buildPairs().catch(() => { }); setTimeout(() => loadLessons(true), 4000);
  setInterval(() => loadLessons(false), 15 * 60000);
  setInterval(() => selfReviewTick(false), 10 * 60000 + rnd(0, 60000)); setTimeout(() => selfReviewTick(false), rnd(60000, 120000));
  setTimeout(checkUpdate, 20000); setInterval(checkUpdate, 6 * 3600e3);
  setInterval(() => { try { watchActive(); } catch (e) { } }, 1200);
  setInterval(() => { if (S.busy) renderZone(); renderHead(); }, 1000);
  setInterval(() => { refreshWaiting(); }, 15000); setTimeout(refreshWaiting, 3000);
  setInterval(() => loadKB(false), 5 * 60000);
  if (cfg.scrape) setTimeout(scrapeLoop, rnd(15000, 30000));
  log(`${TITLE} đã chạy`, 'ok', false);
  // Cửa sổ kiểm thử nội bộ (không ảnh hưởng người dùng)
  window.TDGP = { S, cfg, extractInfo, parseOrderBlock, findCodes, phonesIn, draftFor, fetchMsgs, buildSystem, pairs: () => PAIRS, refreshWaiting, openConv, isClosing, pendingOf, isShopAddr, lessons: allLessons, addLesson, loadLessons, selfReviewTick, notCust, lessonsFor, VERSION };
})();
