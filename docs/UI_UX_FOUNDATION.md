# DMS UI/UX Foundation

## Referensi Utama

UI/UX DMS Management App mengambil pola dari repo:

- `hardinur18/app-polesheadlamp.id`
- Arah visual terbaru `app.polesheadlamp.id`
- Logo DMS lokal: `assets/brand/dms-logo.jpeg`

Tujuannya bukan menyalin fitur Polesheadlamp, tetapi mengambil pola produk yang sudah cocok untuk aplikasi internal: modern, cepat, padat, ringan, mobile-aware, dan terasa seperti app profesional.

## Karakter Visual DMS

- Brand utama: navy gelap dari logo DMS.
- Aksen utama: cyan dari bentuk panah/logo.
- Surface: putih, slate sangat muda, dan panel soft.
- Status: emerald untuk valid/approved, amber untuk pending/review, rose untuk failed/rejected, blue/cyan untuk active/progress.
- Hindari UI yang terlalu dekoratif, terlalu gelap, atau terlalu penuh gradient.
- Animasi harus halus dan membantu feedback, bukan membuat app terasa berat.

## Prinsip Produk

- DMS adalah operational management app, bukan landing page.
- Fokus pertama adalah Management App.
- Employee App menyusul dengan mobile-first experience.
- Layout harus mudah discan oleh owner, HR, admin, finance, dan kepala divisi.
- Semua tabel, filter, KPI, modal, empty state, loading state, dan badge status harus konsisten.
- Logic payroll 26 hari kerja valid harus terlihat jelas di UI.
- Absensi realtime harus menampilkan status lokasi dan face verification secara transparan.

## Struktur Shell

Management App mengikuti pola app shell Polesheadlamp:

- Desktop sidebar kiri.
- Sidebar bisa collapsed.
- Collapsed sidebar punya flyout submenu.
- Topbar ringkas untuk breadcrumb, quick action, notification, dan user menu.
- Main content scroll sendiri.
- Mobile memakai bottom navigation untuk fitur utama.
- Menu mobile membuka full menu/drawer untuk modul lain.

## Navigasi Management App

Kelompok menu awal:

1. **Dashboard**
   - Overview management.

2. **Karyawan**
   - Master karyawan.
   - Divisi.
   - Jabatan.
   - Lokasi kerja.
   - Face enrollment.

3. **Absensi**
   - Live attendance.
   - Attendance monitor.
   - Pending review.
   - Izin/sakit/cuti.
   - Koreksi absensi.

4. **Payroll**
   - Payroll cycle 26 hari.
   - Salary profile.
   - Bonus dan potongan.
   - Payroll run.
   - Slip gaji.

5. **Kasbon**
   - Pengajuan kasbon.
   - Approval kasbon.
   - Outstanding kasbon.
   - Riwayat potongan.

6. **Laporan**
   - Laporan absensi.
   - Laporan payroll.
   - Laporan kasbon.
   - Audit trail.

7. **System**
   - Users.
   - Roles.
   - Permissions.
   - Settings.

## Pola Halaman Standar

Setiap page operasional sebaiknya mengikuti urutan:

1. Page shell.
2. Page header dengan eyebrow, title, subtitle, dan action buttons.
3. Warning/error inline bila ada.
4. KPI grid.
5. Filter panel.
6. Table card atau workflow board.
7. Dialog/drawer untuk create, edit, detail, approve, reject.

## Komponen Standar

Komponen yang perlu dibuat sejak awal:

- `AppShell`
- `Sidebar`
- `BottomNav`
- `PageShell`
- `PageHeader`
- `KpiGrid`
- `KpiCard`
- `FilterPanel`
- `CategoryTabs`
- `TableCard`
- `StatusBadge`
- `EmptyState`
- `FoundationSkeleton`
- `FoundationTableSkeletonRows`
- `ConfirmDialog`
- `FormDrawer`
- `DetailDrawer`
- `DateRangeFilter`
- `SearchInput`
- `ActionMenu`
- `ConfirmDialog`

## Modul UI Form

Form DMS memakai foundation reusable di `src/components/form-field.tsx`:

- `FormField` untuk wrapper label dan control.
- `TextFormField` untuk input text, email, number, dan field umum.
- `SelectFormField` untuk dropdown native yang sudah distyling ulang.
- `DateFormField` untuk field tanggal dengan kalender custom.
- `DatePickerField` berada di `src/components/date-picker-field.tsx` dan menggantikan native browser date picker.
- `SwitchFormField` untuk status aktif/nonaktif dengan animasi switch.

## Modul UI Validasi

Validasi aksi memakai `ConfirmDialog` di `src/components/confirm-dialog.tsx`.

- Jangan memakai `window.confirm` atau alert native browser.
- Gunakan tone `danger` untuk hapus data.
- Dialog wajib menampilkan judul aksi, deskripsi konsekuensi, tombol batal, tombol konfirmasi, dan preview data bila aksinya menyasar record tertentu.
- Mobile mengikuti pola bottom sheet DMS.
- Untuk master data, aksi destruktif default adalah nonaktif/arsip, bukan hard delete.

Standar dialog form:

- Desktop memakai dialog landscape dan field 2 kolom.
- Mobile/PWA memakai bottom sheet full-width.
- Mobile form punya scroll internal dan action sticky di bawah.
- Header mobile compact dan memakai safe-area.
- Input/select/date control mengikuti tinggi, radius, focus ring, dan tipografi foundation.
- Form create/edit harus memakai komponen form foundation, bukan markup input manual.

## Modul UI Operasional

Komponen operasional reusable:

- Card KPI memakai `OperationalKpiGrid` dan `OperationalKpiCard` di `src/components/operational-page.tsx`.
- Card filter memakai `OperationalFilterPanel` di `src/components/operational-page.tsx`.
- Tab kategori memakai `CategoryTabs` di `src/components/category-tabs.tsx`.
- Table wrapper memakai `OperationalTableCard` di `src/components/operational-page.tsx`.
- Data table memakai `TableText`, `TableNumberCell`, `RowActionMenu`, dan `RowActionMenuItem` di `src/components/data-table.tsx`.
- Row table yang membuka detail memakai `ClickableTableRow` di `src/components/data-table.tsx`.
- Pagination table memakai `DataTablePagination` di `src/components/data-table.tsx`.
- Loading data memakai `FoundationSkeleton` dan `FoundationTableSkeletonRows` di `src/components/foundation-loading.tsx`.

Standar tab kategori:

- Desktop memakai compact pill tabs.
- Mobile memakai horizontal scroll tanpa scrollbar visual.
- Active state memakai border, soft gradient layer, shadow kecil, dan count badge aktif.
- Tab tidak boleh dibungkus card tambahan bila hanya berfungsi sebagai selector ringan.

## Modul UI Loading

Pattern resmi loading DMS adalah **skeleton loading** dengan **shimmer effect**.

Komponen foundation:

- `FoundationSkeleton`: placeholder kecil untuk value KPI, inline stats, tab count, dropdown value, text, badge, avatar, dan tombol.
- `FoundationTableSkeletonRows`: placeholder row table untuk data yang sedang diambil dari Supabase.

Aturan penggunaan:

- Skeleton hanya dipakai untuk bagian yang sumbernya dari database/API, bukan untuk mengganti seluruh UI page.
- Page shell, header, action button, tab, filter, table header, dan struktur layout harus tetap tampil.
- Saat first load, value data boleh skeleton shimmer, tetapi layout final tidak boleh hilang.
- Saat user pindah page lalu kembali, pakai cache state terakhir dan jangan menampilkan loading ulang bila data sudah pernah dimuat.
- Manual `Refresh Data` boleh mengambil data baru, tetapi jangan mengosongkan UI lama kecuali datanya benar-benar belum pernah ada.
- Jangan memakai text `...` sebagai loading data. Gunakan skeleton shimmer.
- Jangan memakai progress bar besar untuk table/dashboard data biasa. Progress bar hanya untuk proses panjang yang punya tahapan nyata.
- Empty state hanya muncul setelah request selesai dan hasil data memang kosong.

## Master Data Form Mapping

Form Master Data harus mengikuti kategori aktif:

- Role Management: nama role, kode otomatis, level akses, deskripsi, status.
- Divisi: nama divisi, kode otomatis, deskripsi divisi, status.
- Jabatan: nama jabatan, kode otomatis, divisi terkait, deskripsi jabatan, status.
- Shift: nama shift, kode otomatis, jam mulai, jam selesai, catatan shift, status.
- Lokasi Kerja: nama lokasi, kode otomatis, alamat, latitude, longitude, radius meter, status.
- Komponen Gaji: nama komponen, kode otomatis, jenis komponen, deskripsi komponen, status.

Tombol tambah data harus mengikuti tab aktif. Jika tab `Semua` aktif, default form boleh memakai kategori `Divisi`.
Semua kategori memiliki `Urutan Dropdown` untuk mengatur prioritas tampilan data pilihan.
Form wajib menampilkan panel validasi bila input domain tidak valid, seperti radius di luar batas, koordinat tidak lengkap, level role bukan angka positif, atau shift tanpa jam lengkap.

## Master Data Table Mapping

Table Master Data memakai kolom adaptif berdasarkan tab aktif:

- Semua: nama data + kode, kategori, detail, dipakai di, status.
- Role Management: nama role + kode, level akses, permission scope, status.
- Divisi: nama divisi + kode, fungsi divisi, dipakai di, status.
- Jabatan: nama jabatan + kode, divisi, deskripsi jabatan, status.
- Shift: nama shift + kode, jam kerja, catatan, status.
- Lokasi Kerja: nama lokasi + kode, radius GPS, koordinat/alamat, status.
- Komponen Gaji: nama komponen + kode, jenis, aturan, status.

Kolom aksi wajib memakai menu titik tiga vertikal, bukan tombol teks inline.
Klik baris table membuka detail record. Klik button, link, input, atau action menu di dalam row tidak boleh membuka detail.
Action menu dapat berisi edit, lihat maps, naikkan/turunkan urutan, dan aktif/nonaktif. Menu harus floating di atas table, tidak boleh tenggelam di dalam scroller.
Table registry maksimal menampilkan 50 baris per halaman. Footer table wajib menyediakan pilihan jumlah baris dan navigasi halaman berikut/sebelumnya.

Untuk kategori `Lokasi Kerja`, cell koordinat/radius dapat memiliki icon lokasi kecil. Klik icon atau menu `Lihat Maps` membuka dialog preview peta internal yang menampilkan pin lokasi, radius absensi, koordinat, alamat, copy koordinat, dan link ke Google Maps.

Master Data tidak memakai KPI card besar. Rekapan data ditampilkan sebagai inline stats kecil di bawah subtitle halaman agar halaman tetap ringan dan fokus ke filter, tab, dan registry table.

Master Data memakai `sort_order` di database. Urutan table/dropdown harus mengikuti `sort_order`, lalu fallback ke kode atau level.
Feedback create/update/reorder/status memakai toast sukses/error. Error duplicate dari Supabase wajib diterjemahkan ke bahasa user.
Audit log ditulis setelah aksi create, update, reorder, aktif, dan nonaktif berhasil.
RLS production tersedia di migration `20260806000100_master_data_production_rls.sql` dan hanya diterapkan setelah Supabase Auth + bootstrap `app_users` siap.

## Pengguna & Akses

Page Pengguna & Akses memakai data live Supabase:

- User profile berasal dari `app_users`.
- Login/logout app memakai Supabase Auth.
- User wajib punya profile `app_users` yang terhubung ke `auth.users`.
- Access guard hanya mengizinkan status `active`.
- Status `invited`, `locked`, atau email tanpa profile harus ditolak sebelum masuk dashboard.
- Dropdown role berasal dari Master Data `roles`.
- Dropdown divisi berasal dari Master Data `divisions`.
- Table memakai `ClickableTableRow`, `RowActionMenu`, dan `DataTablePagination`.
- Form invite/edit memakai dialog foundation dan validasi form.
- Lock/unlock/delete memakai `ConfirmDialog`.
- Create, update, delete, lock, dan unlock menulis `audit_logs`.
- Buat/reset password memakai Supabase Auth email link. Admin tidak boleh melihat atau menentukan password user.
- Link buat/reset password diarahkan ke `?flow=reset-password` dan wajib menampilkan form `Buat Password Baru` sebelum user masuk dashboard.
- Setelah password disimpan, app memeriksa ulang `app_users`; hanya status `active` yang boleh lanjut.
- Page `Profil Saya` wajib menampilkan profile login aktif, role, divisi, security session, reset password, dan tombol logout.
- Logout tersedia dari sidebar user card, topbar mobile, dan page profil. Jangan bergantung pada tombol floating tersembunyi.
- Toast sukses/error wajib dipakai untuk feedback user.

## Auth Session Persistence

Pattern resmi auth DMS adalah **session persistence** atau **persistent login**.

Aturan implementasi:

- Supabase client wajib memakai `autoRefreshToken: true`, `persistSession: true`, dan `detectSessionInUrl: true`.
- App bootstrap wajib memanggil `supabase.auth.getSession()` sebelum memutuskan user perlu login.
- App wajib subscribe `supabase.auth.onAuthStateChange()` agar sign in, token refresh, password recovery, dan sign out tersinkron.
- Pindah page/modul tidak boleh mereset `session`, `accessProfile`, atau memaksa login ulang.
- Refresh browser boleh menampilkan auth loading singkat, lalu restore session jika token masih valid.
- Sign out adalah satu-satunya aksi user yang menghapus session dan cache profile secara sengaja.
- Cache access profile boleh dipakai untuk startup UX, tetapi akses/permission tetap harus direfresh dari `app_users` dan `role_permissions`.
- Session expired, user locked, user tanpa profile, atau status bukan `active` harus diarahkan ke login/access denied sesuai konteks.

Production readiness:

- Ikuti checklist di `docs/SUPABASE_AUTH_STEPS.md`.
- Deploy Edge Function `supabase/functions/app-users` sebelum mengaktifkan mode production user CRUD.
- Set Function secrets `SUPABASE_SERVICE_ROLE_KEY` dan `APP_SITE_URL`.
- Set frontend env `VITE_USE_APP_USERS_FUNCTION=true` setelah function deployed.
- Setelah function mode aktif dan owner bisa login, apply migration `20260806000500_app_users_production_rls.sql`.
- Jangan apply migration production RLS saat frontend masih memakai dev direct CRUD.

## Token Visual Awal

Token awal yang direkomendasikan:

```css
:root {
  --dms-navy: #07184a;
  --dms-cyan: #22aeca;
  --dms-cyan-strong: #0891b2;
  --dms-bg: #f5f7fb;
  --dms-panel: #ffffff;
  --dms-line: rgba(15, 23, 42, 0.1);
  --dms-ink: #0f172a;
  --dms-muted: #64748b;
  --dms-radius-lg: 24px;
  --dms-radius: 18px;
  --dms-radius-sm: 12px;
  --dms-control-h: 42px;
}
```

## Animasi

Animasi yang boleh dipakai:

- Logo reveal saat loading.
- Sidebar collapse/expand.
- Bottom nav active indicator.
- Button press micro-interaction.
- Card hover ringan.
- Skeleton shimmer.
- Progress ring untuk 26 hari kerja.
- Face verification scanning state.
- Location lock/radius status animation.

Animasi yang harus dihindari:

- Animasi berulang yang berat.
- Motion yang menggeser layout.
- Efek terlalu ramai di table atau form.
- Gradient/orb dekoratif yang tidak membantu workflow.

## Mobile Standard

Employee app dan akses mobile management harus:

- Ringan di HP.
- Bottom nav maksimal 4-5 item utama.
- Tombol utama besar dan jelas.
- Input cukup tinggi untuk touch.
- Tidak ada tabel lebar tanpa mode mobile card/list.
- Status absensi terlihat dalam satu layar.
- Loading cepat dengan skeleton.

## Management Dashboard Pattern

Dashboard awal harus menampilkan:

- Total karyawan aktif.
- Karyawan masuk hari ini.
- Belum absen.
- Pending review.
- Cycle siap gajian.
- Kasbon aktif.
- Grafik kehadiran.
- List karyawan yang butuh perhatian.

## Attendance UI Pattern

Attendance monitor harus punya:

- Filter tanggal, divisi, lokasi, status.
- KPI valid/pending/rejected/belum absen.
- Table dengan nama karyawan, divisi, lokasi, check-in, check-out, GPS accuracy, face status, dan aksi review.
- Drawer detail berisi bukti selfie, koordinat, device info, dan audit log.

## Payroll UI Pattern

Payroll cycle harus sangat jelas:

- Progress `x/26 hari kerja`.
- Status cycle: active, ready, processing, paid, closed.
- Detail hari yang dihitung dan tidak dihitung.
- Bonus, potongan, dan kasbon terpisah sebagai ledger.
- Payroll final harus lock dan punya audit trail.

## Performance Rules

- Gunakan lazy loading per halaman.
- Jangan import library berat di shell/sidebar/topbar.
- Chart, map, PDF, xlsx, dan face verification harus split dari bundle utama.
- Tabel besar wajib pagination.
- Data transform berat harus pakai memoization atau backend aggregation.
- Loading state menjaga bentuk layout final.
- Hindari dependency UI baru tanpa alasan kuat.

## Validation Checklist

- Desktop expanded sidebar aman.
- Desktop collapsed sidebar aman.
- Mobile bottom nav aman.
- Text tidak overlap.
- Button dan badge tidak berubah ukuran saat status berubah.
- Empty/loading/error/access-denied state tersedia.
- Build sukses.
- App tetap ringan saat dibuka dari HP.
