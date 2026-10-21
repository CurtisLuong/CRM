// @vitest-environment node
// PF-05: dấu tiếng Việt thu hẹp kết quả — không dấu = tìm rộng, có dấu = khớp đúng dấu.
import { describe, expect, it } from 'vitest';
import { compile, highlight, match, prepare, type SearchScope } from '@/domain/search';

// Số chuẩn của luật 2 (Curtis 2026-10-21).
const NAMES = ['Nguyễn Văn Dung', 'Trần Dũng', 'Lê Dụng', 'Phạm Dừng', 'Võ Đức', 'Hà Duc'];
const docs = NAMES.map((name) => ({ name, doc: prepare([['Tên', name]]) }));

const hits = (q: string, scope: SearchScope = 'all') =>
  docs.filter((x) => match(x.doc, compile(q, scope)).match).map((x) => x.name);
const fuzzyOf = (q: string, name: string) =>
  match(docs.find((x) => x.name === name)?.doc as ReturnType<typeof prepare>, compile(q)).fuzzy;

describe('luật 2 — số chuẩn', () => {
  it('không dấu tìm rộng: Dung → Dung, Dũng, Dụng, Dừng', () => {
    const expected = ['Nguyễn Văn Dung', 'Trần Dũng', 'Lê Dụng', 'Phạm Dừng'];
    expect(hits('Dung')).toEqual(expected);
    expect(hits('dung')).toEqual(expected);
    expect(hits('DUNG')).toEqual(expected);
  });

  it('có dấu thu hẹp đúng chữ: Dũng / Dụng', () => {
    expect(hits('Dũng')).toEqual(['Trần Dũng']);
    expect(hits('dũng')).toEqual(['Trần Dũng']);
    expect(hits('DŨNG')).toEqual(['Trần Dũng']);
    expect(hits('Dũng'.normalize('NFD'))).toEqual(['Trần Dũng']);
    expect(hits('Dụng')).toEqual(['Lê Dụng']);
    expect(hits('Dừng')).toEqual(['Phạm Dừng']);
  });

  it('đ là ký tự có dấu: Đức chỉ khớp Đức, Duc khớp cả Đức và Duc', () => {
    expect(hits('Duc')).toEqual(['Võ Đức', 'Hà Duc']);
    expect(hits('Đức')).toEqual(['Võ Đức']);
    expect(hits('Đuc')).toEqual(['Võ Đức']);
    expect(hits('duc')).toEqual(['Võ Đức', 'Hà Duc']);
  });

  it('giữ nguyên phạm vi và điểm xếp hạng cho từ khoá không dấu', () => {
    expect(hits('Dung', 'name')).toEqual(['Nguyễn Văn Dung', 'Trần Dũng', 'Lê Dụng', 'Phạm Dừng']);
    expect(match(docs[0]?.doc as ReturnType<typeof prepare>, compile('Dung')).score).toBeGreaterThan(0);
  });
});

describe('luật 3 — gần đúng chỉ cho từ khoá không dấu', () => {
  it('Dũnh không ra Dũng', () => {
    expect(hits('Dũnh')).toEqual([]);
    expect(match(docs[1]?.doc as ReturnType<typeof prepare>, compile('Dũnh')).fuzzy).toBe(false);
  });

  it('Dunh vẫn ra Dung/Dũng/Dụng/Dừng như cũ', () => {
    expect(hits('Dunh')).toEqual(['Nguyễn Văn Dung', 'Trần Dũng', 'Lê Dụng', 'Phạm Dừng']);
    expect(fuzzyOf('Dunh', 'Trần Dũng')).toBe(true);
  });
});

describe('luật 4 — cụm ngoặc kép và highlight giữ luật dấu', () => {
  const byName = (name: string) => prepare([['Tên', name]]);

  it('cụm trong ngoặc kép áp luật dấu cho từng ký tự', () => {
    const tranDung = byName('Trần Dũng');
    expect(match(tranDung, compile('"Trần Dũng"')).match).toBe(true);
    expect(match(tranDung, compile('"Trần Dung"')).match).toBe(true);
    expect(match(tranDung, compile('"Dũng"')).match).toBe(true);
    expect(match(tranDung, compile('"Dụng"')).match).toBe(false);
    expect(match(byName('Nguyễn Văn Dung'), compile('"Trần Dũng"')).match).toBe(false);
    expect(match(byName('Nguyễn Văn Dung'), compile('"Văn Dũng"')).match).toBe(false);
  });

  it('highlight bôi đúng chữ gốc đã khớp, không bôi chữ khác dấu', () => {
    expect(highlight('Trần Dũng', ['Dũng'])).toBe('Trần <mark>Dũng</mark>');
    expect(highlight('Trần Dũng', ['dũng'])).toBe('Trần <mark>Dũng</mark>');
    expect(highlight('Nguyễn Văn Dung', ['Dũng'])).toBe('Nguyễn Văn Dung');
    expect(highlight('Trần Dũng', ['Dùng'])).toBe('Trần Dũng');
    expect(highlight('Võ Đức', ['Đức'])).toBe('Võ <mark>Đức</mark>');
    expect(highlight('Hà Duc', ['Đức'])).toBe('Hà Duc');
  });

  it('highlight từ khoá không dấu vẫn bôi rộng như cũ', () => {
    expect(highlight('Trần Dũng', ['dung'])).toBe('Trần <mark>Dũng</mark>');
    expect(highlight('Hương'.normalize('NFD'), ['hu'])).toBe('<mark>Hư</mark>ơng');
  });

  it('match trả highlights như cũ (bản bỏ dấu); highlight() tự giữ dấu khi bôi', () => {
    expect(match(byName('Trần Dũng'), compile('Dung')).highlights).toEqual(['dung']);
  });
});

describe('bất biến — gõ đúng chữ thì luôn tìm thấy', () => {
  it.each([...NAMES, 'Đặng Thuỳ Linh', 'Nguyễn Thị Hương', 'Lê Văn Đông', 'Phạm Thị Ánh'])(
    'tên %s: NFC, NFD, hoa/thường đều khớp chính nó',
    (name) => {
      const doc = prepare([['Tên', name]]);
      for (const q of [name, name.toLowerCase(), name.toUpperCase(), name.normalize('NFD')])
        expect(match(doc, compile(q)).match).toBe(true);
    },
  );

  it('bí danh căn vẫn chạy: 2PN tìm 2 phòng ngủ, 2N+, 2WC tìm 2N-2WC', () => {
    expect(match(prepare([['Tên', '2 phòng ngủ']]), compile('2PN')).match).toBe(true);
    expect(match(prepare([['Tên', '2N+, 2WC']]), compile('2N+, 2WC')).match).toBe(true);
  });
});
