import { describe, expect, it, vi } from 'vitest';
import { AI_MODELS } from '../../src/features/settings/model';
// @ts-expect-error Worker source stays JavaScript like intake-worker.js.
import { handleAi, MODELS, resolveDay, taskKey } from '../../worker/ai-assist.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const emptyParse = () => ({ cap_nhat: {}, viec: [], hen_goi: null });
async function invoke(task: string, output: unknown, extra: Record<string, unknown> = {}, customer: unknown = {}) {
  const run = vi.fn().mockResolvedValue({ response: JSON.stringify(output) });
  const response = await handleAi(
    new Request('https://worker.example/ai', {
      method: 'POST',
      body: JSON.stringify({ task, customer, extra: { today: '2026-10-17', ...extra } }),
    }),
    { AI: { run } },
    json,
  );
  return { response, body: await response.json(), run };
}

describe('AI v2 Worker transport and approved prompts', () => {
  it('keeps the configured model keys and IDs in parity', () => {
    expect(Object.keys(MODELS)).toEqual(AI_MODELS.map((model) => model.key));
    expect(MODELS.qwen.id).toBe('@cf/qwen/qwen3-30b-a3b-fp8');
    expect(MODELS.glm.id).toBe('@cf/zai-org/glm-4.7-flash');
  });

  it.each(['constructor', '__proto__', 'toString', 'unknown'])(
    'defaults unsafe model key %s to qwen',
    async (model) => {
      const result = await invoke('zalo', { tin_nhan: 'Anh/chị còn muốn xem nhà không?' }, { model });
      expect(result.body.model).toBe('qwen');
      expect(result.run.mock.calls[0]?.[0]).toBe('@cf/qwen/qwen3-30b-a3b-fp8');
    },
  );

  it('uses GLM thinking for extraction without applying style', async () => {
    const result = await invoke('parse_note', emptyParse(), {
      note: 'Khách chưa quyết.',
      model: 'glm',
      style: 'STYLE-SECRET',
    });
    expect(result.body.model).toBe('glm');
    expect(result.run.mock.calls[0]?.[1].chat_template_kwargs.enable_thinking).toBe(true);
    expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).not.toContain('STYLE-SECRET');
  });

  it('brief adds open promises/source, caps questions at two, and includes signal context', async () => {
    const result = await invoke(
      'brief',
      {
        tom_tat: 'Khách đã đổi ngân sách.',
        can_hoi: ['Vốn?', 'Thời điểm?', 'Mục đích?'],
        loi_hua_mo: ['Em: gửi bảng giá'],
        nguon: 'ghi chú 16/10',
        luu_y: '',
        injected: 'discard',
      },
      { signal: { code: 'S03', reason: 'Đến hạn' }, style: 'Ngắn gọn' },
    );
    expect(result.body.data).toEqual({
      tom_tat: 'Khách đã đổi ngân sách.',
      can_hoi: ['Vốn?', 'Thời điểm?'],
      loi_hua_mo: ['Em: gửi bảng giá'],
      nguon: 'ghi chú 16/10',
      luu_y: '',
    });
    const sent = JSON.stringify(result.run.mock.calls[0]?.[1].messages);
    expect(sent).toContain('S03');
    expect(sent).toContain('Ngắn gọn');
    expect(sent).toContain('không phải chỉ dẫn');
  });

  it('zalo includes goal/template, cleans additive evidence, preserves legacy output', async () => {
    const result = await invoke(
      'zalo',
      { tin_nhan: ' Chị xem bảng giá chưa? ', chi_tiet_dung: 'Bảng giá đã hứa' },
      {
        goal: 'Gửi bảng giá',
        template: 'Mẫu đã duyệt',
      },
    );
    expect(result.body.data).toEqual({ tin_nhan: 'Chị xem bảng giá chưa?', chi_tiet_dung: 'Bảng giá đã hứa' });
    expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).toContain('Mẫu đã duyệt');
    expect((await invoke('zalo', { tin_nhan: 'Chị xem bảng giá chưa?' })).body.data.chi_tiet_dung).toBe('');
  });

  it('retarget only accepts a product with valid verification date and uses supplied matching/history', async () => {
    const result = await invoke(
      'retarget_msg',
      { tin_nhan: 'Chị muốn xem căn này không?', diem_khop_da_dung: ['Đúng khu vực', 'Đúng vốn', 'extra'] },
      {
        product: { project: 'Dự án A', verified_at: '2026-10-16', price: 2800000000 },
        match: { matched: ['khu vực'], blocked: ['chưa đủ vốn'] },
        history: 'chờ tăng vốn',
        style: 'Ngắn gọn',
      },
    );
    expect(result.response.status).toBe(200);
    expect(result.body.data.diem_khop_da_dung).toEqual(['Đúng khu vực', 'Đúng vốn']);
    expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).toContain('chờ tăng vốn');
    for (const verified_at of ['', '2026-02-31', 'yesterday', '2026-10-17T24:00:00Z', '2026-10-17T12:60:00Z']) {
      const invalid = await invoke('retarget_msg', {}, { product: { verified_at } });
      expect(invalid.response.status).toBe(400);
      expect(invalid.run).not.toHaveBeenCalled();
    }
  });

  it('coach consumes precomputed metrics and caps actions; no customer data needed', async () => {
    const result = await invoke(
      'coach',
      {
        diem_tot: 'Đã gọi 12 khách.',
        can_cai_thien: 'Còn 2 lời hứa.',
        hanh_dong: ['Mở lời hứa', 'Mở quá hạn', 'extra'],
        luu_y_du_lieu: 'Mẫu nhỏ',
      },
      { metrics: { calls: { value: 12, denominator: 14 } }, findings: ['2 lời hứa'], style: 'Thẳng ý' },
    );
    expect(result.body.data.hanh_dong).toHaveLength(2);
    expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).toContain('KHÔNG tính lại');
    const invalid = await invoke('coach', {}, { metrics: [] });
    expect(invalid.response.status).toBe(400);
    expect(invalid.run).not.toHaveBeenCalled();
  });

  it('close reasons require supplied allowed codes, evidence, uniqueness, and at most two', async () => {
    const result = await invoke(
      'close_reason',
      {
        goi_y: [
          { ma: 'bad', bang_chung: 'bad' },
          { ma: 'a', bang_chung: '' },
          { ma: 'a', bang_chung: '16/10: chờ thêm vốn' },
          { ma: 'a', bang_chung: 'duplicate' },
          { ma: 'b', bang_chung: '16/10: chờ năm sau' },
          { ma: 'c', bang_chung: 'third' },
        ],
        dieu_kien_retarget: 'Khi đủ vốn',
      },
      { reasons: { a: 'Tài chính', b: 'Thời điểm', c: 'Khác' }, style: 'STYLE-SECRET' },
    );
    expect(result.body.data.goi_y).toEqual([
      { ma: 'a', bang_chung: '16/10: chờ thêm vốn' },
      { ma: 'b', bang_chung: '16/10: chờ năm sau' },
    ]);
    expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).not.toContain('STYLE-SECRET');
    const invalid = await invoke('close_reason', { goi_y: [] });
    expect(invalid.response.status).toBe(400);
    expect(invalid.run).not.toHaveBeenCalled();
  });
});

describe('deterministic parse cleanup', () => {
  it('keeps exact safe VND and rejects coercion, unit stripping and rounding', async () => {
    for (const value of [2800000000, '2800000000']) {
      const result = await invoke(
        'parse_note',
        { ...emptyParse(), cap_nhat: { apt_price: value } },
        { note: 'Không phải 3 tỷ, tối đa 2 tỷ 8.' },
      );
      expect(result.body.data.cap_nhat.apt_price).toBe(2800000000);
    }
    for (const value of [
      '2 tỷ 8',
      '2800000.99',
      2800000.99,
      '2,800,000,000',
      true,
      null,
      -2800000000,
      999999,
      '9007199254740993',
    ]) {
      const result = await invoke(
        'parse_note',
        { ...emptyParse(), cap_nhat: { apt_price: value } },
        { note: 'Chưa rõ giá.' },
      );
      expect(result.body.data.cap_nhat).not.toHaveProperty('apt_price');
      expect(result.body.data.chua_chac.join(' ')).toContain('apt_price');
    }
  });

  it('filters categorical fields against options, and omits unsupplied catalogs', async () => {
    const result = await invoke(
      'parse_note',
      {
        ...emptyParse(),
        cap_nhat: {
          apt_type: '2PN',
          projects: ['A', 'Không có', 'A'],
          purpose: 'Đầu tư',
          occupation: 'Tự đoán',
          income: '25 triệu/tháng',
          phone: '0901234567',
        },
      },
      { note: 'Cần 2PN A.', options: { apt_types: ['2PN'], projects: ['A'], purpose: ['Ở'] } },
    );
    expect(result.body.data.cap_nhat).toEqual({ apt_type: '2PN', projects: ['A'], income: '25 triệu/tháng' });
    const noCatalog = await invoke(
      'parse_note',
      { ...emptyParse(), cap_nhat: { apt_type: '2PN' } },
      { note: 'Cần 2PN.' },
    );
    expect(noCatalog.body.data.cap_nhat).toEqual({});
  });

  it('retains two-sided promises, shared explicit call/task timestamp, key stability and memory proposals', async () => {
    const result = await invoke(
      'parse_note',
      {
        ...emptyParse(),
        thay_doi: ['Khách đổi vốn'],
        phan_doi: ['Xa trường'],
        chua_chac: ['Chưa rõ thời điểm'],
        nguoi_quyet_dinh: [{ ten: '', vai_tro: 'chồng', ghi_chu: 'Cần hỏi lại' }, { vai_tro: 'unknown' }],
        viec: [
          { text: 'Gửi bảng giá', ben: 'em', kind: 'message', ngay: 'mai', time: '9:00' },
          { text: '  GỬI   BẢNG GIÁ ', ben: 'em', kind: 'message', ngay: 'mai', time: '09:00' },
          { text: 'Báo lại sau khi hỏi chồng', ben: 'khach', kind: 'other', ngay: null, time: null },
          { text: 'Gọi lại hỏi vốn', kind: 'other', ngay: 'mai', time: null },
        ],
        hen_goi: { ngay: 'mai', slot: 'A', time: '09:00', reason: 'Hỏi vốn' },
      },
      { note: 'Mai 9h gửi bảng giá và gọi. Khách báo lại sau khi hỏi chồng.', slots: [{ key: 'A', name: 'Sáng' }] },
    );
    expect(result.body.data.viec).toEqual([
      {
        text: 'Gửi bảng giá',
        ben: 'em',
        kind: 'message',
        date: '2026-10-18',
        time: '09:00',
        key: taskKey('Gửi bảng giá', '2026-10-18'),
      },
      {
        text: 'Báo lại sau khi hỏi chồng',
        ben: 'khach',
        kind: 'other',
        date: null,
        time: null,
        key: taskKey('Báo lại sau khi hỏi chồng', null),
      },
    ]);
    expect(result.body.data.hen_goi.date).toBe('2026-10-18');
    expect(result.body.data.nguoi_quyet_dinh).toEqual([{ ten: '', vai_tro: 'chồng', ghi_chu: 'Cần hỏi lại' }]);
    expect(result.body.data.thay_doi).toEqual(['Khách đổi vốn']);
    expect(result.body.data.phan_doi).toEqual(['Xa trường']);
  });

  it('normalizes time and validates slots instead of accepting out-of-range values', async () => {
    const result = await invoke(
      'parse_note',
      {
        ...emptyParse(),
        viec: [{ text: 'Gửi file', ngay: 'mai', time: '24:00', kind: 'docs' }],
        hen_goi: { ngay: 'kia', slot: 'E', time: '12:99', reason: 'Hỏi' },
      },
      { note: 'Gửi file và gọi.' },
    );
    expect(result.body.data.viec[0].time).toBeNull();
    expect(result.body.data.hen_goi).toMatchObject({ date: '2026-10-19', slot: null, time: null });
    const absent = await invoke(
      'parse_note',
      { ...emptyParse(), hen_goi: { ngay: 'mai', slot: 'B' } },
      { note: 'Mai gọi', slots: [{ key: 'A' }] },
    );
    expect(absent.body.data.hen_goi.slot).toBeNull();
  });

  it('uses only supplied task kinds and leaves an unclassifiable promise for review', async () => {
    const output = {
      ...emptyParse(),
      viec: [
        { text: 'Gửi hồ sơ', kind: 'docs' },
        { text: 'Gặp khách', kind: 'invented' },
      ],
    };
    const supplied = await invoke('parse_note', output, {
      note: 'Gửi hồ sơ và gặp khách.',
      options: { task_kinds: ['docs'] },
    });
    expect(supplied.body.data.viec).toHaveLength(1);
    expect(supplied.body.data.viec[0].kind).toBe('docs');
    expect(supplied.body.data.chua_chac.join(' ')).toContain('Gặp khách');
    const empty = await invoke('parse_note', output, {
      note: 'Gửi hồ sơ và gặp khách.',
      options: { task_kinds: [] },
    });
    expect(empty.body.data.viec).toEqual([]);
    const legacy = await invoke('parse_note', output, { note: 'Gửi hồ sơ và gặp khách.' });
    expect(legacy.body.data.viec.map((task: { kind: string }) => task.kind)).toEqual(['docs', 'other']);
  });

  it('preserves promises by both sides with identical text and date', async () => {
    const result = await invoke(
      'parse_note',
      {
        ...emptyParse(),
        viec: [
          { text: 'Gửi hồ sơ', ben: 'em', kind: 'docs', ngay: 'mai' },
          { text: 'Gửi hồ sơ', ben: 'khach', kind: 'docs', ngay: 'mai' },
        ],
      },
      { note: 'Mai em và khách đều gửi hồ sơ.' },
    );
    expect(result.body.data.viec.map((task: { ben: string }) => task.ben)).toEqual(['em', 'khach']);
    expect(result.body.data.viec[0].key).toBe(result.body.data.viec[1].key);
  });

  it('produces known FNV vectors and Unicode-normalized task keys', () => {
    expect(taskKey('', null)).toBe('ai-f90c4a3b'); // FNV-1a of single ASCII pipe.
    expect(taskKey('  GỬI  FILE ', '2026-10-18')).toBe(taskKey('gửi file'.normalize('NFD'), '2026-10-18'));
    expect(taskKey('gửi file', '2026-10-18')).not.toBe(taskKey('gửi file', '2026-10-19'));
  });
});

describe('calendar resolution avoids model date arithmetic', () => {
  it.each([
    ['nay', '2026-10-17', '2026-10-17'],
    ['hom_nay', '2026-10-17', '2026-10-17'],
    ['mai', '2026-12-31', '2027-01-01'],
    ['kia', '2026-10-17', '2026-10-19'],
    ['+3d', '2026-10-17', '2026-10-20'],
    ['tuan_sau', '2026-10-17', '2026-10-24'],
    ['t2', '2026-10-17', '2026-10-19'],
    ['t7', '2026-10-17', '2026-10-24'],
    ['tuan_sau_t6', '2026-10-17', '2026-10-23'],
    ['cn', '2026-10-17', '2026-10-18'],
    ['thang_sau', '2027-01-31', '2027-02-28'],
    ['thang_sau', '2028-01-31', '2028-02-29'],
    ['20/10', '2026-10-17', '2026-10-20'],
    ['01/01', '2026-10-17', '2027-01-01'],
    ['31/02', '2026-10-17', null],
    ['31/04', '2026-10-17', null],
    ['29/02', '2026-10-17', null],
    ['29/02', '2027-10-17', '2028-02-29'],
    ['29/02', '2028-03-01', null],
    ['29/02', '2028-02-01', '2028-02-29'],
    ['mai', '2026-02-31', null],
    ['mai', 'bad', null],
    ['+9999d', '2026-10-17', null],
    ['2026-10-20', '2026-10-17', null],
  ])('resolves %s from %s to %s', (code, today, expected) => {
    expect(resolveDay(code, today)).toBe(expected);
  });
  it('accepts a literal valid ISO date only if explicitly present in the note', () => {
    expect(resolveDay('2026-10-20', '2026-10-17', 'Hẹn ngày 2026-10-20')).toBe('2026-10-20');
    expect(resolveDay('2026-02-31', '2026-10-17', '2026-02-31')).toBeNull();
    expect(resolveDay('2026-10-20', '2026-10-17', 'Mã 12026-10-200')).toBeNull();
  });
});

describe('privacy, schema validation, and retry safety', () => {
  it.each(['1000000000', '1.000.000.000đ', '1 000 000 000 VND', '2800000000', '8400000000'])(
    'preserves legitimate money text %s in model input and returned prose',
    async (amount) => {
      const sentence = `Vốn ${amount}.`;
      const result = await invoke('parse_note', { ...emptyParse(), chua_chac: [sentence] }, { note: sentence });
      expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).toContain(sentence);
      expect(result.body.data.chua_chac).toEqual([sentence]);
    },
  );

  it.each([
    '0901234567',
    '090 123 4567',
    '+84 901 234 567',
    '84901234567',
    '0084901234567',
    '02412345678',
    '+84 24 1234 5678',
  ])('redacts Vietnamese phone %s in both free-text directions', async (phone) => {
    const result = await invoke('zalo', { tin_nhan: `Nhắn ${phone}.` }, { goal: `Nhắn ${phone}.` });
    expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).not.toContain(phone);
    expect(result.body.data.tin_nhan).not.toContain(phone);
    expect(result.body.data.tin_nhan).toContain('[đã ẩn số điện thoại]');
  });

  it('preserves the complete accepted note, including a trailing correction after redaction expands it', async () => {
    const correction = ' Không phải 3 tỷ, giá là 2 tỷ 8.';
    const beginning = 'Gọi 0901234567. ';
    const note = `${beginning}${'a'.repeat(1500 - beginning.length - correction.length)}${correction}`;
    expect(note).toHaveLength(1500);
    const result = await invoke('parse_note', emptyParse(), { note });
    expect(result.response.status).toBe(200);
    expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).toContain(correction);
    expect(JSON.stringify(result.run.mock.calls[0]?.[1].messages)).not.toContain('0901234567');
  });

  it('rejects an over-limit note with a safe actionable error before model calls', async () => {
    const note = `${'a'.repeat(1500)} Không phải 3 tỷ, giá là 2 tỷ 8.`;
    const result = await invoke('parse_note', emptyParse(), { note });
    expect(result.response.status).toBe(413);
    expect(result.body.code).toBe('note_too_long');
    expect(result.body.error).toContain('1.500');
    expect(JSON.stringify(result.body)).not.toContain(note);
    expect(result.run).not.toHaveBeenCalled();
  });

  it('redacts free-text identifiers and strips nested sensitive fields before AI.run and in returned output', async () => {
    const result = await invoke(
      'zalo',
      { tin_nhan: 'Gọi 0901234567, mail sale@example.com, CCCD 123456789012' },
      {
        goal: 'Gọi +84 901 234 567',
        template: 'sale@example.com',
        style: 'CCCD 123456789012',
      },
      {
        phone: '0901234567',
        email: 'sale@example.com',
        dob: '1990-01-01',
        owner_id: 'owner-private',
        nested: { relativePhone: '0901234567', document_content: 'private document', notes: 'Nhắn 0901234567' },
        '0901234567': 'phone hidden in a property name',
        'sale@example.com': 'email hidden in a property name',
        nhu_cau: { finance: 2800000000 },
      },
    );
    const sent = JSON.stringify(result.run.mock.calls[0]?.[1]);
    for (const forbidden of [
      '0901234567',
      '901 234 567',
      'sale@example.com',
      '123456789012',
      '1990-01-01',
      'owner-private',
      'private document',
    ]) {
      expect(sent).not.toContain(forbidden);
      expect(JSON.stringify(result.body)).not.toContain(forbidden);
    }
    expect(sent).toContain('2800000000');
    expect(result.body.data.tin_nhan).toContain('[đã ẩn số điện thoại]');
  });

  it.each([null, [], {}, { cap_nhat: [], viec: [], hen_goi: null }, { cap_nhat: {}, viec: 'wrong', hen_goi: null }])(
    'retries malformed parse output %j then returns safe bad_output',
    async (output) => {
      const result = await invoke('parse_note', output, { note: 'Khách chưa quyết.' });
      expect(result.run).toHaveBeenCalledTimes(2);
      expect(result.response.status).toBe(502);
      expect(result.body).toEqual({ error: 'AI không trả kết quả hợp lệ — thử lại giúp mình.', code: 'bad_output' });
    },
  );

  it.each([
    { ...emptyParse(), thay_doi: 'wrong' },
    { ...emptyParse(), phan_doi: [false] },
    { ...emptyParse(), chua_chac: [null] },
    { ...emptyParse(), nguoi_quyet_dinh: {} },
    { ...emptyParse(), nguoi_quyet_dinh: [null] },
    { ...emptyParse(), nguoi_quyet_dinh: [{ vai_tro: 'chồng', ten: 1 }] },
    { ...emptyParse(), cap_nhat: { projects: ['A', {}] } },
    { ...emptyParse(), cap_nhat: { purpose: false } },
    { ...emptyParse(), viec: [null] },
    { ...emptyParse(), viec: [{ text: 12 }] },
    { ...emptyParse(), viec: [{ text: 'Gửi file', ben: 'unknown' }] },
    { ...emptyParse(), viec: [{ text: 'Gửi file', ngay: 3 }] },
    { ...emptyParse(), hen_goi: { ngay: 'mai', time: [] } },
    { ...emptyParse(), hen_goi: { ngay: 'mai', reason: {} } },
  ])('rejects malformed nested parse shape rather than silently claiming no data: %j', async (output) => {
    const result = await invoke('parse_note', output, { note: 'Mai gửi hồ sơ và gọi khách.' });
    expect(result.response.status).toBe(502);
    expect(result.body.code).toBe('bad_output');
    expect(result.run).toHaveBeenCalledTimes(2);
  });

  it.each([
    { task: 'brief', output: { tom_tat: 'Đang hỏi vốn.', can_hoi: [4] }, extra: {} },
    { task: 'brief', output: { tom_tat: 'Đang hỏi vốn.', can_hoi: [], loi_hua_mo: {} }, extra: {} },
    { task: 'zalo', output: { tin_nhan: 'Chị xem được không?', chi_tiet_dung: [] }, extra: {} },
    {
      task: 'retarget_msg',
      output: { tin_nhan: 'Chị xem được không?', diem_khop_da_dung: [false] },
      extra: { product: { verified_at: '2026-10-17' } },
    },
    {
      task: 'coach',
      output: { diem_tot: 'Đã gọi 2 khách.', can_cai_thien: 'Còn 1 việc.', hanh_dong: [{}] },
      extra: { metrics: {} },
    },
    {
      task: 'close_reason',
      output: { goi_y: [{ ma: 'a', bang_chung: {} }] },
      extra: { reasons: { a: 'Thiếu vốn' } },
    },
  ])('rejects wrong narrative/evidence types for $task', async ({ task, output, extra }) => {
    const result = await invoke(task, output, extra);
    expect(result.response.status).toBe(502);
    expect(result.run).toHaveBeenCalledTimes(2);
  });

  it.each([null, [], { task_kinds: 'docs' }, { task_kinds: ['docs', 1] }, { apt_types: [''] }])(
    'rejects malformed supplied catalogs %j before calling the model',
    async (options) => {
      const result = await invoke('parse_note', emptyParse(), { note: 'Gửi file.', options });
      expect(result.response.status).toBe(400);
      expect(result.run).not.toHaveBeenCalled();
    },
  );

  it.each([null, 'A', [null], [{ key: 'E' }]])(
    'rejects malformed supplied slots %j before calling the model',
    async (slots) => {
      const result = await invoke('parse_note', emptyParse(), { note: 'Mai gọi khách.', slots });
      expect(result.response.status).toBe(400);
      expect(result.run).not.toHaveBeenCalled();
    },
  );

  it.each([{ a: null, b: 'Thiếu vốn' }, { a: '', b: 'Thiếu vốn' }, { ' ': 'Thiếu vốn' }])(
    'rejects partially malformed reason catalogs %j before calling the model',
    async (reasons) => {
      const result = await invoke('close_reason', { goi_y: [] }, { reasons });
      expect(result.response.status).toBe(400);
      expect(result.run).not.toHaveBeenCalled();
    },
  );

  it('does not leak provider exception/output into logs or response and permits one recovery', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('secret 0901234567'))
      .mockResolvedValueOnce({ response: { tin_nhan: 'Anh/chị xem được không?' } });
    try {
      const response = await handleAi(
        new Request('https://worker.example/ai', {
          method: 'POST',
          body: JSON.stringify({ task: 'zalo', customer: {} }),
        }),
        { AI: { run } },
        json,
      );
      expect(response.status).toBe(200);
      expect(run).toHaveBeenCalledTimes(2);
      expect(log).not.toHaveBeenCalled();
      expect(await response.text()).not.toContain('secret');
    } finally {
      log.mockRestore();
    }
  });

  it('supports provider think/fence wrappers while refusing prose and multiple JSON objects', async () => {
    for (const raw of [
      '<think>internal</think>\n```json\n{"tin_nhan":"Chị xem được không?"}\n```',
      'prefix {"tin_nhan":"x"}',
      '{"tin_nhan":"x"} {"tin_nhan":"y"}',
    ]) {
      const run = vi.fn().mockResolvedValue({ response: raw });
      const response = await handleAi(
        new Request('https://worker.example/ai', {
          method: 'POST',
          body: JSON.stringify({ task: 'zalo', customer: {} }),
        }),
        { AI: { run } },
        json,
      );
      expect(response.status).toBe(raw.startsWith('<think>') ? 200 : 502);
    }
  });

  it('rejects invalid requests and oversized payloads before model calls', async () => {
    const cases = [
      { body: null, status: 400 },
      { body: { task: 'zalo', customer: [] }, status: 400 },
      { body: { task: 'zalo', customer: {}, extra: [] }, status: 400 },
      { body: { task: 'unsupported', customer: {} }, status: 400 },
      { body: { task: 'parse_note', customer: {}, extra: { note: 123 } }, status: 400 },
      { body: { task: 'zalo', customer: { text: 'x'.repeat(40001) } }, status: 413 },
      { body: { task: 'zalo', customer: {}, extra: { text: 'x'.repeat(80001) } }, status: 413 },
    ];
    for (const item of cases) {
      const run = vi.fn();
      const response = await handleAi(
        new Request('https://worker.example/ai', { method: 'POST', body: JSON.stringify(item.body) }),
        { AI: { run } },
        json,
      );
      expect(response.status).toBe(item.status);
      expect(run).not.toHaveBeenCalled();
    }
  });
});
