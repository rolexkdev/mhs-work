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

4. Tạo user **đầu tiên**: **Authentication → Users → Add user** (trigger sẽ tự
   tạo profile với role `member`). Nâng quyền admin bằng SQL:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

   Từ user admin đầu tiên trở đi, dùng trang **Quản lý tài khoản** (`/accounts`,
   chỉ hiện với role `admin`) để tạo tài khoản cho nhân viên, đặt lại mật khẩu
   và khoá đăng nhập — không cần vào Supabase Dashboard nữa. Trang này cần
   `SUPABASE_SERVICE_ROLE_KEY` trong `.env.local`.

5. Chạy dev:

   ```bash
   npm run dev
   ```

## Local test database

Test new features against a local Supabase running in Docker, filled with a copy of
production data, instead of testing on production.

```bash
npm run db:start     # start local Supabase (first run downloads the Docker images)
npm run db:pull      # dump production roles/schema/data to supabase/.dumps/ (read-only)
npm run db:restore   # rebuild the local DB from the latest dump
npm run db:stop      # stop the containers (data is kept)
```

- `db:pull` asks for the production database password (Dashboard → Project Settings →
  Database), or reads `SUPABASE_DB_PASSWORD`, or uses `SUPABASE_DB_URL` if set.
  The dump contains employee data: `supabase/.dumps/` is git-ignored, never share it.
- `db:restore` wipes the **local** DB only, restores the dump, then runs
  `supabase/local/post-restore.sql`. That script recreates the `auth.users` trigger and
  the storage policies (not part of the dump), removes Zalo OA tokens and cron jobs (so
  the local copy can never message employees or rotate production's Zalo token), and
  sets every password to `taskapp123` (`-KeepPasswords` keeps the production ones).
- Migrations are disabled in `supabase/config.jsonc`, so the local schema mirrors what
  production actually has. To test a new migration, run it in the local Studio SQL
  Editor (http://127.0.0.1:54323) first, then in production.
- Point the app at the local stack: put the `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY`
  from `npx supabase status` into `.env.development.local` (it overrides `.env.local`
  for `npm run dev`; delete or rename it to go back to production).
- Storage files are not copied (only their metadata), so old attachments return 404
  locally; new uploads work.

## Cấu trúc thư mục

```
src/
 ├── app/                # routes (login, dashboard, accounts, ...)
 ├── components/         # ui/ (shadcn) + providers
 ├── modules/            # auth, admin, dashboard, meetings, tasks, reports
 ├── lib/                # supabase clients (client/server/admin), utils
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
