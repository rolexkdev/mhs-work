# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

TaskApp is an internal task manager for a small team (≤ 30 users) following the flow
**Meeting → Task → Progress → Review → Done**. It is a Next.js 15 (App Router) app backed
entirely by Supabase (Postgres, Auth, Storage, Realtime, RLS). There is no separate backend
server; the only extra services are Supabase Edge Functions and a small Zalo proxy.

## Commands

Node ≥ 22 (see `.nvmrc`).

```bash
npm run dev        # start dev server
npm run build      # production build
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
```

There is no test suite. After changing code, run `npm run typecheck` and `npm run lint`.

## Project structure

- `src/app/(app)/` — authenticated routes: dashboard (`page.tsx`), `meetings`, `tasks`,
  `documents`, `updates`, `accounts` (admin only). `src/app/login/` — login page.
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — session refresh / auth redirect.
- `src/modules/<domain>/` — feature code per domain (`auth`, `admin`, `dashboard`,
  `meetings`, `tasks`, `documents`, `updates`): TanStack Query hooks (`hooks.ts`, `*-hooks.ts`) and components.
- `src/lib/supabase/` — `client.ts` (browser), `server.ts` (server components / actions),
  `admin.ts` (service role, bypasses RLS).
- `src/lib/query-keys.ts` — all React Query keys. `src/lib/errors.ts` — `friendlyError()`
  for user-facing error messages. `src/lib/export-report.ts` — Excel export (exceljs).
- `src/store/ui-store.ts` — Zustand UI state (filters, view mode).
- `src/types/database.ts` — hand-maintained Supabase `Database` types.
- `src/components/ui/` — shadcn/ui components; `src/components/` — app shell, command
  palette, `realtime-sync.tsx` (Supabase Realtime → query invalidation).
- `supabase/migrations/00NN_*.sql` — schema history. `supabase/functions/` — Edge Functions
  `zalo-auth`, `zalo-daily-reminder`, shared helpers in `_shared/zalo.ts`.
- `zalo-bridge/server.mjs` — Node proxy giving Zalo API calls a Vietnamese IP.

## Conventions

- Server state goes through TanStack Query hooks in `src/modules/*`; always use keys from
  `queryKeys`, never inline arrays. Mutations show errors via `toast.error(friendlyError(err))`
  (sonner). UI-only state goes in Zustand.
- In client hooks, create the Supabase client with `createClient()` from
  `@/lib/supabase/client` and type it with `Database` from `@/types/database`.
- Use the `@/` path alias. Combine class names with `cn()` from `@/lib/utils`. Add new UI
  primitives via shadcn (`components.json`) rather than writing them from scratch.
- User-facing text is in **Vietnamese**; code identifiers are in English.
- Database changes: add a new migration with the next number (e.g. `0018_<name>.sql`),
  keep it idempotent (`drop ... if exists` / `create or replace`), and update
  `src/types/database.ts` to match. Migrations are applied manually in the Supabase SQL
  Editor — do not assume they have been run.

## Rules

### Language

- Branch names, commit messages, PR titles/descriptions, code comments and documentation
  (`README.md`, `CLAUDE.md`, migration headers) are written in **English**.
- Only user-facing UI text stays in Vietnamese.

### Branches

- Never commit directly to `main`; every change goes through a branch and a PR.
- Format: `<type>/<short-kebab-case-description>`, lowercase, ASCII only, e.g.
  `feat/document-submission`, `fix/zalo-auth-401`, `docs/claude-md`.
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`, `chore`, `ci`.
- Keep one topic per branch; branch off the latest `main`.

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

<optional body: what changed and why>
```

- `type`: same list as branches. `scope` (optional): the area touched, e.g. `tasks`,
  `meetings`, `dashboard`, `accounts`, `auth`, `db`, `zalo`, `zalo-bridge`.
- Summary: imperative mood, lowercase first word, no trailing period, ≤ 72 characters,
  e.g. `feat(tasks): support multiple assignees per task`.
- A breaking change (e.g. a migration that drops data) uses `!` after the type/scope and a
  `BREAKING CHANGE:` footer.
- One logical change per commit. No vague messages like `fix` or `update`.
- Never commit secrets or files ignored by `.gitignore`; do not commit unrelated changes
  (e.g. stray `package.json` edits) together with a feature.

## Important notes

- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Import `@/lib/supabase/admin` only from
  Server Actions / Route Handlers, never from a `"use client"` file.
- Do not read or commit `.env.local`, `backup-*.json`, or `tai-khoan-nhan-vien.csv`
  (they contain secrets / employee data). Use `.env.example` for reference.
- RLS: there is no team concept. Since migrations 0007 and 0009, every authenticated user
  can view and edit all tasks and task details; history is traced via `task_logs`.
  Admin-only features (e.g. `/accounts`) are enforced in the app and via the admin client.
- Document progress changes go only through the security definer RPCs in
  `0018_document_actions.sql` and require admin or `profiles.is_doc_manager` (toggled
  in `/accounts`).
- Zalo APIs reject non-Vietnamese IPs, so Edge Functions call Zalo through `zalo-bridge`.
  See `zalo-bridge/README.md` before changing anything in the Zalo flow.
