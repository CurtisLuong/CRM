-- =====================================================================
--  Nhập loại căn + diện tích điển hình cho 2 dự án: Vin Tràng Cát, Marquee Homes
--  Chạy SAU add_apt_types_by_project.sql. Chạy lại nhiều lần vẫn an toàn
--  (đã có loại căn đó → cập nhật diện tích theo file này).
--  Sửa số / thêm dòng ngay trong khối "values" bên dưới rồi Run lại.
-- =====================================================================
insert into public.project_apt_types (owner_id, project_id, apt_type, typical_area_m2, sort_order)
select p.owner_id, p.id, v.apt_type, v.area, v.sort_order
from (values
  -- dự án,           loại căn,     m²,   thứ tự
  ('Vin Tràng Cát',   'Studio',     28.8, 0),
  ('Vin Tràng Cát',   '1N-1WC',     32.5, 1),
  ('Vin Tràng Cát',   '2N-2WC',     53.6, 3),
  ('Vin Tràng Cát',   '2N-2WC-G',   61.3, 5),
  ('Vin Tràng Cát',   '3N-2WC',     68.9, 6),   -- ⚠️ bạn gửi "3N-3WC"; nếu đúng là 3 WC thì sửa lại thành '3N-3WC'

  ('Marquee Homes',   '2N-2WC',     68.6, 3),
  ('Marquee Homes',   '2N+, 2WC',   68.9, 4),
  ('Marquee Homes',   '2N-2WC-G',   70.3, 5),
  ('Marquee Homes',   '3N-2WC',     76.3, 6)
) as v(project_name, apt_type, area, sort_order)
join public.projects p on lower(trim(p.name)) = lower(trim(v.project_name))
where p.owner_id is not null
on conflict (project_id, apt_type) do update
  set typical_area_m2 = excluded.typical_area_m2, sort_order = excluded.sort_order;

-- Kiểm tra: phải ra 9 dòng (5 Vin Tràng Cát + 4 Marquee Homes). Thiếu dự án nào = tên dự án
-- trong giỏ hàng khác với tên ở trên → sửa tên trong khối values cho khớp rồi Run lại.
select p.name as du_an, t.apt_type as loai_can, t.typical_area_m2 as dien_tich_m2
from public.project_apt_types t
join public.projects p on p.id = t.project_id
where lower(trim(p.name)) in ('vin tràng cát', 'marquee homes')
order by p.name, t.sort_order;
