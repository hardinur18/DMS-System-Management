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
- `LoadingSkeleton`
- `ConfirmDialog`
- `FormDrawer`
- `DetailDrawer`
- `DateRangeFilter`
- `SearchInput`
- `ActionMenu`

## Modul UI Form

Form DMS memakai foundation reusable di `src/components/form-field.tsx`:

- `FormField` untuk wrapper label dan control.
- `TextFormField` untuk input text, email, number, dan field umum.
- `SelectFormField` untuk dropdown native yang sudah distyling ulang.
- `DateFormField` untuk field tanggal dengan kalender custom.
- `DatePickerField` berada di `src/components/date-picker-field.tsx` dan menggantikan native browser date picker.

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

Standar tab kategori:

- Desktop memakai compact pill tabs.
- Mobile memakai horizontal scroll tanpa scrollbar visual.
- Active state memakai border, soft gradient layer, shadow kecil, dan count badge aktif.
- Tab tidak boleh dibungkus card tambahan bila hanya berfungsi sebagai selector ringan.

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
