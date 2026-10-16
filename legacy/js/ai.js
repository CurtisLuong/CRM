/**
 * ai.js — TRỢ LÝ AI ở trang hồ sơ khách (gọi Worker POST /ai → Cloudflare Workers AI, Qwen3 30B).
 *
 *   1. Tóm tắt trước khi gọi  — khách cần gì, đang lo gì, lần trước hẹn gì + 2–3 câu nên hỏi.
 *   2. Soạn tin Zalo          — 1 tin theo ngữ cảnh ghi chú; sửa được rồi Copy & mở Zalo.
 *   3. Ghi chú → việc cần làm — nút "Lưu + AI" ở ô thêm ghi chú: lưu ghi chú, AI đề xuất cập nhật
 *                               thông tin / việc / lịch gọi → hộp rà soát, sale TICK CHỌN rồi mới ghi.
 *
 * AI KHÔNG BAO GIỜ tự ghi vào dữ liệu khách: mọi thay đổi đi qua hộp rà soát + API CRM.* như thao tác tay.
 * Cần mạng (không chạy offline). WORKER_URL trống → thẻ AI tự ẩn. Model đổi ở worker/ai-assist.js.
 * Dùng hàm/biến chung của app.js (allCustomers, detailId, buildAnalysisJSON, CALL_SLOT_LIST, …).
 */
(function () {
  const workerUrl = () => ((window.APP_CONFIG && window.APP_CONFIG.WORKER_URL) || '').replace(/\/+$/, '');
  const enabled = () => !!workerUrl();
  const PURPOSES = ['Ở', 'Đầu tư', 'Cho tặng'];
  const MARITAL = ['đã kết hôn', 'chưa kết hôn'];
  const FIELD_LABELS = {
    apt_type: 'Loại căn', projects: 'Dự án', purpose: 'Mục đích', marital_status: 'Hôn nhân',
    occupation: 'Công việc', finance: 'Vốn sẵn có', apt_price: 'Giá căn quan tâm', income: 'Thu nhập', residence: 'Nơi ở',
  };
  const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const WD_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const pad = (n) => String(n).padStart(2, '0');
  const cur = () => allCustomers.find((x) => x.id === detailId);

  // ═══════════════ CÀI ĐẶT: MODEL + PHONG CÁCH VIẾT ═══════════════
  // ✏️ Model chọn được — khoá phải khớp MODELS trong worker/ai-assist.js (thêm model = thêm ở cả 2 nơi).
  const AI_MODELS = [
    { key: 'qwen', label: 'Qwen3', name: 'Qwen3 30B' },
    { key: 'glm',  label: 'GLM',   name: 'GLM 4.7 Flash' },
  ];
  // ✏️ PHONG CÁCH VIẾT MẶC ĐỊNH (system instruction cho Tóm tắt + Soạn tin Zalo). Sale sửa trong app
  //    (thẻ Trợ lý AI → ⚙ Cài đặt); bản sửa lưu ở user_settings.ai_settings, "Khôi phục mặc định" quay về đây.
  const AI_DEFAULT_STYLE = [
    'Giọng: chuyên nghiệp, lịch sự, thân thiện — như một sale có kinh nghiệm nói chuyện với khách quen.',
    '- Đi thẳng vào việc. Câu ngắn, mỗi câu phải có thông tin hoặc mục đích rõ.',
    '- KHÔNG rào đón, không khen xã giao, không câu sáo như "Chúc anh/chị một ngày tốt lành", "Mong anh/chị phản hồi sớm", "Rất hân hạnh được hỗ trợ".',
    '- Không lặp lại điều khách đã biết; không giải thích dài.',
    '- Xưng "em", gọi khách "anh"/"chị" + tên.',
    '- Tin Zalo: 2–3 câu, tối đa 1 emoji (có thể không dùng). Kết bằng 1 câu hỏi cụ thể, dễ trả lời.',
    '- Tóm tắt: viết như ghi chú nhanh cho chính sale đọc, không cần câu hoàn chỉnh trang trọng.',
  ].join('\n');
  const LS_AI = 'crm_ai_settings';
  function readLocal() {
    try { const v = JSON.parse(localStorage.getItem(LS_AI) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  }
  function settings() {
    const v = readLocal();
    return {
      model: AI_MODELS.some((m) => m.key === v.model) ? v.model : AI_MODELS[0].key,
      style: typeof v.style === 'string' && v.style.trim() ? v.style : null, // null = mặc định
    };
  }
  const styleText = () => settings().style || AI_DEFAULT_STYLE;
  const modelOf = (k) => AI_MODELS.find((m) => m.key === k) || AI_MODELS[0];
  function saveSettings(next) {
    const v = { ...settings(), ...next };
    try { localStorage.setItem(LS_AI, JSON.stringify(v)); } catch { /* ignore */ }
    if (window.CRM && CRM.saveAiSettingsRemote) CRM.saveAiSettingsRemote(v); // đồng bộ máy khác (lỗi → vẫn giữ trên máy)
    syncModelSwitch();
  }
  // Sau đăng nhập (app.js): server có → lấy về máy; server trống mà máy có → đẩy lên.
  async function sync() {
    try {
      const remote = await CRM.getAiSettingsRemote();
      if (remote === undefined) return;
      if (remote && typeof remote === 'object') { localStorage.setItem(LS_AI, JSON.stringify(remote)); syncModelSwitch(); }
      else if (localStorage.getItem(LS_AI)) CRM.saveAiSettingsRemote(readLocal());
    } catch (e) { console.warn('sync cài đặt AI lỗi:', e); }
  }

  // ── Ngữ cảnh gửi AI: dùng lại JSON của "Copy prompt phân tích AI", bỏ SĐT / tử vi, thêm mốc giờ ghi chú,
  //    cuộc gọi gần đây, lịch hẹn + việc đang mở (để AI biết lần trước đã hẹn gì).
  function contextOf(c) {
    const j = buildAnalysisJSON(c);
    delete j.tu_vi;
    if (j.thong_tin_ca_nhan) delete j.thong_tin_ca_nhan.so_dien_thoai;
    j.ghi_chu.ghi_chu_tay = (Array.isArray(c.notes_manual) ? [...c.notes_manual] : [])
      .filter((n) => n && (n.text || '').trim())
      .sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 15)
      .map((n) => ({ luc: n.at ? formatLogTime(n.at) : null, noi_dung: String(n.text).slice(0, 500) }));
    j.ghi_chu.lich_su_cham_soc = (j.ghi_chu.lich_su_cham_soc || []).slice(-15);
    j.cuoc_goi_gan_day = (Array.isArray(c.call_attempts) ? [...c.call_attempts] : [])
      .sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 8)
      .map((a) => ({ luc: a.at ? formatLogTime(a.at) : null, ket_qua: (typeof CALL_RESULTS !== 'undefined' && CALL_RESULTS[a.result]) || a.result || 'chưa ghi', ghi_chu: a.note || null }));
    j.lich_hen_goi = c.next_call_at ? { luc: formatLogTime(c.next_call_at), ly_do: c.next_call_reason || null } : null;
    j.viec_dang_mo = openTasksOf(c).map((t) => t.text).filter(Boolean).slice(0, 8);
    j.hom_nay = nowText();
    return j;
  }
  function nowText() {
    const d = new Date();
    return `${WD_LONG[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function todayIso() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

  async function callAi(task, c, extra) {
    if (!enabled()) throw new Error('Chưa cấu hình WORKER_URL.');
    if (navigator.onLine === false) throw new Error('Đang offline — trợ lý AI cần mạng.');
    const { data: { session } } = await sb.auth.getSession();
    const token = session && session.access_token;
    if (!token) throw new Error('Chưa đăng nhập.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(`${workerUrl()}/ai`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ task, customer: contextOf(c), extra: { ...(extra || {}), model: settings().model, style: styleText() } }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) throw new Error(out.error || `Lỗi ${res.status}`);
      return out.data || {};
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('AI phản hồi quá lâu — thử lại.');
      throw e;
    } finally { clearTimeout(timer); }
  }

  // ═══════════════ THẺ "TRỢ LÝ AI" (tab Tổng quan) ═══════════════
  // Kết quả nhớ theo khách + updated_at: mở lại hồ sơ không gọi lại AI, khách đổi dữ liệu thì làm mới.
  const cache = new Map(); // `${task}:${model}:${id}` → { stamp, data, goal }
  const keyOf = (task, c) => `${task}:${settings().model}:${c.id}`;
  let mode = null;         // 'brief' | 'zalo' | null — panel đang mở
  let busy = false;
  const stampOf = (c) => c.updated_at || '';

  function onOpenDetail(c) {
    const card = $('#detail-ai');
    if (!card) return;
    card.hidden = !enabled();
    $('#detail-note-add-ai').hidden = !enabled();
    syncModelSwitch();
    if (card.dataset.cid !== c.id) { card.dataset.cid = c.id; mode = null; renderOut(); }
  }
  function syncModelSwitch() {
    const box = $('#ai-model-switch'); if (!box) return;
    const k = settings().model;
    box.innerHTML = AI_MODELS.map((m) => `<button type="button" class="ai-model-opt${m.key === k ? ' is-sel' : ''}" data-ai-model="${m.key}" aria-pressed="${m.key === k}" title="${escapeHtml(m.name)}">${escapeHtml(m.label)}</button>`).join('');
  }

  function setLoading(msg) {
    const box = $('#ai-out');
    box.hidden = false;
    box.innerHTML = `<div class="ai-loading"><span class="ai-spin" aria-hidden="true"></span>${escapeHtml(msg)}</div>`;
  }
  function setError(msg, retry) {
    const box = $('#ai-out');
    box.hidden = false;
    box.innerHTML = `<div class="ai-error">⚠️ ${escapeHtml(msg)}</div>
      <div class="ai-row"><button type="button" class="btn-small" data-ai-retry="${retry}">Thử lại</button></div>`;
  }
  function syncButtons() {
    $('#ai-brief-btn')?.classList.toggle('is-on', mode === 'brief');
    $('#ai-zalo-btn')?.classList.toggle('is-on', mode === 'zalo');
  }

  function renderOut() {
    syncButtons();
    const box = $('#ai-out');
    const c = cur();
    if (!box) return;
    if (!mode || !c) { box.hidden = true; box.innerHTML = ''; return; }
    const hit = cache.get(keyOf(mode, c));
    const by = escapeHtml(modelOf(settings().model).name);
    box.hidden = false;
    if (mode === 'brief') {
      if (!hit) { box.innerHTML = ''; return; }
      const d = hit.data;
      box.innerHTML = `<p class="ai-summary">${escapeHtml(d.tom_tat || 'Chưa đủ dữ liệu để tóm tắt.')}</p>
        ${d.can_hoi && d.can_hoi.length ? `<div class="ai-sub">Nên hỏi</div><ul class="ai-list">${d.can_hoi.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>` : ''}
        ${d.luu_y ? `<div class="ai-note">${escapeHtml(d.luu_y)}</div>` : ''}
        <div class="ai-row">${hit.stamp !== stampOf(c) ? '<span class="ai-stale">Khách vừa có cập nhật</span>' : ''}<span class="ai-foot">${by} gợi ý — kiểm tra lại trước khi dùng</span><button type="button" class="btn-small" data-ai-retry="brief">Làm mới</button></div>`;
    } else {
      const msg = hit ? hit.data.tin_nhan || '' : '';
      const goal = hit ? hit.goal || '' : '';
      box.innerHTML = `<textarea id="ai-zalo-text" class="sched-reason ai-zalo-text" rows="5">${escapeHtml(msg)}</textarea>
        <input id="ai-zalo-goal" class="ai-goal" type="text" maxlength="200" placeholder="Mục đích tin (tuỳ chọn) — vd: mời đi xem nhà mẫu Chủ nhật" value="${escapeHtml(goal)}" />
        <div class="ai-row"><span class="ai-foot">${by} · sửa lại trước khi gửi</span>
          <button type="button" class="btn-small" data-ai-retry="zalo">Viết lại</button>
          <button type="button" class="btn-small btn-primary" id="ai-zalo-send"><span class="btn-ic" data-icon="message"></span>Copy & mở Zalo</button></div>`;
      hydrateIcons(box);
    }
  }

  async function run(task) {
    const c = cur();
    if (!c || busy) return;
    mode = task; syncButtons();
    const goal = task === 'zalo' ? (($('#ai-zalo-goal') && $('#ai-zalo-goal').value) || '').trim() : '';
    busy = true;
    setLoading(task === 'brief' ? 'Đang đọc lịch sử khách…' : 'Đang soạn tin…');
    try {
      const data = await callAi(task, c, task === 'zalo' ? { goal } : {});
      cache.set(keyOf(task, c), { stamp: stampOf(c), data, goal });
      if (detailId === c.id && mode === task) renderOut();
    } catch (e) {
      if (detailId === c.id && mode === task) setError(e.message || 'Lỗi không rõ', task);
    } finally { busy = false; }
  }

  function toggle(task) {
    const c = cur(); if (!c) return;
    if (mode === task) { mode = null; renderOut(); return; } // bấm lại = thu gọn
    show(task);
  }
  // Mở panel `task` với model đang chọn: có kết quả cũ hợp lệ → hiện luôn, không thì gọi AI.
  function show(task) {
    const c = cur(); if (!c) return;
    const hit = cache.get(keyOf(task, c));
    // Tóm tắt: có kết quả cũ cùng phiên bản dữ liệu → hiện luôn. Zalo: luôn hiện tin đã soạn (nếu có).
    if (hit && (task === 'zalo' || hit.stamp === stampOf(c))) { mode = task; renderOut(); return; }
    run(task);
  }

  document.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-ai-model]');
    if (mb) { // đổi model: panel đang mở → hiện kết quả của model mới (để so sánh nhanh)
      if (mb.dataset.aiModel === settings().model || busy) return;
      saveSettings({ model: mb.dataset.aiModel });
      showToast(`Trợ lý AI dùng ${modelOf(mb.dataset.aiModel).name}`);
      if (mode) show(mode);
      return;
    }
    if (e.target.closest('#ai-settings-open, #ai-settings-btn')) return openSettings();
    if (e.target.closest('#ai-brief-btn')) return toggle('brief');
    if (e.target.closest('#ai-zalo-btn')) return toggle('zalo');
    const r = e.target.closest('[data-ai-retry]');
    if (r) return run(r.dataset.aiRetry);
    if (e.target.closest('#ai-zalo-send')) {
      const c = cur(); const text = ($('#ai-zalo-text').value || '').trim();
      if (!c || !text) return;
      const hit = cache.get(keyOf('zalo', c)); if (hit) hit.data.tin_nhan = text; // giữ bản đã sửa
      copyText(text); // copy TRONG cử chỉ click (không await) — giống hộp mẫu Zalo
      showToast('Đã copy tin — dán vào Zalo');
      openZaloFor(c);
    }
  });

  // ═══════════════ GHI CHÚ → ĐỀ XUẤT CẬP NHẬT + VIỆC ═══════════════
  let review = null; // { id, items: [{type, ...}] }

  async function saveNoteWithAi() {
    const c = cur();
    const text = ($('#detail-note-add-input').value || '').trim();
    if (!c || !text) return;
    await saveNewNote(text); // lưu ghi chú như bình thường trước (AI lỗi cũng không mất ghi chú)
    showToast('Đã lưu ghi chú — AI đang đọc…');
    try {
      const data = await callAi('parse_note', c, {
        note: text, now: nowText(), today: todayIso(),
        slots: CALL_SLOT_LIST.map((s) => ({ key: s.key, name: s.name, text: s.text })),
        options: { apt_types: APT_TYPES, projects: projectOptions.map((p) => p.name), purpose: PURPOSES, marital: MARITAL, occupation: OCCUPATIONS },
      });
      const fresh = allCustomers.find((x) => x.id === c.id) || c;
      const items = buildItems(fresh, data);
      if (!items.length) { showToast('AI không thấy thông tin / việc nào cần cập nhật từ ghi chú này'); return; }
      openReview(fresh, items);
    } catch (e) {
      showToast('AI lỗi: ' + (e.message || 'không rõ') + ' (ghi chú vẫn đã lưu)');
    }
  }

  // Lọc đề xuất của AI theo danh mục thật của app (không tin model): giá trị lạ / trùng giá trị cũ → bỏ.
  function buildItems(c, d) {
    const items = [];
    const up = (d && d.cap_nhat) || {};
    const pick = (v, list) => list.find((x) => x.toLowerCase() === String(v || '').trim().toLowerCase());
    const add = (key, val, show) => {
      if (val == null || val === '') return;
      const old = c[key];
      if (JSON.stringify(old) === JSON.stringify(val)) return;
      items.push({ type: 'field', key, val, html: `<b>${FIELD_LABELS[key]}:</b> ${old != null && old !== '' && !(Array.isArray(old) && !old.length) ? `<s>${escapeHtml(show(old))}</s> → ` : ''}${escapeHtml(show(val))}` });
    };
    const txt = (v) => String(v);
    const apt = up.apt_type ? canonicalAptType(up.apt_type) : null;
    add('apt_type', APT_TYPES.includes(apt) ? apt : null, txt);
    if (Array.isArray(up.projects)) {
      const names = projectOptions.map((p) => p.name);
      const found = up.projects.map((p) => pick(p, names)).filter(Boolean);
      const merged = [...new Set([...(Array.isArray(c.projects) ? c.projects : []), ...found])];
      if (found.length && merged.length !== (c.projects || []).length) add('projects', merged, (v) => (Array.isArray(v) ? v.join(', ') : ''));
    }
    add('purpose', pick(up.purpose, PURPOSES), txt);
    add('marital_status', pick(up.marital_status, MARITAL), txt);
    add('occupation', pick(up.occupation, OCCUPATIONS), txt);
    add('finance', up.finance > 0 ? up.finance : null, formatPrice);
    add('apt_price', up.apt_price > 0 ? up.apt_price : null, formatPrice);
    add('income', up.income || null, txt);
    add('residence', up.residence || null, txt);

    for (const t of (d && d.viec) || []) {
      const due = taskDue(t);
      const k = TASK_KINDS[t.kind] ? t.kind : taskKind({ text: t.text });
      items.push({ type: 'task', text: t.text, kind: k, due,
        html: `${kindIconHtml(k, 'task-kind-ic')}<b>Việc:</b> ${escapeHtml(t.text)}${due ? ` <span class="ai-when">· ${escapeHtml(dueLabel(due))}</span>` : ''}` });
    }
    const call = d && d.hen_goi ? callRange(d.hen_goi) : null;
    if (call) {
      const replace = c.next_call_at ? ` <span class="ai-when">(thay lịch ${escapeHtml(formatLogTime(c.next_call_at))})</span>` : '';
      items.push({ type: 'call', ...call,
        html: `<span class="task-kind-ic kind-call" aria-hidden="true">${icon('call_sched')}</span><b>Hẹn gọi:</b> ${escapeHtml(call.label)}${call.reason ? ' · ' + escapeHtml(call.reason) : ''}${replace}` });
    }
    return items;
  }
  function dateOf(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function dayText(d) { return `${WD[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }
  function taskDue(t) {
    if (!t.date) return null;
    const base = dateOf(t.date);
    if (t.time) {
      const [h, m] = t.time.split(':').map(Number); base.setHours(h, m, 0, 0);
      return base.getTime() > Date.now() ? { due: base.toISOString(), due_allday: false } : null;
    }
    base.setHours(23, 59, 0, 0);
    return base.getTime() > Date.now() ? { due: base.toISOString(), due_allday: true } : null;
  }
  function dueLabel(due) {
    const d = new Date(due.due);
    return dayText(d) + (due.due_allday ? '' : ' ' + fmtClock(d.getTime()));
  }
  // Lịch gọi: giờ cụ thể → 1 mốc; khung A/B/C/D → khung đó; không rõ → khung đầu tiên chưa qua trong ngày.
  // Khung giờ đọc từ CALL_SLOT_LIST (FOLLOWUP_CONFIG.callSlots — D-005).
  function callRange(h) {
    const base = dateOf(h.date);
    let sh, sm, eh, em, name = '';
    const named = CALL_SLOT_LIST.find((s) => s.key === h.slot);
    const startOf = (s) => `${pad(s.range[0])}:${pad(s.range[1])}`;
    // Model hay trả cả khung lẫn giờ = giờ bắt đầu khung ("tối" → D + 20:00) → coi là khung.
    if (h.time && !(named && pad(h.time.split(':')[0]) + ':' + h.time.split(':')[1] === startOf(named))) {
      [sh, sm] = h.time.split(':').map(Number); eh = sh; em = sm;
    } else {
      const at = (s) => { const e = new Date(base); e.setHours(s.range[2], s.range[3], 0, 0); return e.getTime(); };
      const slot = named || CALL_SLOT_LIST.find((s) => at(s) > Date.now());
      if (!slot) return null;
      [sh, sm, eh, em] = slot.range; name = slot.name + ' ';
    }
    const start = new Date(base); start.setHours(sh, sm, 0, 0);
    const end = new Date(base); end.setHours(eh, em, 0, 0);
    if (end.getTime() <= Date.now()) return null; // đã qua → bỏ (khớp quy tắc hộp Hẹn gọi)
    const label = `${dayText(start)} · ${name}${fmtClock(start.getTime())}${end.getTime() !== start.getTime() ? '–' + fmtClock(end.getTime()) : ''}`;
    return { start, end, reason: h.reason || '', label };
  }

  function openReview(c, items) {
    review = { id: c.id, items };
    $('#ai-review-sub').textContent = c.full_name || '';
    $('#ai-review-list').innerHTML = items.map((it, i) => `<label class="ai-item">
        <input type="checkbox" data-ai-i="${i}" checked />
        <span class="ai-item-body">${it.html}</span>
      </label>`).join('');
    $('#ai-review-error').textContent = '';
    $('#ai-review-modal').showModal();
  }

  async function applyReview() {
    if (!review) return;
    const chosen = $$('#ai-review-list [data-ai-i]').filter((b) => b.checked).map((b) => review.items[+b.dataset.aiI]);
    const id = review.id;
    try {
      const payload = {};
      for (const it of chosen) if (it.type === 'field') payload[it.key] = it.val;
      const call = chosen.find((it) => it.type === 'call');
      if (call) Object.assign(payload, { next_call_at: call.start.toISOString(), next_call_end: call.end.toISOString(), next_call_reason: call.reason || null });
      if (Object.keys(payload).length) await CRM.update(id, payload);
      for (const it of chosen) if (it.type === 'task') await CRM.addTask(id, it.text, it.due, it.kind);
    } catch (e) {
      $('#ai-review-error').textContent = 'Không lưu được: ' + (e.message || 'lỗi không rõ');
      return;
    }
    $('#ai-review-modal').close();
    review = null;
    await refreshList();
    if (detailId === id && !$('#detail-screen').hidden) openDetail(id);
    if (chosen.length) showToast(`Đã áp dụng ${chosen.length} đề xuất`);
  }

  $('#detail-note-add-ai')?.addEventListener('click', saveNoteWithAi);
  $('#ai-review-apply')?.addEventListener('click', applyReview);
  $('#ai-review-cancel')?.addEventListener('click', () => { $('#ai-review-modal').close(); review = null; });

  // ── Hộp Cài đặt AI: chọn model + sửa phong cách viết ──
  let pickModel = null;
  function openSettings() {
    $('#topbar-menu')?.classList.remove('open'); // mở từ menu Tiện ích → đóng menu
    const st = settings();
    pickModel = st.model;
    $('#ai-set-models').innerHTML = AI_MODELS.map((m) => `<button type="button" class="sched-opt${m.key === pickModel ? ' is-sel' : ''}" data-set-model="${m.key}">${escapeHtml(m.name)}</button>`).join('');
    $('#ai-set-style').value = styleText();
    $('#ai-settings-modal').showModal();
  }
  $('#ai-set-models')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set-model]'); if (!b) return;
    pickModel = b.dataset.setModel;
    $$('#ai-set-models .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
  });
  $('#ai-set-reset')?.addEventListener('click', () => { $('#ai-set-style').value = AI_DEFAULT_STYLE; });
  $('#ai-set-cancel')?.addEventListener('click', () => $('#ai-settings-modal').close());
  $('#ai-set-save')?.addEventListener('click', () => {
    const v = $('#ai-set-style').value.trim();
    const changed = pickModel !== settings().model || (v || AI_DEFAULT_STYLE) !== styleText();
    saveSettings({ model: pickModel, style: !v || v === AI_DEFAULT_STYLE ? null : v });
    $('#ai-settings-modal').close();
    if (changed) { cache.clear(); if (mode) show(mode); } // phong cách đổi → kết quả cũ không còn đúng giọng
    showToast('Đã lưu cài đặt Trợ lý AI');
  });

  window.CRMAI = { onOpenDetail, enabled, sync };
})();
