  -- Migration: CHUẨN HOÁ loại căn viết TỰ DO (hay gặp từ OCR) về giá trị chuẩn — 2026-10-07.
  --
  -- Bổ sung cho normalize_apt_type.sql (chỉ khớp khác dấu cách/phẩy). File này đọc thêm cách viết tự do:
  --   "2 ngủ" / "2N" / "2PN" / "2 phòng ngủ" / "2BR" → 2N-2WC      "2 ngủ+" / "2PN+" / "2N cộng" → 2N+, 2WC
  --   "2PN Góc" / "căn góc 2 ngủ" → 2N-2WC-G      "3 ngủ" / "3PN" → 3N-2WC      "1 ngủ" → 1N-1WC   "studio" → Studio
  -- Ghi số WC KHÁC mặc định (vd "3N-3WC") hoặc giá trị lạ (vd "Shophouse") → GIỮ NGUYÊN.
  -- Cùng logic với canonicalAptType() trong js/app.js.
  --
  -- Cách chạy: Supabase → SQL Editor. Chạy PHẦN 1 (tạo hàm) + PHẦN 2 (xem trước) → thấy đúng thì chạy PHẦN 3.
  -- An toàn chạy lại nhiều lần.
  
  -- ---- PHẦN 1: hàm chuẩn hoá ----
  create or replace function public.canonical_apt_type(raw text)
  returns text language plpgsql immutable as $$
  declare
    canon_list text[] := array['Studio','1N-1WC','1N+, 1WC','2N-2WC','2N+, 2WC','2N-2WC-G','3N-2WC'];
    c text; t text; m text[]; w text[]; n int; plus boolean; corner boolean; res text;
  begin
    if raw is null or btrim(raw) = '' then return raw; end if;
    -- 1) Khớp dạng chuẩn, bỏ qua dấu cách/phẩy/gạch & hoa thường.
    foreach c in array canon_list loop
      if regexp_replace(lower(c), '[^a-z0-9+]', '', 'g') = regexp_replace(lower(raw), '[^a-z0-9+]', '', 'g') then return c; end if;
    end loop;
    -- 2) Cách viết tự do: bỏ dấu tiếng Việt rồi đọc số phòng ngủ / dấu + / góc.
    t := translate(lower(btrim(raw)), 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd');
    if t ~ 'studio' then return 'Studio'; end if;
    m := regexp_match(t, '([0-9])\s*(p\.?\s*n|phong\s*ngu|ngu|n|br|bedrooms?|beds?)\M\s*(\+|cong\M|plus)?');
    if m is null then return btrim(raw); end if;
    n := m[1]::int;
    plus := m[3] is not null;
    corner := t ~ 'goc' or t ~ '(^|[[:space:]\-(])g\)?$';
    res := case
      when corner and not plus and n = 2 then '2N-2WC-G'
      when corner then null
      when plus and n = 1 then '1N+, 1WC'
      when plus and n = 2 then '2N+, 2WC'
      when plus then null
      when n = 1 then '1N-1WC'
      when n = 2 then '2N-2WC'
      when n = 3 then '3N-2WC'
    end;
    if res is null then return btrim(raw); end if;
    w := regexp_match(t, '([0-9])\s*(wc|vs|ve\s*sinh|toilet)');
    if w is not null and position(w[1] || 'WC' in res) = 0 then return btrim(raw); end if;
    return res;
  end $$;
  
  -- ---- PHẦN 2: XEM TRƯỚC (chỉ đọc) ----
  select apt_type as hien_tai, public.canonical_apt_type(apt_type) as se_thanh, count(*) as so_khach
  from public.customers
  where apt_type is not null and apt_type is distinct from public.canonical_apt_type(apt_type)
  group by 1, 2 order by 3 desc;
  
  -- ---- PHẦN 3: CHUẨN HOÁ ----
  update public.customers
  set apt_type = public.canonical_apt_type(apt_type)
  where apt_type is not null and apt_type is distinct from public.canonical_apt_type(apt_type);
