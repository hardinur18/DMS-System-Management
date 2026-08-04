# Operational UI/UX Standardization

Dokumen ini menjadi pegangan refactor UI/UX bertahap untuk aplikasi RHI System.
Tujuannya membuat aplikasi terasa lebih profesional, konsisten, dan mudah discan tanpa mengubah logic bisnis, permission, endpoint, atau kalkulasi yang sudah berjalan.

## Prinsip Produk

- Aplikasi ini adalah operational ERP/CRM internal, bukan landing page.
- UI harus tenang, padat, rapi, dan cepat dibaca.
- Refactor dilakukan bertahap per modul, bukan redesign total.
- Logic fitur, data flow, permission, dan business calculation tidak boleh berubah kecuali eksplisit diminta.
- Setiap tahap wajib lolos `npm run typecheck` dan `npm run build`.

## Visual Standard

- Page background: `bg-slate-50` atau existing app background yang setara.
- Main content width: gunakan container konsisten, ideal `max-w-[1540px]` sampai `max-w-[1600px]`.
- Page padding: `px-4 py-4 md:px-6`.
- Card radius: `rounded-lg` atau `rounded-xl`, jangan terlalu bulat.
- Border: `border-slate-200` / `dark:border-slate-800`, hindari border hitam kontras.
- Shadow: maksimal `shadow-sm`, hanya untuk surface utama.
- Table header: text kecil, uppercase, background soft.
- Table row: border tipis, hover ringan.
- Button height: `h-9` untuk toolbar, `h-10` untuk form/filter.
- Input/select height: `h-9` atau `h-10`, konsisten dalam satu panel.
- Required marker: semua field wajib pakai `*` merah.
- Toast error: tidak menampilkan raw error seperti `HTTP 404`; harus human-readable.

## Typography Standard

- Page title: `text-xl` sampai `text-2xl`, `font-semibold`.
- Page subtitle: `text-sm text-slate-500`.
- Section title: `text-sm` sampai `text-base`, `font-semibold`.
- Table header: `text-xs uppercase tracking-wide`.
- Table body: `text-sm`.
- Form label: `text-sm font-medium`.
- Numeric KPI: `text-2xl font-semibold`.

## Standard Components

Komponen standar bertahap berada di `src/app/components/ui/operational-page.tsx`.

- `OperationalPageShell`
  Container standar untuk semua page operasional.

- `OperationalPageHeader`
  Header standar berisi eyebrow optional, title, subtitle, dan action buttons.

- `OperationalKpiGrid`
  Grid KPI responsive.

- `OperationalKpiCard`
  Summary card standar.

- `OperationalFilterPanel`
  Surface filter standar.

- `OperationalTableCard`
  Surface table standar.

- `OperationalEmptyState`
  Empty/loading/error state sederhana.

- `RequiredLabel`
  Label form dengan marker wajib.

- `OperationalFormSection`
  Section standar untuk form drawer/dialog.

## Scaffold Modul Baru

Fitur baru bisa dibuat dari scaffold:

```bash
npm run module:new -- NamaModul
```

Dokumentasi lengkap ada di `guidelines/Operational-Module-Framework.md`.

## Module Pattern

Urutan struktur page standar:

1. `OperationalPageShell`
2. `OperationalPageHeader`
3. Inline warning/error bila ada
4. `OperationalKpiGrid`
5. `OperationalFilterPanel`
6. `OperationalTableCard`
7. Dialog create/edit/detail/delete

## Checklist Global

- [x] Buat dokumen standar UI/UX.
- [x] Buat fondasi komponen standar untuk page operasional.
- [x] Apply standar ke Master Data > Kategori Biaya.
- [ ] Apply standar ke Biaya Operasional.
- [ ] Apply standar ke tab Master Data lain.
- [ ] Apply standar ke Finance pages lain.
- [x] Apply standar ke Pesanan.
- [x] Buat scaffold/generator untuk fitur baru.
- [ ] Apply standar ke Prospek.
- [ ] Apply standar ke Schedule.
- [ ] Apply standar ke Monitoring Teknisi.
- [ ] Apply standar ke Ads Monitoring.
- [ ] Apply standar ke Dashboard Owner.
- [ ] Apply standar ke Settings, User, Role, Audit Log.
- [ ] Audit mobile/tablet.
- [ ] Audit empty/loading/error/access-denied states.

## Per Modul Checklist

Gunakan checklist ini setiap refactor modul.

- [ ] Tidak mengubah logic bisnis.
- [ ] Tidak mengubah endpoint kecuali memang tugas modul tersebut.
- [ ] Tidak mengubah permission behavior.
- [ ] Header page sesuai standar.
- [ ] KPI cards sesuai standar.
- [ ] Filter panel sesuai standar.
- [ ] Table surface sesuai standar.
- [ ] Table row/header tidak memakai border kontras.
- [ ] Form dialog punya required marker.
- [ ] Validasi form jelas dan human-readable.
- [ ] Empty state ada icon, title, dan deskripsi singkat.
- [ ] Loading state tidak menggeser layout berlebihan.
- [ ] Error state tidak menampilkan raw backend message bila tidak perlu.
- [ ] Mobile responsive tetap aman.
- [ ] `npm run typecheck` sukses.
- [ ] `npm run build` sukses.

## Prioritas Refactor

1. Master Data > Kategori Biaya
2. Biaya Operasional
3. Master Data tab lain
4. Finance pages
5. Pesanan
6. Prospek
7. Schedule
8. Monitoring Teknisi
9. Ads Monitoring
10. Dashboard Owner
11. Settings, Users, Role Permission, Audit Log

## Catatan Implementasi

- Refactor UI harus kecil dan mudah direview.
- Jangan mengganti banyak halaman sekaligus bila belum ada komponen standar yang stabil.
- Kalau sebuah page punya pattern unik yang penting secara workflow, pertahankan workflow-nya dan hanya rapikan surface visual.
- Setiap modul yang sudah distandarkan harus ditandai di checklist global.
