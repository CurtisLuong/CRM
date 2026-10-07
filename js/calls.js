// js/calls.js — NHẬT KÝ CUỘC GỌI dùng chung (Khách mới + Tiềm năng; web + vỏ Android sau này).
//
// Dữ liệu: customers.call_attempts (jsonb mảng) — mỗi phần tử {at, result, note, duration?,
// origin?, device_id?, direction?}. result null = CHƯA GHI CHÚ. Xem CALL_RESULTS trong app.js.
//
// 3 đường vào hộp ghi cuộc gọi (#call-log-modal):
//   1. Bấm nút "📞 Ghi cuộc gọi" (hộp Khách mới / hồ sơ Tiềm năng) — nhập tay.
//   2. Bấm SĐT (tel:) trong CRM → rời app gọi → QUAY LẠI app: tự mở hộp, kèm thời gian
//      rời app (ƯỚC LƯỢNG, gồm cả lúc đổ chuông). Chạy trên mọi nền tảng web.
//   3. CỔNG THIẾT BỊ (vỏ Android/Capacitor — giai đoạn 2): vỏ gán window.CRMCallSource; mỗi lần
//      mở/quay lại app → đọc nhật ký cuộc gọi máy → ingest() ghi các cuộc tới SĐT khách thành
//      "chưa ghi chú" (thời lượng CHÍNH XÁC) → tự mở hộp cho cuộc mới nhất.
//      Ghi NGẦM khi app đóng (sau này): dịch vụ nền chỉ cần đẩy cuộc gọi cùng định dạng vào
//      window.CRMCalls.ingest(...) hoặc ghi thẳng phần tử call_attempts (result null) vào DB —
//      app sẽ tự hiện chúng là "chưa ghi chú" (chuông thông báo + nút Ghi chú).
(function () {
  'use strict';

  // ---- Gợi ý kết quả theo THỜI LƯỢNG + LỚP KHÁCH (chốt 2026-10-07) ----
  const SHORT_CALL_SEC = 30; // < 30s = cuộc ngắn; ≥ 30s = có trao đổi → ghi chú tự do
  const CALL_RESULT_SETS = {
    lead:      { zero: ['no_answer', 'unreachable', 'line_busy', 'hung_up', 'wrong_number'], short: ['hung_up', 'busy'], long: ['talked'] },
    qualified: { zero: ['no_answer', 'hung_up', 'line_busy', 'unreachable'],                 short: ['busy'],            long: ['talked'] },
  };
  const BUCKET_TITLES = { zero: 'Không kết nối', short: `Ngắn (dưới ${SHORT_CALL_SEC}s)`, long: `Có trao đổi (từ ${SHORT_CALL_SEC}s)` };
  const NOTE_HINT_LONG = 'Đã nói gì? Thông tin hữu ích cần lưu (nhu cầu, tài chính, hẹn gặp...)';
  const NOTE_HINT = 'Ghi chú (không bắt buộc)';
  function bucketOf(sec) {
    if (sec == null || isNaN(sec)) return null;
    if (sec <= 0) return 'zero';
    return sec < SHORT_CALL_SEC ? 'short' : 'long';
  }

  // ---- Hộp ghi cuộc gọi ----
  let st = null; // {customerId, at, duration, estimateSec, origin, deviceId, direction, editAt, result}

  function findCustomer(id) { return allCustomers.find((x) => x.id === id); }

  /**
   * Mở hộp. opts: {customerId, at?, duration?, estimateSec?, origin?, editAt?}
   * editAt = `at` của 1 cuộc ĐÃ có (vd cuộc "chưa ghi chú") → ghi chú/sửa cuộc đó thay vì thêm mới.
   */
  function open(opts) {
    const c = findCustomer(opts.customerId); if (!c) return;
    const existing = opts.editAt ? callAttemptsOf(c).find((a) => a.at === opts.editAt) : null;
    st = {
      customerId: c.id,
      at: existing ? existing.at : (opts.at || new Date().toISOString()),
      duration: existing ? (existing.duration ?? null) : (opts.duration ?? null),
      estimateSec: opts.estimateSec ?? null,
      origin: existing ? (existing.origin || 'manual') : (opts.origin || 'manual'),
      deviceId: existing ? existing.device_id : opts.deviceId,
      direction: existing ? existing.direction : opts.direction,
      editAt: existing ? existing.at : null,
      result: existing ? existing.result : null,
    };
    const layer = isQualified(c) ? 'qualified' : 'lead';
    const bucket = bucketOf(st.duration);
    if (!st.result && bucket) { const opts1 = CALL_RESULT_SETS[layer][bucket]; if (opts1.length === 1) st.result = opts1[0]; }

    $('#calllog-title').textContent = '📞 ' + (c.full_name || '(chưa có tên)');
    const when = formatLogTime(st.at);
    let sub = when;
    if (st.duration != null) sub += ' · thời lượng ' + formatCallDuration(st.duration);
    else if (st.estimateSec != null) sub += ` · rời app khoảng ${formatCallDuration(st.estimateSec)} (ước lượng, gồm cả lúc đổ chuông)`;
    if (st.direction === 'in') sub += ' · khách gọi đến';
    $('#calllog-sub').textContent = sub;

    // Có thời lượng chính xác → chỉ hiện nhóm gợi ý đúng; không có → hiện đủ 3 nhóm để chọn.
    const buckets = bucket ? [bucket] : ['zero', 'short', 'long'];
    $('#calllog-results').innerHTML = buckets.map((b) => `
      <div class="sched-label">${bucket ? 'Kết quả' : BUCKET_TITLES[b]}</div>
      <div class="sched-opts">${CALL_RESULT_SETS[layer][b].map((code) =>
        `<button type="button" class="sched-opt${st.result === code ? ' is-sel' : ''}" data-res="${code}">${escapeHtml(CALL_RESULTS[code] || code)}</button>`).join('')}</div>`).join('');
    $('#calllog-note').value = existing && existing.note ? existing.note : '';
    syncNoteHint();
    $('#calllog-error').textContent = '';
    $('#calllog-later').textContent = st.editAt ? 'Để sau' : 'Huỷ';
    $('#calllog-delete').hidden = !(st.editAt && !st.result); // xoá cuộc "chưa ghi chú" (vd gọi nhầm)
    renderNext();
    const dlg = $('#call-log-modal');
    if (!dlg.open) dlg.showModal();
  }
  function syncNoteHint() {
    const long = st && st.result === 'talked';
    $('#calllog-note-label').textContent = long ? 'Ghi chú cuộc gọi' : 'Ghi chú';
    $('#calllog-note').placeholder = long ? NOTE_HINT_LONG : NOTE_HINT;
  }

  // ---- GỢI Ý LẦN GỌI TIẾP THEO (nhịp follow-up, cấu hình ở js/followup.js) ----
  // Chọn kết quả → hiện gợi ý ngay dưới. 4 cách xử lý (st.nextMode):
  //   accept = lưu kèm lịch gợi ý · change = lưu xong mở hộp chọn giờ · none = không hẹn
  //   drop   = lưu xong mở hộp Loại khách (khách mới gọi mãi không được / sai số).
  function previewAttempts(c) {
    const cur = { at: st.at, result: st.result };
    const list = callAttemptsOf(c);
    return st.editAt ? list.map((a) => (a.at === st.editAt ? { ...a, ...cur } : a)) : list.concat([cur]);
  }
  function renderNext() {
    const box = $('#calllog-next'); if (!box || !st) return;
    const c = findCustomer(st.customerId);
    const sug = (c && st.result && window.FOLLOWUP) ? FOLLOWUP.afterCall(c, previewAttempts(c)) : null;
    st.sug = sug;
    if (!sug) { st.nextMode = 'none'; box.hidden = true; box.innerHTML = ''; return; }
    if (!st.nextTouched) st.nextMode = sug.kind === 'schedule' ? 'accept' : sug.kind === 'ask' ? 'change' : 'drop';
    const sched = sug.kind === 'schedule' ? sug : sug.fallback;
    let head, opts;
    if (sug.kind === 'ask') {
      head = '📅 Khách hẹn giờ — lưu xong sẽ mở hộp chọn giờ gọi lại.';
      opts = [['change', 'Chọn giờ'], ['none', 'Không hẹn']];
    } else if (sug.kind === 'drop') {
      head = '⚠️ ' + escapeHtml(sug.text) + (sched ? `<div class="fu-alt">Hoặc vẫn gọi lại: ${escapeHtml(sched.label)}</div>` : '');
      opts = [['drop', 'Loại khách'], ...(sched ? [['accept', 'Vẫn hẹn gọi lại']] : []), ['none', 'Để sau']];
    } else {
      head = `📅 Gợi ý gọi lại: <b>${escapeHtml(sug.label)}</b><div class="fu-alt">${escapeHtml(sug.reason)}</div>`;
      opts = [['accept', 'Đặt lịch này'], ['change', 'Chọn giờ khác'], ['none', 'Không hẹn']];
    }
    box.innerHTML = `<div class="fu-head">${head}</div><div class="sched-opts">${opts.map(([m, t]) =>
      `<button type="button" class="sched-opt${st.nextMode === m ? ' is-sel' : ''}" data-next="${m}">${t}</button>`).join('')}</div>`;
    box.hidden = false;
  }
  $('#calllog-next')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-next]'); if (!b || !st) return;
    st.nextMode = b.dataset.next; st.nextTouched = true; renderNext();
  });

  /** Mở cuộc "chưa ghi chú" mới nhất của 1 khách (từ chuông thông báo); không có → hộp nhập tay. */
  function openPending(customerId) {
    const c = findCustomer(customerId); if (!c) return;
    const p = pendingCallsOf(c);
    open(p.length ? { customerId, editAt: p[p.length - 1].at } : { customerId });
  }

  async function afterChange(customerId) {
    await refreshList();
    if ($('#lead-modal').open && leadSheetId === customerId) { const c = findCustomer(customerId); if (c) renderLeadSheet(c); }
    if (!$('#detail-screen').hidden && detailId === customerId) openDetail(customerId);
  }

  async function save() {
    const c = findCustomer(st.customerId); if (!c) return;
    if (!st.result) { $('#calllog-error').textContent = 'Chọn kết quả cuộc gọi.'; return; }
    const note = $('#calllog-note').value.trim() || null;
    const attempt = { at: st.at, result: st.result, note, duration: st.duration, origin: st.origin };
    if (st.deviceId) attempt.device_id = st.deviceId;
    if (st.direction) attempt.direction = st.direction;
    let list = callAttemptsOf(c);
    list = st.editAt ? list.map((a) => (a.at === st.editAt ? { ...a, ...attempt } : a)) : list.concat([attempt]);
    const payload = { call_attempts: list };
    const sug = st.sug, mode = st.nextMode;
    const sched = sug && (sug.kind === 'schedule' ? sug : sug.fallback);
    if (mode === 'accept' && sched) { // hẹn theo gợi ý (thay lịch cũ nếu có)
      payload.next_call_at = sched.start.toISOString(); payload.next_call_end = sched.end.toISOString(); payload.next_call_reason = sched.reason;
    } else if (c.next_call_at) { payload.next_call_at = null; payload.next_call_end = null; payload.next_call_reason = null; } // đã gọi → lịch hẹn cũ coi như xong
    const opts = {};
    if (isQualified(c)) {
      // Khách Tiềm năng: ghi thêm 1 mốc vào dòng thời gian chăm sóc (giữ nguyên bậc).
      const dur = formatCallDuration(st.duration);
      payload.care_stage = c.care_stage;
      opts.careStageNote = `📞 gọi ${callStamp(new Date(st.at))}${dur ? ' (' + dur + ')' : ''} — ${CALL_RESULTS[st.result] || st.result}${note ? '. ' + note : ''}`
        + (mode === 'accept' && sched ? ` · hẹn gọi lại ${sched.label}` : '');
      opts.forceLog = true;
    }
    const id = c.id, result = st.result;
    await CRM.update(id, payload, opts);
    $('#call-log-modal').close();
    st = null;
    await afterChange(id);
    if (mode === 'change' || (!window.FOLLOWUP && result === 'busy')) openScheduler(id, { reason: sug && sug.reason });
    else if (mode === 'drop' && sug) { openLeadSheet(id); showDropBox(sug.code); }
    else if (result === 'talked' && !isQualified(findCustomer(id) || {})) showToast('Nếu khách thực sự quan tâm, bấm “Đạt” để chuyển sang Tiềm năng');
    else if (mode === 'accept' && sched) showToast('Đã hẹn gọi lại ' + sched.label);
  }

  async function removePending() {
    const c = findCustomer(st.customerId); if (!c || !st.editAt) return;
    if (!confirm('Xoá cuộc gọi chưa ghi chú này?')) return;
    const id = c.id;
    await CRM.update(id, { call_attempts: callAttemptsOf(c).filter((a) => a.at !== st.editAt) });
    $('#call-log-modal').close(); st = null;
    await afterChange(id);
  }

  $('#calllog-results')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-res]'); if (!b || !st) return;
    st.result = b.dataset.res; st.nextTouched = false; // đổi kết quả → tính lại gợi ý
    $$('#calllog-results .sched-opt').forEach((x) => x.classList.toggle('is-sel', x === b));
    $('#calllog-error').textContent = '';
    syncNoteHint();
    renderNext();
  });
  $('#calllog-save')?.addEventListener('click', save);
  $('#calllog-later')?.addEventListener('click', () => { $('#call-log-modal').close(); st = null; });
  $('#calllog-close')?.addEventListener('click', () => { $('#call-log-modal').close(); st = null; });
  $('#calllog-delete')?.addEventListener('click', removePending);

  // ---- Đường 2: bấm SĐT trong CRM → quay lại app → tự mở hộp (ước lượng thời gian) ----
  // Chỉ mở khi app THỰC SỰ bị rời đi (ẩn/mất focus) trong 15s sau khi bấm, để bấm nhầm
  // (không mở được trình gọi) không bật hộp vô cớ.
  const LEAVE_WINDOW_MS = 15000;
  let outgoing = null; // {id, at, left}
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="tel:"]'); if (!a) return;
    const id = a.dataset.callId; if (!id) return;
    if (deviceSource()) return; // có nhật ký máy (Android) → số liệu chính xác từ đường 3
    outgoing = { id, at: Date.now(), left: null };
  }, true);
  function onLeave() {
    if (outgoing && !outgoing.left && Date.now() - outgoing.at < LEAVE_WINDOW_MS) outgoing.left = Date.now();
  }
  function onBack() {
    if (!outgoing) return;
    if (!outgoing.left) { if (Date.now() - outgoing.at > LEAVE_WINDOW_MS) outgoing = null; return; }
    const o = outgoing; outgoing = null;
    const sec = Math.round((Date.now() - o.at) / 1000);
    if (sec < 3) return;
    open({ customerId: o.id, at: new Date(o.at).toISOString(), estimateSec: sec, origin: 'manual' });
  }

  // ---- Đường 3: CỔNG THIẾT BỊ (vỏ Android) ----
  // Vỏ native gán: window.CRMCallSource = {
  //   fetchSince(ms) → Promise<[{ id, number, startedAt (ms), durationSec, direction: 'out'|'in'|'missed' }]>
  // }
  const LS_SYNC_AT = 'crm_call_sync_at'; // mốc đã đọc nhật ký máy tới (theo từng thiết bị)
  const FIRST_SYNC_LOOKBACK_MS = 24 * 3600 * 1000; // lần đầu: chỉ lấy 24h gần nhất, tránh tràn
  function deviceSource() {
    attachCapacitorSource();
    const s = window.CRMCallSource;
    return s && typeof s.fetchSince === 'function' ? s : null;
  }
  // Vỏ Android (android-app/, Capacitor): tự gắn nguồn từ plugin native "CallLog"
  // (android-app/android/app/src/main/java/vn/sokhach/crm/CallLogPlugin.java). Trình duyệt thường
  // không có window.Capacitor → bỏ qua, web chạy như cũ.
  function attachCapacitorSource() {
    if (window.CRMCallSource) return;
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform() || typeof cap.nativePromise !== 'function') return;
    window.CRMCallSource = {
      native: true,
      fetchSince: async (since) => {
        const r = await cap.nativePromise('CallLog', 'fetchSince', { since });
        return (r && r.calls) || [];
      },
    };
  }
  function customerByNumber(number) {
    const d = phoneDigits(normalizePhoneVN(number));
    if (!d) return null;
    return allCustomers.find((c) => phoneDigits(c.phone) === d) || null;
  }
  /**
   * Ghi các cuộc gọi của thiết bị thành "chưa ghi chú". CHỈ giữ cuộc tới/từ SĐT có trong danh
   * sách khách (cuộc cá nhân bỏ qua, không lưu). Idempotent theo device_id. Trả số cuộc đã thêm.
   */
  async function ingest(calls) {
    const byCustomer = new Map();
    for (const call of (calls || [])) {
      if (!call || call.direction === 'missed') continue; // gọi nhỡ đến: chưa xử lý ở giai đoạn này
      const c = customerByNumber(call.number); if (!c) continue;
      const deviceId = String(call.id ?? call.startedAt);
      if (callAttemptsOf(c).some((a) => a.device_id === deviceId)) continue;
      const list = byCustomer.get(c.id) || [];
      list.push({
        at: new Date(call.startedAt).toISOString(), result: null, note: null,
        duration: Math.max(0, Math.round(Number(call.durationSec) || 0)),
        origin: 'device', device_id: deviceId, direction: call.direction === 'in' ? 'in' : 'out',
      });
      byCustomer.set(c.id, list);
    }
    let added = 0;
    for (const [id, items] of byCustomer) {
      const c = findCustomer(id);
      await CRM.update(id, { call_attempts: callAttemptsOf(c).concat(items) });
      added += items.length;
    }
    if (added) await refreshList();
    return added;
  }
  let syncing = false, syncAgain = false, permWarned = false;
  async function syncDevice() {
    const src = deviceSource(); if (!src || !currentUser) return 0;
    // Đang đọc dở → KHÔNG bỏ yêu cầu mới (trước đây bỏ → có thể sót cuộc gọi): đánh dấu, đọc lại ngay khi xong.
    if (syncing) { syncAgain = true; return 0; }
    syncing = true;
    try {
      let since = 0;
      try {
        // Một lần sau bản sửa lỗi mốc (2026-10-07): lùi mốc 24h để vớt lại cuộc gọi đã bị bỏ sót trước đó.
        if (!localStorage.getItem('crm_call_sync_fix1')) {
          localStorage.setItem('crm_call_sync_fix1', '1');
          localStorage.removeItem(LS_SYNC_AT);
        }
        since = Number(localStorage.getItem(LS_SYNC_AT)) || 0;
      } catch {}
      if (!since) since = Date.now() - FIRST_SYNC_LOOKBACK_MS;
      const calls = await src.fetchSince(since);
      const added = await ingest(calls);
      // Mốc mới = giờ BẮT ĐẦU của cuộc muộn nhất đã đọc (KHÔNG dùng "bây giờ"): Android chỉ ghi cuộc gọi vào nhật
      // ký SAU KHI CÚP MÁY, theo giờ bắt đầu → nếu lấy "bây giờ", cuộc vừa cúp mà máy ghi trễ vài giây sẽ nằm trước
      // mốc và bị bỏ qua vĩnh viễn (lỗi 2026-10-07: khách thứ 2 không tự ghi). Trùng lặp đã chặn theo device_id.
      const latest = (calls || []).reduce((m, c) => Math.max(m, Number(c && c.startedAt) || 0), since);
      try { localStorage.setItem(LS_SYNC_AT, String(latest)); } catch {}
      if (added) autoOpenLatestPending();
      return added;
    } catch (e) {
      console.warn('Đọc nhật ký cuộc gọi lỗi:', e);
      // Chưa cấp quyền → nhắc 1 lần mỗi phiên (cấp lại: Cài đặt › Ứng dụng › Sổ Khách › Quyền).
      if (/permission/i.test(String(e && (e.message || e))) && !permWarned) {
        permWarned = true;
        showToast('Chưa cấp quyền Nhật ký cuộc gọi — vào Cài đặt › Ứng dụng › Sổ Khách › Quyền để bật');
      }
      return 0;
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; setTimeout(syncDevice, 0); }
    }
  }
  // Quay lại app → đọc ngay + đọc lại sau 4s và 12s: cuộc VỪA cúp máy có thể chưa kịp được Android ghi vào nhật ký.
  let resyncTimers = [];
  function syncDeviceSoon() {
    if (!deviceSource()) return;
    resyncTimers.forEach(clearTimeout);
    syncDevice();
    resyncTimers = [4000, 12000].map((ms) => setTimeout(syncDevice, ms));
  }
  // Tự mở hộp cho cuộc chưa ghi chú MỚI NHẤT (nếu không có hộp thoại nào đang mở).
  function autoOpenLatestPending() {
    if (document.querySelector('dialog[open]')) return;
    let best = null;
    for (const c of allCustomers) for (const a of pendingCallsOf(c)) if (!best || a.at > best.a.at) best = { c, a };
    if (best) open({ customerId: best.c.id, editAt: best.a.at });
  }

  // Rời app / quay lại app (điện thoại: visibilitychange; máy tính gọi qua FaceTime: blur/focus).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onLeave();
    else { onBack(); syncDeviceSoon(); }
  });
  window.addEventListener('blur', onLeave);
  window.addEventListener('focus', onBack);
  window.addEventListener('crm:resume', syncDeviceSoon); // vỏ Android báo app vừa mở lại (MainActivity.onResume)

  window.CallLog = { open, openPending };
  // API cho vỏ native / dịch vụ nền sau này.
  window.CRMCalls = { ingest, sync: syncDevice, SHORT_CALL_SEC, CALL_RESULT_SETS };
})();
