# TaskApp — Quản lý công việc nội bộ

Quản lý task nội bộ (≤ 30 user) theo flow **Meeting → Task → Progress → Review → Done**.
Stack: **Next.js (App Router) + Supabase**, không cần backend server riêng.

## Tech stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui (đã cấu hình `components.json`)
- TanStack Query (server state) + Zustand (UI state)
- Supabase: Postgres, Auth, Storage, Realtime, RLS

## Khởi chạy

1. Cài dependency:

   ```bash
   npm install
   ```

2. Điền key Supabase vào `.env.local` (lấy ở **Project Settings → API**):

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

3. Chạy migration trong **Supabase SQL Editor** theo thứ tự:
   - `supabase/migrations/0001_init.sql` — schema, triggers, RLS, realtime
   - `supabase/migrations/0002_storage.sql` — bucket file đính kèm

4. Tạo user đầu tiên: **Authentication → Users → Add user** (trigger sẽ tự tạo
   profile với role `member`). Nâng quyền admin bằng SQL:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

5. Chạy dev:

   ```bash
   npm run dev
   ```

## Cấu trúc thư mục

```
src/
 ├── app/                # routes (login, dashboard, ...)
 ├── components/         # ui/ (shadcn) + providers
 ├── modules/            # auth, dashboard, meetings, tasks, reports
 ├── lib/                # supabase clients, utils
 ├── store/              # zustand stores
 └── types/              # database types
supabase/migrations/     # SQL: schema + storage
```

## Roadmap

- **Phase 1** ✅ nền tảng: auth, schema, RLS · ⏳ meetings/tasks CRUD
- **Phase 2**: kanban, task detail, comment, checklist
- **Phase 3**: report, calendar, file upload
- **Phase 4**: notification, dashboard analytics

## Lưu ý về RLS

- Docs gốc nói "Leader xem task team mình" nhưng schema **chưa có khái niệm team**.
  Hiện tại RLS cho **leader/admin xem toàn bộ task**. Nếu cần phân team, thêm bảng
  `teams` + cột `team_id` rồi siết lại policy `tasks_select_scope`.
