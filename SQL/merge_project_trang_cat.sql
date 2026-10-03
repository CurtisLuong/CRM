-- =====================================================================
--  Gộp 2 dự án trùng nhau: "Happy Home Tràng Cát" → "Vin Tràng Cát"
--  (Muốn giữ tên kia thì đổi 2 dòng v_keep / v_drop bên dưới.)
--
--  Làm gì:
--   1) Dự án bị gộp (v_drop) chuyển hết toà, căn, phương án vay sang dự án giữ lại.
--      Toà trùng mã → gộp căn vào toà của dự án giữ lại (căn trùng mã: giữ căn của
--      dự án giữ lại). Ngày bàn giao / tiến độ CĐT: dự án giữ lại chưa có thì lấy từ dự án bị gộp.
--   2) Khách đang gắn tên v_drop → đổi sang v_keep (không bị trùng 2 lần).
--   3) Phương án vay đã lưu + "lần nhập cuối" của bảng tính → đổi tên dự án.
--   4) Xoá dự án v_drop.
--  Nếu chỉ có v_drop (chưa có v_keep) → đơn giản là đổi tên.
--
--  Chạy SAU add_catalog_buildings.sql. Chạy lại nhiều lần vẫn an toàn.
--  TRƯỚC KHI CHẠY: mở app khi có mạng cho đồng bộ xong (nút mây báo "đã đồng bộ"),
--  tránh thay đổi offline cũ ghi đè lên tên dự án mới. Chạy xong: kéo xuống tải lại app.
-- =====================================================================
do $$
declare
  v_keep text := 'Vin Tràng Cát';
  v_drop text := 'Happy Home Tràng Cát';
  r record;
  k uuid;
begin
  for r in select id, owner_id from public.projects where name = v_drop loop
    select id into k from public.projects where name = v_keep and owner_id is not distinct from r.owner_id;

    if k is null then
      update public.projects set name = v_keep where id = r.id;   -- chưa có dự án giữ lại → đổi tên
      continue;
    end if;

    -- Cấu hình: dự án giữ lại thiếu thì lấy của dự án bị gộp
    update public.projects kp set
      handover_date    = coalesce(kp.handover_date, dp.handover_date),
      payment_schedule = coalesce(kp.payment_schedule, dp.payment_schedule),
      note             = coalesce(kp.note, dp.note)
    from public.projects dp where kp.id = k and dp.id = r.id;

    -- Loại căn của dự án (chỉ có khi đã chạy add_apt_types_by_project.sql) → chuyển trước toà
    if to_regclass('public.project_apt_types') is not null then
      insert into public.project_apt_types (owner_id, project_id, apt_type, typical_area_m2, sort_order)
      select owner_id, k, apt_type, typical_area_m2, sort_order from public.project_apt_types where project_id = r.id
      on conflict (project_id, apt_type) do nothing;
    end if;

    -- Toà trùng mã: chuyển căn (không trùng) sang toà của dự án giữ lại, căn trùng thì bỏ
    update public.units u set building_id = kb.id, project_id = k
    from public.buildings db, public.buildings kb
    where u.building_id = db.id and db.project_id = r.id
      and kb.project_id = k and kb.code = db.code
      and not exists (select 1 from public.units x where x.building_id = kb.id and x.code = u.code);
    delete from public.buildings db
    using public.buildings kb
    where db.project_id = r.id and kb.project_id = k and kb.code = db.code;   -- xoá kèm căn trùng còn lại

    -- Phần còn lại chuyển nguyên sang dự án giữ lại
    update public.buildings          set project_id = k where project_id = r.id;
    update public.units              set project_id = k where project_id = r.id;
    update public.project_unit_types set project_id = k where project_id = r.id;
    update public.loan_quotes        set project_id = k where project_id = r.id;

    delete from public.projects where id = r.id;
  end loop;

  -- Khách: đổi tên trong mảng customers.projects, bỏ trùng, giữ thứ tự
  update public.customers c set projects = (
    select coalesce(jsonb_agg(n order by o), '[]'::jsonb)
    from (
      select case when v = v_drop then v_keep else v end as n, min(ord) as o
      from jsonb_array_elements_text(c.projects) with ordinality as t(v, ord)
      group by 1
    ) s
  )
  where c.projects ? v_drop;

  -- Phương án vay đã lưu: tên dự án trong thông số đã nhập
  update public.loan_quotes
  set inputs = jsonb_set(inputs, '{unit,projectName}', to_jsonb(v_keep))
  where inputs #>> '{unit,projectName}' = v_drop;

  -- "Lần nhập cuối" của bảng tính (theo tên dự án)
  update public.loan_settings set settings = case
      when settings #> array['perProject', v_keep] is null
        then jsonb_set(settings #- array['perProject', v_drop], array['perProject', v_keep], settings #> array['perProject', v_drop])
      else settings #- array['perProject', v_drop]
    end
  where settings #> array['perProject', v_drop] is not null;

  -- Danh sách dự án cũ (không còn dùng, dọn cho gọn)
  delete from public.project_options o
  where o.name = v_drop and exists (select 1 from public.project_options x where x.name = v_keep and x.owner_id = o.owner_id);
  update public.project_options set name = v_keep where name = v_drop;
end $$;

-- Kiểm tra: chỉ còn 1 dòng "Vin Tràng Cát", 0 dòng "Happy Home Tràng Cát"
select p.name, count(distinct b.id) as so_toa, count(u.id) as so_can
from public.projects p
left join public.buildings b on b.project_id = p.id
left join public.units u on u.building_id = b.id
where p.name in ('Vin Tràng Cát', 'Happy Home Tràng Cát')
group by p.name;
