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

## Tipografi

- Gunakan Plus Jakarta Sans sebagai font utama untuk app operasional.
- Body text, deskripsi, helper text, dan metadata memakai weight ringan-menengah, sekitar `400-500`.
- Teks utama di table/dropdown memakai `500-560`, bukan bold penuh.
- Label kecil, tab, dan control memakai `560-620` agar tetap jelas saat discan.
- Heading section/dialog memakai `700-760`; hindari `800-900` kecuali untuk hero/title yang sangat penting.
- Angka KPI boleh lebih kuat, sekitar `760-780`, karena berfungsi sebagai anchor visual.
- Tombol utama memakai `600-650`; secondary button lebih ringan.
- Jangan memakai `<strong>` untuk layout biasa. Pakai class foundation seperti `TableText`, status text, atau component-specific class agar bobot huruf bisa dikontrol global.
- Hindari semua teks dalam satu card/table terlihat bold bersamaan. Satu blok sebaiknya punya kontras: label ringan, value sedang, angka/status lebih tegas.

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
- `FoundationDialog`
- `FoundationRefreshButton`
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
- `FormField` boleh memakai helper text pendek untuk menjelaskan dampak field; helper text harus ringan, tidak bold, dan tidak menggantikan validasi.
- `TextFormField` untuk input text, email, number, dan field umum.
- `SelectFormField` untuk dropdown native yang sudah distyling ulang.
- `DateFormField` untuk field tanggal dengan kalender custom, termasuk disabled state saat schema/fitur backend belum tersedia.
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

Modul dialog reusable:

- `FoundationDialog` berada di `src/components/foundation-dialog.tsx`.
- Dialog web operasional memakai layout landscape, overlay full viewport, close button ringan, dan body/action sticky sesuai kebutuhan konten.
- Mode panduan memakai `mode="guide"` agar desktop tampil lebar landscape dan mobile menjadi bottom sheet yang center, tidak nempel kanan.
- `FoundationDialogCloseButton` dipakai untuk tombol X konsisten tanpa background dekoratif berlebihan.
- Jangan membuat dialog form/panduan dengan ukuran portrait desktop kecuali kontennya memang pendek.

Modul refresh reusable:

- `FoundationRefreshButton` berada di `src/components/foundation-refresh-button.tsx`.
- Semua tombol refresh data backend memakai komponen ini agar loading icon/spin, disabled state, dan label konsisten.
- Refresh tidak boleh menghapus UI lama bila cache data sudah ada; hanya update data dari backend.
- Untuk proses domain selain refresh, gunakan button biasa dengan loading label yang spesifik, misalnya `Proses Absensi`.
- Command backend yang meminta perangkat eksternal melakukan aksi tidak memakai label refresh. Gunakan label domain yang jelas, misalnya `Sync User Mesin`, karena action ini membuat command ADMS dan menunggu mesin polling receiver.

## Modul UI Operasional

Komponen operasional reusable:

- Card KPI memakai `OperationalKpiGrid` dan `OperationalKpiCard` di `src/components/operational-page.tsx`.
- Card filter memakai `OperationalFilterPanel` di `src/components/operational-page.tsx`.
- Tab kategori memakai `CategoryTabs` di `src/components/category-tabs.tsx`.
- Table wrapper memakai `OperationalTableCard` di `src/components/operational-page.tsx`.
- Data table memakai `TableText`, `TableNumberCell`, `RowActionMenu`, dan `RowActionMenuItem` di `src/components/data-table.tsx`.
- Row table yang membuka detail memakai `ClickableTableRow` di `src/components/data-table.tsx`.
- Pagination table memakai `DataTablePagination` di `src/components/data-table.tsx`.
- Loading dan cache data memakai `FoundationSkeleton`, `FoundationTableSkeletonRows`, dan `useFoundationCachedData` di `src/components/foundation-loading.tsx`.

Standar filter operasional:

- Page berbasis karyawan wajib menyediakan filter divisi bila data row punya `divisionName`.
- Urutan filter yang disarankan: tanggal/periode bila ada, divisi, search, status, lalu reset.
- Filter divisi memakai `FoundationSelect`, bukan dropdown native browser.
- Reset filter harus mengembalikan search, divisi, status, dan tanggal/periode ke default page tersebut.
- Angka tab, meta header, tabel, dan riwayat terkait harus membaca dataset yang sudah terfilter agar tidak membingungkan.

Standar tab kategori:

- Desktop memakai compact pill tabs.
- Mobile memakai horizontal scroll tanpa scrollbar visual.
- Tab strip wajib mendukung swipe touch dan drag mouse agar item yang overflow tetap bisa dicapai di mobile preview desktop.
- Active state memakai border, soft gradient layer, shadow kecil, dan count badge aktif.
- Tab tidak boleh dibungkus card tambahan bila hanya berfungsi sebagai selector ringan.

## Modul UI Loading

Pattern resmi loading DMS adalah **skeleton loading** dengan **shimmer effect**.

Komponen foundation:

- `FoundationSkeleton`: placeholder kecil untuk value KPI, inline stats, tab count, dropdown value, text, badge, avatar, dan tombol.
- `FoundationTableSkeletonRows`: placeholder row table untuk data yang sedang diambil dari Supabase.
- `useFoundationCachedData`: hook cache/loading standar untuk page yang membaca data dari Supabase/API. First load menampilkan skeleton, data yang sudah pernah dimuat langsung tampil saat user kembali ke page, dan refresh berikutnya berjalan silent.
- `getFoundationCachedData`, `setFoundationCachedData`, `clearFoundationCachedData`: helper cache bila page perlu membaca, menyimpan, atau menghapus cache data secara eksplisit.

Aturan penggunaan:

- Page data baru wajib memakai `useFoundationCachedData` atau pola yang setara sebelum membuat state loading manual.
- Skeleton hanya dipakai untuk bagian yang sumbernya dari database/API, bukan untuk mengganti seluruh UI page.
- Page shell, header, action button, tab, filter, table header, dan struktur layout harus tetap tampil.
- Saat first load, value data boleh skeleton shimmer, tetapi layout final tidak boleh hilang.
- Saat user pindah page lalu kembali, pakai cache state terakhir dan jangan menampilkan loading ulang bila data sudah pernah dimuat.
- Manual `Refresh Data` boleh mengambil data baru, tetapi jangan mengosongkan UI lama kecuali datanya benar-benar belum pernah ada.
- Pisahkan `loading` untuk first load dan `refreshing` untuk background refresh. Tabel membaca `loading`, sedangkan tombol `Refresh Data` boleh membaca `loading || refreshing`.
- Jangan memakai text `...` sebagai loading data. Gunakan skeleton shimmer.
- Jangan memakai progress bar besar untuk table/dashboard data biasa. Progress bar hanya untuk proses panjang yang punya tahapan nyata.
- Empty state hanya muncul setelah request selesai dan hasil data memang kosong.

## Dashboard Pattern

Dashboard adalah ringkasan operasional, bukan tempat CRUD utama.

- Data dashboard wajib memakai cache foundation agar user tidak melihat blank loading saat kembali dari page lain.
- Filter dashboard harus benar-benar memfilter data yang tampil: pencarian, divisi, dan status tidak boleh hanya visual.
- KPI atas membaca scope filter aktif agar angka yang tampil sesuai tabel dan insight.
- Gunakan visual ringan seperti progress bar kecil, signal list, dan source badge untuk scanning cepat. Hindari card berulang terlalu banyak.
- Tabel dashboard wajib bisa horizontal scroll/drag, punya pagination, dan export yang membaca data hasil filter.
- Tombol `Refresh Data` melakukan refresh backend/silent revalidate tanpa menghapus UI lama.

## Attendance Source Pattern

Setiap UI yang menampilkan `attendance_logs` harus mempertahankan sumber data absensi, terutama saat Biofinger sudah online.

- Query attendance wajib membawa `source`, `attendance_media`, `attendance_device_id`, dan `biofinger_event_id` bila tersedia.
- Tabel Live Absensi menampilkan sumber per event, misalnya `Biofinger / Fingerprint`, `App Lapangan / GPS`, `Kiosk / Barcode`, atau `Manual HR / Manual`.
- Detail absensi harus menampilkan sumber check-in dan check-out agar HR bisa audit tanpa membuka raw event.
- Label sumber cukup berupa text/chip kecil, bukan tombol aksi.
- Biofinger yang sudah dikonversi ke absensi final tetap bisa ditelusuri dari `biofinger_event_id`.
- Tabel mapping Biofinger punya kontrol `Urutan`; default-nya `User ID Tertinggi`, dengan opsi `Terbaru dari Mesin` dan `User ID Terendah`.
- Biofinger punya dua action berbeda: `Sync User Mesin` untuk meminta payload USERINFO dari AT-301, dan `Refresh Data` untuk membaca ulang data Supabase yang sudah masuk.
- Receiver Biofinger production memakai auto-convert: raw event `mapped` otomatis menjadi `attendance_logs` dan masuk Live Absensi. Tombol `Proses Absensi` hanya fallback manual/debug.

## Attendance Shift Settlement Pattern

Live Absensi dan Rekap Absensi tidak boleh hanya membaca durasi mentah dari `attendance_logs`. Setiap tampilan harian harus menjelaskan hubungan antara log aktual dan kewajiban shift karyawan.

- Data jadwal wajib berasal dari `employees.shift_id` ke `shifts.start_time` dan `shifts.end_time`.
- Check-in aktual memakai log `check_in`; check-out aktual memakai log `check_out`.
- Untuk Biofinger, event final tetap mengikuti rule check-in paling awal dan check-out paling akhir per karyawan/tanggal.
- UI menampilkan `Jadwal & Jam`: nama shift, jam jadwal, jam wajib, jam aktual, telat, pulang cepat, kurang jam, dan lewat shift bila ada.
- Toleransi telat dan toleransi pulang cepat berasal dari Master Data Shift. Nilainya disimpan sebagai snapshot di `attendance_daily_summaries` agar hasil audit harian tetap stabil walaupun aturan shift diedit setelahnya.
- Sort default Live Absensi adalah aktivitas terbaru di paling atas. Karyawan tanpa aktivitas hari itu turun setelah baris yang punya update.
- Detail Live Absensi dan Rekap Absensi memakai inline collapse di bawah baris agar HR tetap punya konteks tabel. Modal detail hanya dipakai untuk aksi fokus seperti koreksi, approval, atau form yang butuh konfirmasi.
- Teks dalam table Live Absensi harus medium, bukan bold semua. Gunakan bobot tebal hanya untuk angka ringkasan, judul section, status penting, dan CTA.
- Row utama Live Absensi maksimal tiga baris informasi per kolom dan rata atas. Keterangan panjang, sumber lengkap, metrik telat, pulang cepat, kurang jam, dan kelebihan jam dipindahkan ke inline collapse.
- Inline collapse Live Absensi tidak memakai card bertumpuk; gunakan satu panel detail dengan section datar dan divider ringan.
- Summary metrik Live/Rekap Absensi memakai strip datar dengan divider halus. Hindari deretan mini-card berborder karena membuat area monitoring terlihat berat.
- Shadow halaman monitoring harus subtle. Filter panel dan summary strip memakai border/spacing sebagai hirarki utama; shadow hanya tipis untuk memisahkan surface dari background.
- Table Live Absensi dan Rekap Absensi wajib memakai pagination foundation dengan pilihan 25, 50, dan 100 baris per halaman. Nomor baris mengikuti offset halaman.
- Filter tanggal Live Absensi dan Rekap Absensi wajib memakai `DateModePicker` sebagai satu-satunya sumber range. Jangan menambah segmented range lokal terpisah di page Rekap.
- Rekap Absensi memakai loader khusus yang hanya mengambil summary harian, karyawan, lokasi, shift, payroll cycle, dan log evidence seperlunya. Queue review, overtime, app user, dan face profile tidak ikut dimuat kecuali page lain membutuhkannya.
- Status filter Rekap Absensi harus mengikuti settlement operasional: sesuai shift, kurang jam, telat, pulang cepat, lewat shift, sedang berjalan, belum checkout, belum masuk, perlu review, tidak valid, dan shift belum lengkap.
- Detail Rekap Absensi wajib menampilkan toleransi shift yang dipakai saat kalkulasi agar angka telat dan pulang cepat bisa diaudit.
- Detail Rekap Absensi di desktop tidak memakai dialog potret; informasi panjang seperti sumber event, toleransi, validasi, payroll cycle, dan catatan masuk ke inline collapse.
- `telat` dan `pulang cepat` dihitung setelah toleransi shift. `kurang jam` tetap indikator operasional/review; jangan otomatis memotong payroll sebelum policy payroll disetujui.
- Settlement backend di `attendance_daily_summaries` adalah sumber utama Live Absensi/Rekap Absensi untuk status harian, jadwal shift, jam aktual, kurang jam, telat, pulang cepat, overtime, dan workday counted. Raw `attendance_logs` dipakai sebagai sumber detail/evidence.
- Shift malam boleh melewati tanggal kalender. Backend harus menyimpan `scheduled_end_at` di tanggal berikutnya bila `end_time <= start_time`.
- Koreksi checkout harus menyediakan tanggal dan jam pulang. Untuk shift reguler tanggal pulang sama dengan tanggal absensi; untuk shift malam boleh tanggal berikutnya.
- Tombol `Refresh Data` di Live/Rekap menjalankan refresh summary backend untuk tanggal operasional terbaru. Bila range terlalu besar, backend refresh dibatasi ke maksimal 31 hari terakhir agar tidak timeout, sementara UI tetap membaca range yang dipilih.
- Refresh payroll/overtime yang berat hanya dijalankan dari view Payroll atau Approval saat tab Lembur aktif, bukan setiap kali HR membuka Live Absensi.
- Load awal halaman cukup membaca data summary yang sudah ada agar UI tidak terasa berat.

## Overtime Payroll Pattern

Lembur payroll tidak boleh sekadar membaca `pulang lewat jam shift`.

- Live Absensi boleh menampilkan `pulang lewat` sebagai indikator operasional.
- Kandidat lembur hari kerja biasa memakai menit payable dari waktu `di luar shift`: sebelum jam masuk shift + setelah jam pulang shift.
- Rumus aman: `min(menit di luar shift, jam aktual - kewajiban shift)`.
- Jika karyawan masuk lebih awal atau pulang lewat tetapi total jam aktual masih kurang dari kewajiban shift, lembur payable adalah 0.
- Contoh shift 08.00-16.00: check-in 06.00 dan check-out 16.00 berarti kandidat lembur sebelum shift 2 jam.
- Komponen lembur wajib punya `overtime_basis`: `extra_after_shift` untuk hari kerja biasa, `full_duration` untuk Minggu/hari libur.
- Untuk Minggu/hari libur, payable lembur adalah full durasi kerja aktual dari check-in sampai check-out.
- `full_duration` tidak boleh dipakai untuk `Semua Hari` karena bisa membuat hari kerja normal terhitung full lembur.
- Kandidat lembur dibuat otomatis dari `attendance_daily_summaries` setelah check-out final.
- HR/Finance tetap wajib approve/reject menit yang dibayar sebelum masuk payroll amount.
- Form manual lembur hanya untuk exception atau koreksi khusus; flow utama berasal dari absensi final.
- Approved overtime memperbarui `payroll_cycles.overtime_amount`; locked/paid payroll tidak boleh berubah tanpa audit.
- Lembur terencana dibuat dari Approval > Lembur > Request Lembur. Status awalnya `Terencana/draft`, tidak payable.
- Request lembur menyimpan karyawan, tanggal, jam rencana mulai-selesai, alasan, pembuat request, dan waktu request.
- Setelah checkout real masuk dan settlement menghitung menit payable, request berubah menjadi kandidat `Pending` untuk approval pembayaran.
- Tabel Approval Lembur wajib memperlihatkan basis hitung dan status realisasi: `Sesuai request`, `Kurang dari request`, `Lebih dari request`, `Tanpa request`, atau `Menunggu checkout`.
- Approval payroll tidak boleh aktif untuk request yang belum punya checkout real dan `overtime_minutes > 0`.
- Tabel Approval Lembur boleh menampilkan request terencana, tapi harus jelas membedakan `Terencana`, `Pending`, `Approved`, dan `Rejected`.
- Default filter Approval Lembur menampilkan queue aktif dan approved saja. `Rejected` dipertahankan sebagai riwayat audit, tetapi dibuka lewat filter eksplisit agar tabel utama tidak penuh.
- Detail Approval Lembur memakai inline collapse datar seperti tab Absensi Review. Row utama hanya ringkasan; rencana, realisasi checkout, rate, basis hitung, catatan request, dan nominal payroll masuk ke collapse.
- Menu Approval menjadi pusat queue operasional. Tab Absensi Review menampung GPS/face/manual review, sedangkan tab Lembur menampung request terencana, kandidat pending, approved, dan rejected.
- Halaman Approval boleh dibuka oleh `attendance.review` atau `overtime.review`; tab yang tampil wajib mengikuti permission user agar Finance bisa review lembur tanpa harus diberi akses approve absensi.
- Aksi massal di Approval wajib memakai dialog konfirmasi. Reject wajib punya catatan agar audit trail bisa ditelusuri.
- Detail Approval Absensi memakai inline collapse datar seperti Live/Rekap. Isi collapse dibagi section Masuk/Pulang dengan evidence dan aksi review, tanpa card bertumpuk; tombol expand row icon-only tanpa border/background.
- Dialog Review Absensi wajib menampilkan sumber event (`Biofinger / Fingerprint`, `App Lapangan`, `Kiosk`, atau `Manual HR`) dan raw `biofinger_event_id` bila tersedia, supaya HR bisa audit asal data tanpa membuka database.
- Semua aksi Approval yang mengubah absensi atau lembur wajib menolak perubahan jika payroll cycle tanggal tersebut sudah `locked` atau `paid`.

## Master Data Form Mapping

Form Master Data harus mengikuti kategori aktif:

- Role Management: nama role, kode otomatis, level akses, deskripsi, status.
- Divisi: nama divisi, kode otomatis, deskripsi divisi, status.
- Jabatan: nama jabatan, kode otomatis, divisi terkait, deskripsi jabatan, status.
- Shift: nama shift, kode otomatis, jam mulai, jam selesai, toleransi telat, toleransi pulang cepat, catatan shift, status.
- Lokasi Kerja: nama lokasi, kode otomatis, alamat, latitude, longitude, radius meter, status.
- Komponen Gaji: nama komponen, kode otomatis, jenis komponen, unit hitung, rate, tipe hari, basis lembur, auto detect, approval, deskripsi, status.

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

## Date Picker Foundation

Tanggal punya dua komponen foundation:

- `DatePickerField` di `src/components/date-picker-field.tsx` untuk form tanggal tunggal, seperti tanggal masuk karyawan.
- `DateModePicker` di `src/components/date-mode-picker.tsx` untuk filter halaman operasional/report yang butuh mode relatif: hari ini, kemarin, 7 hari, 30 hari, per hari, per minggu, per bulan, tahun, dan semua waktu.

- Trigger harus berupa control penuh seperti input foundation: icon kalender di kiri, teks satu baris, chevron di kanan, dan state aktif memakai ring cyan.
- Popover desktop memakai layout landscape compact: quick preset ramping di kiri dan kalender di kanan. Kontrol tanggal tidak boleh terasa seperti modal besar.
- Popover mobile berubah menjadi bottom sheet satu kolom yang tidak melebar keluar viewport; quick preset tampil di atas kalender.
- `DateModePicker` memakai satu kalender compact untuk mode tanggal tunggal dan dua kalender compact untuk mode range/report.
- Navigasi kalender harus punya tombol bulan sebelum/sesudah dan tahun sebelum/sesudah.
- Tanggal aktif memakai fill biru/cyan; tanggal hari ini cukup outline ringan.
- Range aktif wajib diberi warna start, middle, dan end yang halus agar user paham periode yang sedang dibaca.
- Filter Live Absensi wajib memakai `DateModePicker`, bukan komponen lokal di page.
- Jangan memakai native `input[type=date]` untuk form utama karena visual browser tidak konsisten.

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

## Dropdown Select Pattern

Dropdown untuk filter dan form wajib memakai komponen foundation, bukan native select browser, kecuali kebutuhan sistem benar-benar sederhana.

- Trigger mengikuti tinggi, radius, border, focus ring, dan typography input form.
- Menu menggunakan portal agar tidak kepotong oleh table, drawer, atau dialog.
- Search muncul untuk opsi panjang.
- Scroll di dalam menu tidak boleh menutup dropdown.
- Scroll container luar harus menjaga posisi menu, bukan membuat menu terasa loncat.
- Option aktif memakai highlight ringan dan ikon check, bukan warna blok berat.
- Dropdown di mobile tetap nyaman disentuh dan tidak membuat dialog melebar.
- Trigger dropdown harus menampilkan value paling penting saja. Detail pendukung seperti kode karyawan boleh tampil sebagai teks kecil di option menu, bukan ikut memenuhi trigger.

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
- Transisi payroll yang sudah berjalan sebelum DMS memakai `Saldo Awal Cycle` dan `Tanggal Awal Cycle` di form karyawan hanya untuk metode `Cycle 26 Hari`. Contoh: sudah jalan 15 hari, isi saldo awal 15 agar absensi real berikutnya menjadi 16/26. Metode kalender/custom tidak menampilkan dan tidak menyimpan saldo awal cycle.
- Bahasa status payroll di UI: `Berjalan`, `Siap Dicek`, `Menunggu Bayar`, `Terbayar`, dan `Dibatalkan`. Hindari label teknis seperti locked/paid/void di tampilan operasional.
- Detail hari yang dihitung dan tidak dihitung.
- Bonus, potongan, dan kasbon terpisah sebagai ledger.
- Payroll final harus lock dan punya audit trail.
- Proses payroll harus dipisah menjadi workspace: `Gaji 26 Hari`, `Bayar Lembur`, dan `Riwayat Bayar`.
- Di workspace `Gaji 26 Hari`, tab status minimal: `Siap Dicek`, `Menunggu Bayar`, `Berjalan`, `Dibatalkan`, dan `Semua Gaji`. `Menunggu Bayar` berarti nominal sudah difinalkan dan siap dicatat sebagai terbayar.
- Action `Tandai Terbayar` gaji wajib membuat baris di `payroll_payments` berisi nomor bayar, tanggal bayar, metode, referensi, nominal, actor, dan catatan finance.
- Approved overtime punya dua jalur sah: ikut gajian setelah cycle 26 hari, atau dibayar terpisah mingguan/custom dari workspace `Bayar Lembur`.
- Lembur yang sudah dibayar terpisah wajib masuk `overtime_payments`, tampil di `Riwayat Bayar`, dan dikeluarkan dari perhitungan tambahan lembur di payroll cycle 26 hari agar tidak double-pay.
- Batalkan pembayaran lembur hanya boleh jika cycle terkait belum final/terbayar/dibatalkan, lalu request lembur kembali menjadi belum dibayar.
- Data yang sudah `Terbayar` tidak boleh berubah otomatis saat refresh absensi/lembur. Kalau perlu koreksi setelah terbayar, lakukan via reversal/pembatalan terkontrol, bukan edit diam-diam.
- Sebelum payroll dibayar, sistem wajib menolak jika masih ada absensi review atau lembur draft/pending di periode cycle tersebut.
- Summary finance harus langsung menjawab total gaji siap proses, lembur belum dibayar, total sudah terbayar, dan cycle yang masih berjalan.

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
