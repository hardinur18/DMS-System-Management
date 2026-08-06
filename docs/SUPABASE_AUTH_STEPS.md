# Supabase Auth Steps

Dokumen ini adalah urutan sebelum DMS Management App dinaikkan ke VPS.

## Status Saat Ini

- Frontend lokal memakai Supabase URL + anon key.
- Owner dev bisa login via Supabase Auth.
- `app_users` menjadi access profile.
- Menu dan routing mengikuti `role_permissions`.
- Edge Function `app-users` sudah ada di repo.
- RLS production belum diaplikasikan ke Supabase live.

## Step 1 - Deploy Edge Function

Butuh Supabase CLI dan Supabase access token.

```bash
supabase functions deploy app-users --project-ref heibhxempixiiqmalyuf
```

Function source:

```text
supabase/functions/app-users/index.ts
```

Function config:

```text
supabase/config.toml
```

## Step 2 - Set Function Secrets

Set secrets di Supabase Function. Jangan simpan value secret ke repo.

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..." --project-ref heibhxempixiiqmalyuf
supabase secrets set APP_SITE_URL="http://127.0.0.1:5174" --project-ref heibhxempixiiqmalyuf
```

Saat production domain sudah ada, ganti `APP_SITE_URL` ke domain production.

## Step 3 - Aktifkan Frontend Function Mode

Di `.env.local`:

```env
VITE_USE_APP_USERS_FUNCTION=true
```

Restart dev server setelah mengubah env.

## Step 4 - Test Pengguna & Akses

Test berurutan:

1. Login sebagai owner.
2. Buka Pengguna & Akses.
3. Invite user baru dengan email valid.
4. Pastikan user muncul di table.
5. Pastikan Supabase Auth user terbentuk.
6. Klik link email setup/reset password.
7. Pastikan masuk ke form `Buat Password Baru`.
8. Simpan password.
9. User status `active` baru boleh masuk dashboard.

## Step 5 - Apply Production RLS

Jalankan setelah Step 1-4 sukses.

```bash
DATABASE_URL="postgresql://..." npm run db:migrate -- supabase/migrations/20260806000500_app_users_production_rls.sql
DATABASE_URL="postgresql://..." npm run db:migrate -- supabase/migrations/20260806000100_master_data_production_rls.sql
```

Jangan apply production RLS sebelum function mode aktif.

## Step 6 - Final Local Audit

```bash
npm run build
```

Pastikan:

- Login owner berhasil.
- Menu mengikuti role.
- CRUD Pengguna berjalan lewat function.
- Master Data masih bisa dibuka sesuai permission.
- User tanpa akses ditolak.
