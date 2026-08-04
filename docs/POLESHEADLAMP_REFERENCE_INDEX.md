# Polesheadlamp Reference Index

Referensi UI/UX dari `hardinur18/app-polesheadlamp.id` sudah disimpan lokal supaya implementasi DMS tidak dibuat berdasarkan tebakan visual.

## Source Files

- `src/reference/polesheadlamp/foundation.css`
  - Sumber token, typography, app shell, sidebar, nav item, mobile nav, login, KPI, table, empty state, dan animation.

- `src/reference/polesheadlamp/Sidebar.tsx`
  - Sumber struktur sidebar desktop/collapsed/mobile, nav grouping, active state, flyout, brand area, dan user card.

- `src/reference/polesheadlamp/operational-page.tsx`
  - Sumber komponen page standar: page shell, header, KPI grid, KPI card, filter panel, table card, skeleton, dan form section.

- `docs/reference/polesheadlamp/ui-ux-performance-blueprint.md`
  - Arah umum UI/UX dan performance rules.

- `docs/reference/polesheadlamp/operational-ui-ux-standardization.md`
  - Standard visual, typography, table, form, modal, dan checklist per modul.

- `docs/reference/polesheadlamp/operational-module-framework.md`
  - Pattern modul operasional baru.

## Rules Untuk DMS

- Login page harus mengikuti blok `.loginShell`, `.loginCard`, `.loginMark`, `.inputWithIcon`, dan `.loginButton` dari `foundation.css`.
- Sidebar collapsed harus mengikuti `.sidebar.collapsed`, `.brand`, `.brandMark`, `.navItem`, `.navGroup`, dan `.sidebarUser` dari `foundation.css`.
- Semua page management harus memakai komponen standar dari `src/components/operational-page.tsx`, yang diadaptasi dari reference.
- Perbedaan warna hanya boleh untuk brand DMS: navy dan cyan. Ukuran, spacing, radius, shadow, dan typography mengikuti reference.
- Jika tampilan terasa beda, cek reference file dulu sebelum membuat CSS baru.

## Modul DMS Mapping

- Dashboard -> Dashboard
- Karyawan -> Prospek/Users-style operational table pattern
- Absensi -> Monitoring/Teknisi & Lapangan pattern
- Payroll -> Finance/Payroll pattern
- Kasbon -> Finance/Debts/Wallet pattern
- Laporan -> Laporan Operasional pattern
- System -> Sistem & Akses pattern
