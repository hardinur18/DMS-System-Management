# Operational Module Framework

Framework ini adalah standar module UI/UX untuk fitur operational app RHI System.
Golden Module Pattern saat ini adalah fitur Pesanan.

## Istilah

- **Operational Module Framework**: standar struktur modul operational.
- **Golden Module Pattern**: fitur Pesanan sebagai referensi implementasi paling lengkap.
- **Module UI Foundation**: reusable components di `src/app/components/ui/operational-page.tsx`.
- **Module Scaffold**: template awal fitur baru yang bisa digenerate.

## Komponen Wajib

Fitur baru harus mulai dari komponen ini:

- `OperationalPageShell`
- `OperationalPageHeader`
- `OperationalKpiGrid`
- `OperationalKpiCard`
- `OperationalFilterPanel`
- `OperationalTableCard`
- `OperationalEmptyState`
- `OperationalFormSection`
- `RequiredLabel`

## Scaffold Fitur Baru

Gunakan command:

```bash
npm run module:new -- NamaModul
```

Contoh:

```bash
npm run module:new -- Retur Barang
```

Output dibuat di:

```text
src/app/pages/generated/ReturBarangPage.tsx
```

Setelah generate:

1. Pindahkan file ke folder fitur yang benar bila perlu.
2. Hubungkan data, permission, route, dan sidebar secara manual.
3. Jangan ubah logic existing saat hanya mengerjakan framework UI.
4. Jalankan `npm run typecheck` dan `npm run build`.

## Struktur Modul Standar

Urutan page:

1. `OperationalPageShell`
2. `OperationalPageHeader`
3. KPI summary dengan `OperationalKpiGrid`
4. Filter/search dengan `OperationalFilterPanel`
5. Table/list dengan `OperationalTableCard`
6. Empty state dengan `OperationalEmptyState`
7. Form drawer/dialog memakai `OperationalFormSection`
8. Required field memakai `RequiredLabel`

## Visual Rules

- Surface utama putih.
- Radius card default `rounded-lg` sampai `rounded-xl`.
- Border halus `border-slate-200`.
- Shadow cukup `shadow-sm`.
- KPI card putih, warna hanya sebagai aksen teks/icon.
- Table header soft, row border tipis.
- Sidebar font mengikuti baseline Pesanan.

## Status Pesanan

Pesanan sudah menjadi baseline framework untuk:

- Page shell
- Header/actions
- KPI
- Filter/search
- Table/empty state
- Form create/edit
- Detail dialog
- Payment dialog/QRIS panel
- Sidebar typography dan collapsed flyout

