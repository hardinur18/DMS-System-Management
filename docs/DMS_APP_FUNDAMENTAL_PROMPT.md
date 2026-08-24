# DMS App Fundamental and MacBook Handoff Prompt

Dokumen ini adalah pegangan fundamental dan context handoff untuk DMS System Management. Fondasi awal proyek dibuat dari MacBook, lalu dokumen ini dipakai untuk menjelaskan ke Codex atau coding agent lain tentang rencana, tujuan, aturan bisnis, dan prioritas asli proyek agar pekerjaan lanjutan tidak salah arah.

## One Sentence Product

DMS System adalah internal operating system untuk Strongpants yang menggabungkan HRIS, absensi mobile, approval, payroll cycle 26 hari kerja valid, kasbon, role permission, dan audit trail dalam satu database.

## Kenapa App Ini Dibangun

DMS dibuat untuk mengganti proses manual, spreadsheet, fingerprint, dan kontrol operasional yang tersebar. Sistem ini harus membantu owner, HR, finance, admin, supervisor, dan karyawan bekerja dari satu sumber data yang rapi.

Tujuan bisnis utamanya:

- Absensi karyawan dilakukan dari HP dengan validasi lokasi dan wajah.
- Payroll tidak mengikuti tanggal kalender biasa, tapi mengikuti 26 hari kerja valid per karyawan.
- Kasbon punya approval, outstanding, cicilan, dan otomatis masuk potongan payroll.
- Semua approval, koreksi, payroll, kasbon, dan perubahan akses tercatat di audit log.
- Management punya dashboard kontrol operasional yang jelas.
- Employee app nanti memberi karyawan akses absensi, rekap, request, kasbon, dan slip gaji.

## Non Negotiable Principles

- Satu database menjadi sumber kebenaran untuk Management App dan Employee App.
- Management App dibangun dulu sampai aturan bisnis stabil, baru Employee App dibuka penuh.
- UI tidak boleh menjadi satu-satunya penjaga akses. Permission harus ditegakkan di database/backend.
- Frontend hanya boleh memakai Supabase URL dan anon/publishable key.
- Secret key, service role key, database password, Cloudflare token, dan access token tidak boleh masuk repo atau browser.
- Absensi harus memakai timestamp server, bukan jam device sebagai sumber kebenaran.
- Payroll cycle dihitung dari hari kerja valid, bukan jumlah hari kalender.
- Karyawan tidak boleh approve atau mengoreksi absensinya sendiri.
- Semua mutasi penting harus masuk audit log.
- Data dummy boleh dipakai untuk UI awal, tapi harus diberi label jelas dan diganti data backend sebelum staging/production.
- Loading data memakai skeleton loading dengan shimmer effect; jangan mengganti seluruh UI page bila yang menunggu hanya data database.
- Login memakai session persistence; pindah page/modul tidak boleh memaksa user login ulang selama session Supabase masih valid.

## Current Repo Reality

Repo saat ini adalah foundation Management App:

- Stack: React, TypeScript, Vite, Supabase.
- Branch utama remote: `development`.
- UI shell sudah ada: login screen, sidebar, dashboard, users, role permission, master data, audit log, kiosk, dan modul operasional.
- Login sudah memakai Supabase Auth dengan session restore.
- Access profile memakai `app_users`, role, division, dan `role_permissions`.
- User management production diarahkan lewat Edge Function `app-users`.
- Role Permission sudah diarahkan lewat Edge Function `role-permissions`.
- Master Data sudah terhubung ke Supabase untuk roles, divisions, positions, work locations, shifts, dan payroll components.
- Attendance, field app, face enrollment, overtime review, payroll processing, dan kiosk sudah punya schema/function foundation.
- Biofinger AT-301 sudah dipilih untuk fingerprint attendance. Device pertama terverifikasi lokal di IP `192.168.1.201`, serial `GED7244800117`, fondasi schema/script read-only ada di `docs/BIOFINGER_AT301_INTEGRATION.md`, dan target tanpa PC admin memakai ADMS cloud receiver di `scripts/biofinger_adms_receiver.mjs`.
- UI foundation punya `FoundationSkeleton` dan `FoundationTableSkeletonRows` untuk loading data shimmer.
- Auth foundation memakai Supabase session persistence dengan `getSession`, `onAuthStateChange`, token auto-refresh, dan cache access profile untuk startup UX.
- Kasbon dan reports masih plan/draft; tabel `cash_advances` dan `cash_advance_payments` belum ada di migration.
- Beberapa config draft UI lama masih ada untuk fallback module, tetapi nav utama dibatasi `productionReadyViews`.
- RLS production sudah tersedia di migration, tetapi deployment live harus diverifikasi sebelum staging/production.

## Product Surfaces

### Management App

Dipakai oleh Owner, HR, Finance, Admin, Supervisor, dan Viewer.

Modul inti:

- Dashboard Management
- Master Data
- User, Role, Permission
- Master Karyawan
- Attendance Monitor
- Approval Center
- Payroll Cycle 26 Hari
- Salary, Bonus, Potongan
- Kasbon
- Reports
- Audit Log
- Settings

### Employee App

Dipakai oleh karyawan dari HP.

Modul inti:

- Home Absensi
- Check-in dan check-out
- Rekap absensi
- Request izin, sakit, cuti, koreksi
- Kasbon pribadi
- Slip dan riwayat gaji
- Profil kerja

## Roles

Role awal:

- Owner: full access dan final approval.
- HR Manager: karyawan, absensi, approval HR, master data HR.
- Finance: payroll, kasbon, bonus, potongan, laporan finance.
- Supervisor: monitoring tim, review lapangan, approval awal tertentu.
- Admin: input operasional dan master data terbatas.
- Viewer: akses baca untuk monitoring.
- Employee: akses aplikasi karyawan saja.

Permission harus granular. Contoh:

- `dashboard.view`
- `users.view`
- `users.create`
- `users.edit`
- `master_data.view`
- `master_data.manage`
- `employees.view`
- `employees.manage`
- `attendance.view`
- `attendance.review`
- `payroll.view`
- `payroll.process`
- `cash_advance.manage`
- `reports.view`
- `audit_logs.view`
- `role_permissions.manage`

## Data Model Foundation

Tabel foundation yang sudah ada atau perlu dilanjutkan:

- `roles`
- `permissions`
- `role_permissions`
- `divisions`
- `positions`
- `work_locations`
- `shifts`
- `payroll_components`
- `app_users`
- `audit_logs`

Tabel berikutnya yang perlu dibangun:

- `employees`
- `employee_salary_profiles`
- `employee_work_assignments`
- `employee_face_profiles`
- `attendance_devices`
- `employee_attendance_device_links`
- `biofinger_attendance_events`
- `attendance_events`
- `attendance_reviews`
- `leave_requests`
- `payroll_cycles`
- `payroll_runs`
- `payroll_run_items`
- `payroll_adjustments`
- `cash_advances`
- `cash_advance_payments`
- `employee_documents`
- `device_sessions`

## Core Business Flows

### 1. User and Employee Onboarding

Flow ideal:

1. Owner/HR membuat user atau employee.
2. Sistem membuat auth user, app profile, dan employee profile jika perlu.
3. Role dan division dipasang dari master data.
4. Salary profile, shift, lokasi kerja, dan supervisor dipasang.
5. Jika employee app aktif, employee melakukan aktivasi akun.
6. Face enrollment dilakukan sebelum absensi wajah diwajibkan.
7. Semua langkah penting masuk audit log.

### 2. Mobile Attendance

Flow ideal:

1. Employee login dari HP.
2. Employee menekan check-in atau check-out.
3. App mengambil GPS, akurasi, device info, dan selfie.
4. Backend mengambil timestamp server.
5. Backend validasi employee aktif, cycle aktif, lokasi dalam radius, akurasi GPS, duplikasi absen, dan face score.
6. Status event menjadi `valid`, `pending_review`, atau `rejected`.
7. Jika pending, masuk Approval Center.
8. Attendance valid menjadi dasar payroll cycle.

### 3. Attendance Review and Correction

Flow ideal:

1. HR/Supervisor melihat antrian pending.
2. Reviewer melihat bukti GPS, foto, face score, device info, dan riwayat.
3. Reviewer approve, reject, atau manual adjust dengan catatan wajib.
4. Sistem menyimpan reviewer, keputusan, alasan, dan timestamp.
5. Perubahan mempengaruhi payroll jika status menjadi hari kerja valid.

### 4. Payroll Cycle 26 Hari

Aturan utama:

- Setiap employee punya payroll cycle aktif.
- Cycle menghitung hari kerja valid.
- Saat mencapai 26 hari kerja valid, cycle siap payroll.
- Payroll run membuat draft gaji dari salary profile, attendance valid, bonus, potongan, dan kasbon.
- Finance/Owner review draft.
- Setelah final, payroll dikunci dan tidak boleh berubah tanpa adjustment resmi.
- Sistem membuat cycle baru setelah payroll selesai.

### 5. Kasbon

Flow ideal:

1. Employee atau HR membuat pengajuan kasbon.
2. Finance/Owner approve atau reject.
3. Jika approve, kasbon menjadi outstanding.
4. Cicilan atau potongan masuk payroll run.
5. Outstanding berkurang setiap pembayaran/potongan.
6. Riwayat kasbon harus bisa diaudit.

## Build Order

### Phase 0: Hardening Foundation

- Buat `.env.local` lokal, jangan commit.
- Pastikan Supabase URL dan anon key benar.
- Ganti dummy login menjadi Supabase Auth.
- Tambahkan session restore dan sign out asli.
- Pisahkan dev migration yang membuka anon access dari production migration.
- Tulis README setup lokal.

### Phase 1: Master Data Solid

- Pastikan Master Data CRUD stabil.
- Tambahkan validation dan error state yang jelas.
- Jangan hard delete data master yang sudah dipakai. Gunakan `is_active`.
- Tambahkan audit log untuk create, update, deactivate.
- Tambahkan RLS permission-based.

### Phase 2: Users, Roles, Permissions

- Connect Users page ke `app_users`.
- Connect Role Permission page ke `role_permissions`.
- Owner full access harus protected.
- Implement permission helper di database/backend.
- UI hide/disable action berdasarkan permission, tapi enforcement tetap di RLS/backend.

### Phase 3: Employees

- Buat schema employee.
- Connect Master Karyawan ke backend.
- Tambahkan salary profile, division, position, shift, work location, status kerja.
- Siapkan face profile metadata.

### Phase 4: Attendance Engine

- Buat attendance schema.
- Implement check-in/check-out API atau RPC.
- Validasi GPS radius dan akurasi.
- Simpan device info, photo reference, face score, status.
- Masukkan pending review jika validasi tidak kuat.

### Phase 5: Approval Center

- Connect pending attendance, leave request, correction request.
- Approve/reject/manual adjust dengan reason wajib.
- Semua keputusan masuk audit log.

### Phase 6: Payroll Cycle

- Buat payroll cycle per employee.
- Hitung 26 hari kerja valid.
- Generate payroll draft.
- Apply salary, bonus, potongan, kasbon.
- Lock payroll final.
- Generate next cycle.

### Phase 7: Kasbon

- Buat cash advance request.
- Approval finance/owner.
- Outstanding dan installment.
- Auto deduction ke payroll.

### Phase 8: Employee App

- Build mobile-first employee experience.
- Home absensi.
- Rekap absensi.
- Request.
- Kasbon pribadi.
- Slip gaji.

### Phase 9: Reports and Deployment

- Reports absensi, payroll, kasbon, audit.
- Export CSV/PDF jika perlu.
- Harden environment.
- Deploy ke VPS final atau target hosting yang dipilih.

## UI and UX Direction

DMS adalah operational management app. Tampilan harus padat, rapi, cepat discan, dan nyaman dipakai harian.

Prinsip UI:

- Bukan landing page.
- Dashboard langsung menampilkan status operasional.
- Tabel dan filter harus kuat karena app dipakai berulang.
- Button action harus jelas dan konsisten.
- Status badge harus konsisten: valid, pending, review, rejected, paid, locked.
- Mobile management tetap usable, tapi Employee App harus benar-benar mobile-first.
- Visual mengikuti `docs/UI_UX_FOUNDATION.md` dan referensi Polesheadlamp sebagai arah rasa produk, bukan salinan fitur.

## Engineering Standards

- TypeScript strict harus tetap hijau.
- Migration harus bisa dijalankan ulang sejauh mungkin tanpa merusak data.
- Data sensitif tidak boleh hardcoded.
- Jangan menambahkan business logic penting hanya di frontend.
- Gunakan Supabase Auth untuk identity.
- Gunakan RLS atau RPC security definer secara hati-hati untuk enforcement.
- Tambahkan audit log pada semua mutasi penting.
- Hindari file raksasa jika modul mulai stabil. Pecah `App.tsx` bertahap berdasarkan domain.
- Tambahkan test untuk payroll, attendance validation, kasbon deduction, dan permission helper.
- Jangan deploy policy dev yang membuka `anon` full CRUD.

## MacBook to Codex Handoff Prompt

Copy prompt ini dari context MacBook/proyek awal saat ingin membuat Codex memahami DMS dari nol di device atau session lain:

```text
Kamu sedang melanjutkan DMS System Management.

Konteks penting: fondasi awal proyek ini pertama kali dibangun dari MacBook saya. Jangan anggap repo ini sekadar template React/Vite atau dashboard dummy. Perlakukan ini sebagai kelanjutan dari rencana produk internal yang sudah punya arah bisnis jelas.

Pertama, baca dokumen berikut di repo:
- docs/DMS_APP_FUNDAMENTAL_PROMPT.md
- DMS_SYSTEM_PLAN.md
- docs/UI_UX_FOUNDATION.md

Produk ini bukan landing page, bukan demo UI, dan bukan dashboard dummy. Ini adalah internal operating system untuk Strongpants: HRIS, absensi mobile, approval, payroll cycle 26 hari kerja valid, kasbon, role permission, dan audit trail.

Prioritas utama:
1. Management App dulu.
2. Supabase sebagai development database.
3. Satu database untuk Management App dan Employee App.
4. Login harus memakai Supabase Auth, bukan state dummy.
5. Permission harus ditegakkan di database/backend, bukan hanya UI.
6. Payroll cycle dihitung dari 26 hari kerja valid per karyawan.
7. Attendance harus memakai server timestamp, GPS radius, face verification, dan pending review.
8. Kasbon harus terhubung ke payroll deduction.
9. Semua mutasi penting masuk audit log.
10. Secret key, service role key, database password, access token, dan Cloudflare token tidak boleh masuk repo atau browser.

Current repo state:
- React + TypeScript + Vite + Supabase.
- Supabase Auth sudah dipakai untuk login dan session restore.
- `app_users` menjadi access profile untuk Management App dan Employee/field scope.
- Master Data, Users, Role Permission, Audit Log, Employees, Attendance, Payroll, Face Enrollment, Overtime, dan Kiosk sudah punya jalur Supabase/Edge Function.
- `VITE_USE_APP_USERS_FUNCTION=true` harus aktif setelah Edge Function `app-users` deploy.
- Kasbon dan reports masih draft/plan; jangan anggap siap production.
- Ada migration dev lama untuk bootstrap; production harus memakai RLS/function-only policy yang sudah disiapkan.

Cara kerja:
- Mulai dengan `git status`.
- Pahami dulu fundamental produk sebelum audit atau coding.
- Jangan hapus perubahan user.
- Jalankan typecheck/build setelah perubahan.
- Kalau mengubah database, tambahkan migration SQL di `supabase/migrations`.
- Kalau membuat behavior bisnis, tambahkan audit log.
- Kalau menyentuh auth/permission, pikirkan RLS dan abuse case.
- Update markdown plan jika keputusan produk berubah.

Tugas pertama yang disarankan:
1. Buat README setup lokal dan checklist deploy.
2. Verifikasi Edge Functions live dan set `VITE_USE_APP_USERS_FUNCTION=true`.
3. Verifikasi RLS production/function-only policy di Supabase live.
4. Seed/claim owner user live dan cek permission menu.
5. Tambahkan migration kasbon (`cash_advances`, `cash_advance_payments`) sebelum payroll deduction dipakai.
6. Pecah `src/App.tsx` per modul setelah behavior inti stabil.
7. Tambahkan test untuk auth permission, attendance validation, payroll processing, dan kasbon deduction.
```

## Definition of Done for Next Milestone

Milestone pertama dianggap selesai jika:

- Login memakai Supabase Auth.
- Session tetap hidup setelah refresh.
- Logout benar-benar sign out dari Supabase.
- Pindah modul tidak meminta login ulang selama session masih valid.
- Loading state memakai skeleton shimmer untuk data dari Supabase, bukan text titik atau full-page skeleton tanpa kebutuhan.
- Master Data tampil dari Supabase.
- Users tampil dari `app_users`.
- Role Permission tampil dari `role_permissions`.
- Audit Log tampil dari `audit_logs`.
- RLS tidak membuka full CRUD ke `anon`.
- Owner/HR/Finance/Admin/Supervisor/Viewer punya permission yang jelas.
- Typecheck dan build lulus.
- README setup lokal tersedia.

## Security Reminder

Jika secret key, service role key, database password, Cloudflare token, atau access token pernah tersebar di chat atau log, rotate key tersebut dari dashboard penyedia. Simpan hanya di environment lokal atau secret manager, bukan di repo.
