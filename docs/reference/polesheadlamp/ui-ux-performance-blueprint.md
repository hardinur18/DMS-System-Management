# Polesheadlamp.id V2 UI/UX + Performance Blueprint

Dokumen ini adalah arah migrasi UI/UX Polesheadlamp.id v2. Referensi visual dan ritme aplikasi mengikuti project `Tokotemansaya system Internal`, tetapi logic bisnis Polesheadlamp tetap menjadi sumber kebenaran.

## Tujuan

- Membuat aplikasi terasa seperti internal project management tool yang cepat, rapi, dan enak dipakai harian.
- Menjaga database, service query, permission, role, route penting, dan workflow bisnis tetap stabil.
- Mengurangi noise visual di sidebar, halaman, tabel, filter, modal, dan loading state.
- Menjaga performa sebagai standar setiap batch, bukan pekerjaan akhir.

## Prinsip Foundation

- Layout padat dan mudah discan, bukan landing page.
- Tabel, filter, form, modal, badge status, dan empty/loading state harus konsisten.
- Font size stabil memakai token, tidak mengikuti viewport width.
- Sidebar dikelompokkan berdasarkan alur kerja: cari customer, follow up, order, eksekusi teknisi, finance, admin.
- Komponen shared diperbaiki lebih dulu supaya banyak halaman ikut rapi tanpa rewrite logic.
- UI boleh berubah besar, tetapi service, permission, dan kalkulasi tidak boleh berubah tanpa alasan bisnis yang jelas.

## Mapping Modul

Dashboard:
Ringkasan role Owner, Advertiser, CS, dan Teknisi. UI boleh disatukan, data tetap mengikuti permission.

Akuisisi & Iklan:
Iklan Harian, Monitoring Perf., OKR CS, Affiliate.

Prospek & Channel:
Prospek, Embed Form, Galeri Bukti.

WhatsApp:
Dashboard, Chats, Contacts, Templates, Broadcasts, Analytics, Storage, Inbox Settings, Accounts.

Pesanan & Jadwal:
Pesanan & Penugasan, Jadwal, Laporan Operasional.

Teknisi & Lapangan:
Ketersediaan Teknisi, Jadwal Saya, Aktivitas Teknisi, Pemantauan Lapangan, Peta Sebaran.

Keuangan Operasional:
Payroll & Gaji, Pembayaran, Pengeluaran Rutin, Biaya Operasional, Hutang & Piutang.

Administrasi:
Inventory, Master Data, Pengguna & Akses, Role Permission, Kontrol Pemakaian, Template WhatsApp.

## Performance Rules

- Pertahankan lazy loading per halaman.
- Vendor besar tetap dipisah: charts, xlsx, pdf, map, csv, Supabase.
- Jangan import library berat di shell, sidebar, topbar, atau komponen global.
- Loading page memakai skeleton yang menjaga bentuk layout final.
- Tabel besar wajib punya pagination, filter yang jelas, dan action column yang stabil.
- Hindari transformasi data berat langsung di render; gunakan memoization di halaman yang datanya besar.
- Hindari refetch berulang untuk data master yang sudah ada di context.
- Jangan menambah dependency UI baru tanpa alasan kuat.

## Batch Plan

1. Foundation shell:
   Sidebar, app shell, topbar, loading state, token global, dan komponen shared operational.

2. Core workflow:
   Dashboard, Iklan Harian, Monitoring Perf., Prospek, Pesanan & Penugasan.

3. Field workflow:
   Jadwal, Teknisi Mobile, Ketersediaan Teknisi, Aktivitas Teknisi, Pemantauan Lapangan.

4. Finance workflow:
   Payroll, Pembayaran, Pengeluaran Rutin, Biaya Operasional, Hutang & Piutang, Payment Gateway.

5. Admin workflow:
   Master Data, User & Akses, Role Permission, Inventory, Template WhatsApp.

6. WhatsApp workspace:
   Dikerjakan terakhir karena modul ini besar dan sensitif untuk produktivitas CS.

## Cleanup Rules

- Hapus file hanya jika tidak punya import, route, atau dependency runtime.
- Jangan hapus migration database lama hanya karena fitur UI dihapus, selama database live/shared masih memakai schema yang sama.
- Jangan hapus permission key yang masih menjadi guard data agregat atau compatibility role.
- Setiap cleanup harus lolos typecheck, lint, dan build.

## Validation Checklist

- `npm run typecheck:full`
- `npm run lint`
- `npm run build`
- Cek manual minimal: Owner, Advertiser, CS, Teknisi.
- Cek desktop expanded, desktop collapsed, dan mobile menu.
