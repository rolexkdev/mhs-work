-- =============================================================
-- 0023 — The creator sets the document route
-- doc_set_route used to be manager-only. The creator of a document may
-- now set and edit its route while the document is still a draft
-- (Chờ gửi: nothing received yet). Managers keep editing it any time
-- the route is still open. Everything else is the same as 0019.
--
-- Idempotent. Run manually in the Supabase SQL Editor after 0022.
-- =============================================================

create or replace function public.doc_set_route(
  p_document_id uuid,
  p_departments text[]
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_locked text[];
  v_locked_count int;
  v_total int;
  v_index int;
begin
  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  if not (
    public.can_manage_documents()
    or (
      v_doc.created_by is not distinct from auth.uid()
      and auth.uid() is not null
      and public.is_document_draft(p_document_id)
    )
  ) then
    raise exception 'Chỉ quản lý hồ sơ, hoặc người tạo khi hồ sơ chưa gửi, mới được sửa lộ trình.'
      using errcode = '42501';
  end if;

  if v_doc.finished_at is not null then
    raise exception 'Hồ sơ đã hoàn thành, không thể sửa lộ trình.'
      using errcode = 'P0001';
  end if;

  if public.doc_route_done(p_document_id) then
    raise exception 'Lộ trình đã xong, không thể sửa.' using errcode = 'P0001';
  end if;

  p_departments := coalesce(p_departments, '{}');

  select coalesce(array_agg(s.department order by s.step_order), '{}')
    into v_locked
  from public.document_steps s
  where s.document_id = p_document_id
    and s.received_at is not null;

  v_locked_count := coalesce(array_length(v_locked, 1), 0);
  v_total := coalesce(array_length(p_departments, 1), 0);

  if v_total < v_locked_count
     or p_departments[1:v_locked_count] is distinct from v_locked then
    raise exception 'Không thể xoá, đổi thứ tự hoặc đổi phòng ban của bước đã tới.'
      using errcode = 'P0001';
  end if;

  for v_index in 1..v_total loop
    if p_departments[v_index] is null
       or length(btrim(p_departments[v_index])) = 0 then
      raise exception 'Bước trong lộ trình phải có phòng ban.'
        using errcode = 'P0001';
    end if;
  end loop;

  delete from public.document_steps
  where document_id = p_document_id
    and received_at is null;

  for v_index in (v_locked_count + 1)..v_total loop
    insert into public.document_steps (document_id, step_order, department)
    values (p_document_id, v_index, btrim(p_departments[v_index]));
  end loop;

  perform public.doc_log_event(
    p_document_id,
    'route',
    null,
    null,
    null,
    null,
    jsonb_build_object('departments', to_jsonb(p_departments)),
    null,
    null
  );
end;
$$;

revoke all on function public.doc_set_route(uuid, text[]) from public, anon, authenticated;
grant execute on function public.doc_set_route(uuid, text[]) to authenticated;
