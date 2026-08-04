# DMS System Plan

## Arah Produk

DMS System akan dibangun sebagai sistem HRIS, attendance, dan payroll cycle custom untuk operasional Strongpants. Sistem memakai satu database dengan dua aplikasi:

1. **Management App**
   - Dipakai owner, HR, admin, finance, dan kepala divisi.
   - Fokus awal proyek.
   - Mengelola karyawan, divisi, lokasi kerja, absensi, payroll 26 hari kerja, bonus, potongan, kasbon, approval, dan laporan.

2. **Employee App**
   - Dipakai karyawan dari HP.
   - Fokus mobile-first, ringan, modern, cepat, dan nyaman dipakai harian.
   - Untuk absensi realtime, rekap absensi, progress 26 hari kerja, kasbon pribadi, request izin/sakit/cuti, dan slip gaji.

## Prinsip Utama

- Fingerprint akan ditinggalkan.
- Absensi utama memakai HP, validasi lokasi, dan verifikasi wajah.
- Satu database menjadi sumber data utama untuk management app dan employee app.
- Periode gaji tidak mengikuti tanggal kalender, tapi mengikuti **26 hari kerja valid per karyawan**.
- Setiap karyawan bisa punya siklus payroll berbeda.
- Sistem harus punya audit trail untuk absensi, approval, bonus, potongan, kasbon, dan payroll.
- UI/UX mengambil arah dari app `polesheadlamp.id` terbaru dan repo `hardinur18/app-polesheadlamp.id`: modern, ringan, mobile-first, icon modern, dan animasi halus.
- UI/UX foundation DMS dicatat di `docs/UI_UX_FOUNDATION.md`.
- Logo DMS disimpan di `assets/brand/dms-logo.jpeg`.
- Deployment target awal memakai VPS langsung.
- Development database awal memakai Supabase PostgreSQL agar schema, auth, dan realtime bisa divalidasi cepat sebelum deployment VPS final.

## Supabase Development Setup

- Frontend hanya memakai `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
- Supabase secret key, database password, access token, dan Cloudflare token tidak boleh masuk frontend atau repository.
- Koneksi client disiapkan di `src/lib/supabase.ts`.
- File `.env.local` dipakai untuk local development dan sudah di-ignore oleh git.
- File `.env.example` menjadi template env tanpa credential real.
- Schema database akan dibuat setelah struktur Master Data, User, Role, dan Permission disepakati.

## Fokus Tahap Pertama: Management App

Management App menjadi pondasi karena semua aturan bisnis, master data, dan payroll cycle harus benar dulu sebelum employee app dibuka penuh.

### Modul Management App

1. **Dashboard Management**
   - Ringkasan jumlah karyawan aktif.
   - Karyawan masuk hari ini.
   - Karyawan belum absen.
   - Karyawan pending review.
   - Payroll cycle siap gajian.
   - Kasbon aktif.

2. **Master Karyawan**
   - Data karyawan.
   - Divisi.
   - Jabatan.
   - Status kerja.
   - Tanggal masuk.
   - Gaji dasar.
   - Lokasi kerja utama.
   - Foto profil dan data wajah untuk verifikasi.

3. **Divisi dan Jabatan**
   - Struktur divisi.
   - Role operasional.
   - Kepala divisi atau supervisor.

4. **Lokasi Kerja**
   - Titik latitude dan longitude.
   - Radius absensi.
   - Nama lokasi/cabang.
   - Status aktif/nonaktif.

5. **Attendance Monitor**
   - Monitoring absensi harian.
   - Check-in dan check-out.
   - Status lokasi.
   - Status verifikasi wajah.
   - Akurasi GPS.
   - Bukti selfie.
   - Pending review.

6. **Approval Center**
   - Approval absensi bermasalah.
   - Approval izin, sakit, cuti.
   - Approval koreksi absensi.
   - Catatan keputusan dan siapa approver-nya.

7. **Payroll Cycle 26 Hari**
   - Cycle aktif per karyawan.
   - Progress hari kerja valid.
   - Otomatis menutup cycle saat 26 hari kerja valid tercapai.
   - Membuka cycle baru setelah payroll diproses.
   - Riwayat cycle.

8. **Salary, Bonus, Potongan**
   - Gaji dasar.
   - Bonus manual.
   - Potongan manual.
   - Penyesuaian payroll.
   - Catatan audit.

9. **Kasbon**
   - Pengajuan kasbon.
   - Approval kasbon.
   - Jadwal pemotongan.
   - Outstanding kasbon per karyawan.
   - Riwayat pembayaran/pemotongan.

10. **Payroll Run**
    - Generate gaji untuk karyawan yang cycle-nya siap.
    - Perhitungan gaji, bonus, potongan, kasbon.
    - Preview sebelum final.
    - Lock payroll setelah disetujui.
    - Slip gaji.

11. **User, Role, Permission**
    - Role management.
    - Role employee.
    - Akses per modul.
    - Audit login dan aktivitas penting.

## Employee App

Employee App dibangun setelah pondasi management app cukup stabil.

### Modul Employee App

1. **Home Absensi**
   - Tombol check-in/check-out besar.
   - Status lokasi.
   - Status kamera/verifikasi wajah.
   - Progress 26 hari kerja.
   - Status payroll cycle aktif.

2. **Absensi Realtime**
   - Validasi radius lokasi.
   - Verifikasi wajah.
   - Timestamp server.
   - Simpan koordinat, akurasi GPS, device info, dan selfie.
   - Status valid, failed, atau pending review.

3. **Rekap Absensi**
   - Riwayat absensi.
   - Hari kerja valid.
   - Izin, sakit, cuti.
   - Absensi pending.

4. **Request**
   - Izin.
   - Sakit.
   - Cuti.
   - Koreksi absensi.

5. **Kasbon Pribadi**
   - Pengajuan kasbon.
   - Status approval.
   - Sisa kasbon.
   - Riwayat potongan.

6. **Slip dan Riwayat Gaji**
   - Payroll yang sudah dibayarkan.
   - Detail komponen gaji.
   - Bonus, potongan, kasbon.

## Attendance Engine

Absensi tidak hanya menyimpan check-in, tetapi harus melewati engine validasi.

### Validasi

- User login valid.
- Karyawan aktif.
- Lokasi masuk radius.
- GPS akurasi memenuhi batas minimum.
- Wajah cocok dengan data karyawan.
- Tidak ada duplikasi check-in/check-out.
- Timestamp memakai server.
- Payroll cycle aktif tersedia.

### Status Absensi

- `valid`: lolos lokasi dan wajah.
- `pending_review`: lokasi valid tapi wajah/akurasi butuh review, atau ada exception lapangan.
- `rejected`: tidak memenuhi aturan.
- `manual_adjusted`: sudah dikoreksi oleh management.

## Face Verification

Absensi akan memakai verifikasi wajah selain lokasi.

### Flow

1. Management enroll wajah karyawan.
2. Employee app mengambil selfie saat check-in/check-out.
3. Backend membandingkan selfie dengan data wajah karyawan.
4. Sistem menyimpan skor verifikasi dan bukti foto.
5. Jika skor kuat, absensi valid.
6. Jika skor lemah, absensi masuk pending review.

### Catatan Lapangan

- Jangan terlalu keras di awal karena cahaya, kamera, masker, dan jaringan bisa bermasalah.
- Perlu jalur pending review.
- Bisa ditambah liveness ringan seperti instruksi acak, kedip, atau hadap kanan/kiri pada fase lanjut.

## Database Awal

Tabel inti yang kemungkinan dibutuhkan:

- `employees`
- `departments`
- `positions`
- `work_locations`
- `employee_face_profiles`
- `attendance_events`
- `attendance_reviews`
- `leave_requests`
- `payroll_cycles`
- `salary_profiles`
- `payroll_adjustments`
- `cash_advances`
- `cash_advance_payments`
- `payroll_runs`
- `payroll_run_items`
- `app_users`
- `roles`
- `role_permissions`
- `audit_logs`

## Roadmap Implementasi

### Phase 1: Blueprint dan Management Foundation

- Finalisasi modul.
- Finalisasi UI/UX foundation berdasarkan pola Polesheadlamp.
- Finalisasi app shell, sidebar, topbar, bottom nav, KPI, filter panel, table card, status badge, drawer, dan loading state.
- Finalisasi database schema.
- Buat UI management app.
- Buat master karyawan, divisi, jabatan, lokasi kerja.
- Buat payroll cycle 26 hari secara data model.

### Phase 2: Attendance Management

- Attendance monitor.
- Manual import/transisi data jika masih ada data lama.
- Approval center.
- Koreksi absensi.
- Hitung hari kerja valid.

### Phase 3: Payroll dan Kasbon

- Salary profile.
- Bonus dan potongan.
- Kasbon.
- Payroll run.
- Slip gaji.
- Lock dan audit payroll.

### Phase 4: Employee App

- Mobile-first PWA.
- Login karyawan.
- Rekap absensi.
- Progress 26 hari kerja.
- Request izin/sakit/cuti.

### Phase 5: Realtime Attendance

- Check-in/check-out GPS radius.
- Face verification.
- Device info.
- Pending review.
- Optimasi performa HP.

### Phase 6: Hardening VPS

- Deployment VPS.
- Backup database.
- Logging.
- Monitoring.
- Security hardening.
- Performance tuning.

## Catatan Keputusan

- Fokus pertama adalah Management App.
- Employee App menyusul setelah data model dan aturan payroll cycle kuat.
- Fingerprint tidak menjadi fitur utama.
- Absensi realtime wajib menggabungkan lokasi dan verifikasi wajah.
- Payroll cycle 26 hari kerja valid adalah aturan inti sistem.
