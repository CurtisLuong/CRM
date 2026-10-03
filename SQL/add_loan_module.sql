-- =====================================================================
--  Migration: Module "Tính khoản vay NOXH" (js/loan/*) — Supabase schema
--  Tạo bảng MỚI, không đụng bảng customers / project_options có sẵn.
--  Cách chạy: Supabase Dashboard → SQL Editor → New query → dán toàn bộ → Run
--  Chạy lại nhiều lần vẫn an toàn (IF NOT EXISTS / ON CONFLICT).
--  Giả định CRM đăng nhập bằng Supabase Auth. Nếu KHÔNG dùng đăng nhập,
--  xem PHẦN 5 ở cuối file.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- PHẦN 1. BẢNG
-- ---------------------------------------------------------------------

-- Dự án
create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  vat_rate         numeric(5,2) not null default 5,     -- % VAT
  kpbt_rate        numeric(5,2) not null default 2,     -- % kinh phí bảo trì
  handover_date    date,                                -- bàn giao dự kiến
  payment_schedule jsonb,                               -- tiến độ CĐT (null = mẫu mặc định trong code)
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Loại căn / phân khu, mỗi loại có đơn giá chuẩn đ/m2
create table if not exists public.project_unit_types (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid default auth.uid() references auth.users(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null,                          -- VD: The Rise, 2PN, góc...
  price_per_m2  bigint not null check (price_per_m2 >= 0),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_unit_types_project on public.project_unit_types(project_id);

-- Căn hộ cụ thể (giá chỉnh tay theo hướng/tầng). Module chưa bắt buộc dùng, để sẵn cho giỏ hàng.
create table if not exists public.units (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid default auth.uid() references auth.users(id) on delete cascade,
  project_id             uuid not null references public.projects(id) on delete cascade,
  unit_type_id           uuid references public.project_unit_types(id) on delete set null,
  code                   text not null,                 -- VD: R30413
  building               text,                          -- VD: THE RISE 3
  floor                  int,
  area_m2                numeric(8,2) not null,
  price_per_m2_override  bigint,                        -- null = dùng giá chuẩn của loại căn
  net_price_override     bigint,                        -- giá thuần CĐT chốt (nếu có)
  status                 text not null default 'available', -- available | holding | sold
  note                   text,
  created_at             timestamptz not null default now(),
  unique (project_id, code)
);

-- Preset gói vay ngân hàng (owner_id null = dùng chung)
create table if not exists public.bank_presets (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references auth.users(id) on delete cascade,
  key               text not null unique,
  name              text not null,
  ltv               numeric(5,2) not null default 70,
  term_years        numeric(5,2) not null default 25,
  rate_tiers        jsonb not null default '[{"months":60,"rate":6.5}]',
  floating_rate     numeric(5,2) not null default 10,
  max_grace_months  int not null default 24,
  prepay_fees       jsonb not null default '[3,3,2,1,1]',   -- % phí theo năm vay 1,2,3...
  sort_order        int not null default 0,
  note              text,
  updated_at        timestamptz not null default now()
);

-- Cài đặt "lần cuối" của từng người dùng (lãi suất, ân hạn, kỳ hạn...)
create table if not exists public.loan_settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Phương án vay đã lưu, gắn với khách hàng
create table if not exists public.loan_quotes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid default auth.uid() references auth.users(id) on delete cascade,
  customer_id  text,          -- id khách trong CRM (để text cho hợp cả uuid lẫn số)
  project_id   uuid references public.projects(id) on delete set null,
  unit_code    text,
  inputs       jsonb not null,  -- toàn bộ thông số đã nhập → mở lại / xuất lại PDF
  summary      jsonb,           -- số chính: giá full, khoản vay, tiền trả/tháng...
  created_at   timestamptz not null default now()
);
create index if not exists idx_loan_quotes_customer on public.loan_quotes(customer_id, created_at desc);

-- Tự cập nhật updated_at
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated before update on public.projects
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- PHẦN 2. BẢO MẬT (RLS) — mỗi người chỉ thấy dữ liệu của mình
-- ---------------------------------------------------------------------
alter table public.projects           enable row level security;
alter table public.project_unit_types enable row level security;
alter table public.units              enable row level security;
alter table public.bank_presets       enable row level security;
alter table public.loan_settings      enable row level security;
alter table public.loan_quotes        enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own unit types" on public.project_unit_types;
create policy "own unit types" on public.project_unit_types for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own units" on public.units;
create policy "own units" on public.units for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "read presets" on public.bank_presets;
create policy "read presets" on public.bank_presets for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
drop policy if exists "write own presets" on public.bank_presets;
create policy "write own presets" on public.bank_presets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own settings" on public.loan_settings;
create policy "own settings" on public.loan_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own quotes" on public.loan_quotes;
create policy "own quotes" on public.loan_quotes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- RLS không thay GRANT ở tầng bảng — phải cấp quyền tường minh (xem CLAUDE.md mục 5.3).
grant select, insert, update, delete on public.projects           to authenticated;
grant select, insert, update, delete on public.project_unit_types to authenticated;
grant select, insert, update, delete on public.units              to authenticated;
grant select, insert, update, delete on public.bank_presets       to authenticated;
grant select, insert, update, delete on public.loan_settings      to authenticated;
grant select, insert, update, delete on public.loan_quotes        to authenticated;

-- ---------------------------------------------------------------------
-- PHẦN 3. PRESET NGÂN HÀNG (dùng chung). Lãi suất cập nhật lại mỗi 6 tháng!
-- ---------------------------------------------------------------------
insert into public.bank_presets (key, name, ltv, term_years, rate_tiers, floating_rate, max_grace_months, prepay_fees, sort_order, note) values
  ('young35', 'Người trẻ <35 tuổi (9 NHTM)', 70, 25, '[{"months":60,"rate":6.5},{"months":120,"rate":7.5}]', 10, 24, '[3,3,2,1,1]', 1, 'CV 5340/NHNN-CSTT, áp dụng 01/07–31/12/2026'),
  ('nq33',    'NQ33 – Agribank/VCB/BIDV/Vietin', 70, 25, '[{"months":60,"rate":6.5}]', 10, 24, '[3,3,2,1,1]', 2, 'CV 5341/NHNN-CSTT, lãi công bố lại 6 tháng/lần'),
  ('vbsp',    'NH Chính sách xã hội', 80, 25, '[{"months":300,"rate":5.4}]', 5.4, 12, '[0]', 3, 'NĐ 100/2024 sửa đổi bởi NĐ 261/2025'),
  ('hdbank',  'HDBank', 70, 25, '[{"months":60,"rate":6.5}]', 10, 24, '[3,3,2,1,1]', 4, 'Vay tới 70% HĐMB, ân hạn gốc tối đa 24 tháng; phí trả trước: hỏi lại NH'),
  ('tpbank',  'TPBank', 70, 25, '[{"months":60,"rate":6.5}]', 10, 24, '[3,3,2,1]', 5, 'Phí trả trước tham khảo gói nhà ở thường'),
  ('custom',  'Tùy chỉnh', 70, 25, '[{"months":60,"rate":6.5}]', 10, 60, '[3,3,2,1,1]', 9, null)
on conflict (key) do update set
  name = excluded.name, ltv = excluded.ltv, term_years = excluded.term_years, rate_tiers = excluded.rate_tiers,
  floating_rate = excluded.floating_rate, max_grace_months = excluded.max_grace_months,
  prepay_fees = excluded.prepay_fees, sort_order = excluded.sort_order, note = excluded.note, updated_at = now();

-- ---------------------------------------------------------------------
-- PHẦN 4. DỮ LIỆU MẪU: Happy Home Tràng Cát
-- Gán cho tài khoản đầu tiên trong auth.users (CRM cá nhân, 1 người dùng).
-- Nhiều tài khoản → thay đoạn "select id ... limit 1" bằng: where email = 'email-cua-anh'
-- ---------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_project uuid;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    raise notice 'Chưa có tài khoản nào trong auth.users — bỏ qua dữ liệu mẫu';
    return;
  end if;

  select id into v_project from public.projects where owner_id = v_owner and name = 'Happy Home Tràng Cát';
  if v_project is null then
    insert into public.projects (owner_id, name, vat_rate, kpbt_rate, handover_date, payment_schedule, note)
    values (v_owner, 'Happy Home Tràng Cát', 5, 2, '2027-11-15',
      '[
        {"label":"Ký Hợp đồng mua bán (T)","pct":30,"due":{"type":"offsetDays","value":0}},
        {"label":"T+60","pct":10,"due":{"type":"offsetDays","value":60}},
        {"label":"T+120","pct":10,"due":{"type":"offsetDays","value":120}},
        {"label":"T+180","pct":10,"due":{"type":"offsetDays","value":180}},
        {"label":"T+240","pct":10,"due":{"type":"offsetDays","value":240}},
        {"label":"Thông báo bàn giao + KPBT","pct":25,"due":{"type":"handover"},"role":"handover"},
        {"label":"Nhận sổ (bìa)","pct":5,"due":{"type":"afterHandoverMonths","value":12},"role":"title"}
      ]'::jsonb,
      'Bàn giao dự kiến T11/2027. Đợt nhận sổ tính trên giá thuần (không VAT).')
    returning id into v_project;

    insert into public.project_unit_types (owner_id, project_id, name, price_per_m2, sort_order)
    values (v_owner, v_project, 'The Rise', 19911530, 1);

    insert into public.units (owner_id, project_id, unit_type_id, code, building, floor, area_m2, net_price_override)
    select v_owner, v_project, t.id, 'R30413', 'THE RISE 3', 4, 53.6, 1067258010
    from public.project_unit_types t where t.project_id = v_project limit 1;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- PHẦN 5. (CHỈ KHI CRM KHÔNG DÙNG ĐĂNG NHẬP)
-- Bỏ comment khối dưới để cho phép key "anon" đọc/ghi. Lưu ý: ai có link + anon key
-- đều đọc được dữ liệu → chỉ dùng cho CRM cá nhân không công khai.
-- ---------------------------------------------------------------------
-- create policy "anon all projects"   on public.projects           for all to anon using (true) with check (true);
-- create policy "anon all unit types" on public.project_unit_types for all to anon using (true) with check (true);
-- create policy "anon all units"      on public.units              for all to anon using (true) with check (true);
-- create policy "anon read presets"   on public.bank_presets       for select to anon using (true);
-- create policy "anon all quotes"     on public.loan_quotes        for all to anon using (true) with check (true);
-- (loan_settings cần user_id → không đăng nhập thì module tự lưu "lần cuối" trong trình duyệt)
