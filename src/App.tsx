import { Fragment, FormEvent, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  AlertCircle,
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  CalendarCheck2,
  ClipboardList,
  ChevronDown,
  CreditCard,
  Crown,
  Database,
  Eye,
  EyeOff,
  FileBarChart,
  FileCheck2,
  LayoutDashboard,
  LocateFixed,
  LogIn,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Menu,
  Megaphone,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  ScanFace,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import clsx from "clsx"

import dmsLogo from "../assets/brand/dms-logo.jpeg"
import { CategoryTabs } from "./components/category-tabs"
import { RowActionButton, TableNumberCell, TableText } from "./components/data-table"
import { DateFormField, SelectFormField, TextFormField } from "./components/form-field"
import { AutoStatusBadge, StatusBadge as UiStatusBadge } from "./components/status-badge"
import {
  OperationalFilterPanel,
  OperationalKpiCard,
  OperationalKpiGrid,
  OperationalPageHeader,
  OperationalPageShell,
  OperationalTableCard,
} from "./components/operational-page"
import { supabase } from "./lib/supabase"

type ViewId =
  | "dashboard"
  | "attendance-live"
  | "employees"
  | "attendance-requests"
  | "attendance-review"
  | "field-monitoring"
  | "payroll"
  | "cash-advance"
  | "work-locations"
  | "master-data"
  | "users"
  | "role-permission"
  | "audit-log"
type AttendanceStatus = "valid" | "pending" | "failed" | "missing"
type PayrollStatus = "active" | "ready" | "paid"

interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
  group: string
}

interface EmployeeRow {
  id: string
  name: string
  division: string
  location: string
  attendance: AttendanceStatus
  faceScore: number | null
  cycleDays: number
  payrollStatus: PayrollStatus
  kasbon: number
}

type ModuleViewId = Exclude<ViewId, "dashboard" | "master-data" | "users" | "role-permission" | "audit-log">

interface ModuleKpi {
  label: string
  value: string | number
  detail: string
  icon: LucideIcon
  tone: "default" | "blue" | "green" | "amber" | "rose" | "violet"
}

interface ModuleFormField {
  label: string
  placeholder: string
  type?: "text" | "number" | "date"
}

interface ModuleConfig {
  subtitle: string
  kpis: ModuleKpi[]
  filters: string[]
  formTitle: string
  formDescription: string
  formFields: ModuleFormField[]
  tableTitle: string
  tableDescription: string
  columns: string[]
  rows: Array<Record<string, string | number>>
}

type UserStatus = "active" | "invited" | "locked"

interface ManagementUser {
  id: string
  name: string
  email: string
  role: string
  division: string
  lastLogin: string
  twoFactor: string
  status: UserStatus
}

interface AuditEvent {
  time: string
  actor: string
  action: string
  target: string
  status: string
}

interface PermissionDefinition {
  key: string
  label: string
  group: string
  description: string
}

type MasterCategoryId = "all" | "roles" | "divisions" | "positions" | "shifts" | "locations" | "payroll-components"

interface MasterCategory {
  id: MasterCategoryId
  label: string
  description: string
  icon: LucideIcon
}

interface MasterDataRow {
  id: string
  categoryId: Exclude<MasterCategoryId, "all">
  category: string
  code: string
  name: string
  owner: string
  usedBy: string
  status: string
}

interface MasterDataFormValues {
  categoryId: Exclude<MasterCategoryId, "all">
  code: string
  name: string
  owner: string
  usedBy: string
  status: string
}

type MasterDataMutationMode = "create" | "edit"

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "" },
  { id: "attendance-live", label: "Live Absensi", icon: Megaphone, group: "Operasional" },
  { id: "employees", label: "Karyawan", icon: UserPlus, group: "Operasional" },
  { id: "attendance-requests", label: "Request", icon: MessageSquare, group: "Operasional" },
  { id: "attendance-review", label: "Approval", icon: ClipboardList, group: "Operasional" },
  { id: "field-monitoring", label: "Lapangan", icon: CalendarCheck2, group: "Operasional" },
  { id: "payroll", label: "Payroll", icon: BadgeDollarSign, group: "Finance" },
  { id: "cash-advance", label: "Kasbon", icon: WalletCards, group: "Finance" },
  { id: "work-locations", label: "Lokasi Kerja", icon: Package, group: "Admin" },
  { id: "master-data", label: "Master Data", icon: Database, group: "Sistem & Akses" },
  { id: "users", label: "Pengguna & Akses", icon: ShieldCheck, group: "Sistem & Akses" },
  { id: "role-permission", label: "Role & Permission", icon: Lock, group: "Sistem & Akses" },
  { id: "audit-log", label: "Audit Log", icon: FileBarChart, group: "Sistem & Akses" },
]

const employees: EmployeeRow[] = [
  { id: "EMP-001", name: "Rizky Pratama", division: "Produksi", location: "Gudang Utama", attendance: "valid", faceScore: 98, cycleDays: 26, payrollStatus: "ready", kasbon: 350000 },
  { id: "EMP-002", name: "Nadya Lestari", division: "Packing", location: "Gudang Utama", attendance: "valid", faceScore: 96, cycleDays: 21, payrollStatus: "active", kasbon: 0 },
  { id: "EMP-003", name: "Aldi Saputra", division: "Marketplace", location: "Kantor Admin", attendance: "pending", faceScore: 72, cycleDays: 26, payrollStatus: "ready", kasbon: 600000 },
  { id: "EMP-004", name: "Sinta Maharani", division: "Finance", location: "Kantor Admin", attendance: "missing", faceScore: null, cycleDays: 18, payrollStatus: "active", kasbon: 0 },
  { id: "EMP-005", name: "Bagas Maulana", division: "Warehouse", location: "Gudang Utama", attendance: "failed", faceScore: 48, cycleDays: 12, payrollStatus: "active", kasbon: 150000 },
  { id: "EMP-006", name: "Fajar Nugroho", division: "Produksi", location: "Workshop", attendance: "valid", faceScore: 94, cycleDays: 26, payrollStatus: "paid", kasbon: 0 },
]

const managementUsers: ManagementUser[] = [
  { id: "USR-001", name: "Hardinur Rahman", email: "hardinurahman@gmail.com", role: "Owner", division: "Management", lastLogin: "Hari ini 08:12", twoFactor: "Enabled", status: "active" },
  { id: "USR-002", name: "Sinta Maharani", email: "sinta@dms.local", role: "HR Manager", division: "HR", lastLogin: "Hari ini 07:48", twoFactor: "Enabled", status: "active" },
  { id: "USR-003", name: "Aldi Saputra", email: "aldi.finance@dms.local", role: "Finance", division: "Finance", lastLogin: "Kemarin 17:30", twoFactor: "Pending", status: "invited" },
  { id: "USR-004", name: "Fajar Nugroho", email: "fajar.ops@dms.local", role: "Supervisor", division: "Produksi", lastLogin: "04 Aug 06:59", twoFactor: "Disabled", status: "active" },
  { id: "USR-005", name: "Nadya Lestari", email: "nadya.admin@dms.local", role: "Admin", division: "Packing", lastLogin: "Belum login", twoFactor: "Pending", status: "invited" },
  { id: "USR-006", name: "Bagas Maulana", email: "bagas.viewer@dms.local", role: "Viewer", division: "Warehouse", lastLogin: "01 Aug 14:11", twoFactor: "Disabled", status: "locked" },
]

const auditEvents: AuditEvent[] = [
  { time: "08:12", actor: "Hardinur Rahman", action: "Login management app", target: "Dashboard", status: "Success" },
  { time: "07:58", actor: "Sinta Maharani", action: "Invite user", target: "Aldi Finance", status: "Success" },
  { time: "07:42", actor: "Sinta Maharani", action: "Update role", target: "Supervisor", status: "Success" },
  { time: "Kemarin", actor: "System", action: "Lock inactive user", target: "Bagas Viewer", status: "Review" },
]

const masterCategories: MasterCategory[] = [
  { id: "all", label: "Semua", description: "Seluruh master", icon: Database },
  { id: "roles", label: "Role Management", description: "Akses pengguna", icon: Lock },
  { id: "divisions", label: "Divisi", description: "Struktur karyawan", icon: UsersRound },
  { id: "positions", label: "Jabatan", description: "Level kerja", icon: UserRoundCheck },
  { id: "shifts", label: "Shift", description: "Jam operasional", icon: CalendarCheck2 },
  { id: "locations", label: "Lokasi Kerja", description: "Radius absensi", icon: LocateFixed },
  { id: "payroll-components", label: "Komponen Gaji", description: "Payroll dan kasbon", icon: BadgeDollarSign },
]

const dmsRoles = ["Owner", "HR Manager", "Finance", "Supervisor", "Admin", "Viewer"] as const

const permissionDefinitions: PermissionDefinition[] = [
  { key: "dashboard.view", label: "Akses Dashboard", group: "Dashboard", description: "Buka ringkasan KPI dan monitoring utama." },
  { key: "users.view", label: "Lihat User", group: "User Management", description: "Melihat daftar user management app." },
  { key: "users.create", label: "Invite User", group: "User Management", description: "Membuat undangan user baru." },
  { key: "users.edit", label: "Edit User", group: "User Management", description: "Mengubah profil, status, dan role user." },
  { key: "users.lock", label: "Lock User", group: "User Management", description: "Membekukan akses user bermasalah." },
  { key: "master_data.view", label: "Lihat Master Data", group: "Master Data", description: "Akses divisi, jabatan, shift, lokasi, dan komponen gaji." },
  { key: "master_data.manage", label: "Kelola Master Data", group: "Master Data", description: "Tambah, ubah, dan nonaktifkan master data." },
  { key: "attendance.view", label: "Lihat Absensi", group: "Absensi", description: "Monitoring absensi GPS dan face verification." },
  { key: "attendance.review", label: "Review Absensi", group: "Absensi", description: "Approve/reject absensi bermasalah." },
  { key: "payroll.view", label: "Lihat Payroll", group: "Payroll", description: "Melihat cycle 26 hari, draft gaji, bonus, dan potongan." },
  { key: "payroll.process", label: "Proses Payroll", group: "Payroll", description: "Lock dan proses gaji siap bayar." },
  { key: "cash_advance.manage", label: "Kelola Kasbon", group: "Finance", description: "Approve, cicil, dan potong kasbon." },
  { key: "role_permissions.manage", label: "Kelola Role Permission", group: "Sistem", description: "Ubah permission role dan custom access." },
  { key: "audit_logs.view", label: "Lihat Audit Log", group: "Sistem", description: "Melihat riwayat aktivitas dan perubahan sistem." },
]

const rolePermissionMap: Record<(typeof dmsRoles)[number], string[]> = {
  Owner: permissionDefinitions.map((permission) => permission.key),
  "HR Manager": [
    "dashboard.view",
    "users.view",
    "users.create",
    "users.edit",
    "master_data.view",
    "master_data.manage",
    "attendance.view",
    "attendance.review",
    "payroll.view",
    "cash_advance.manage",
    "audit_logs.view",
  ],
  Finance: ["dashboard.view", "master_data.view", "payroll.view", "payroll.process", "cash_advance.manage", "audit_logs.view"],
  Supervisor: ["dashboard.view", "users.view", "attendance.view", "attendance.review", "master_data.view"],
  Admin: ["dashboard.view", "users.view", "users.create", "master_data.view", "master_data.manage", "attendance.view", "audit_logs.view"],
  Viewer: ["dashboard.view", "users.view", "master_data.view", "attendance.view", "payroll.view"],
}

const statusLabel: Record<AttendanceStatus, string> = {
  valid: "Valid",
  pending: "Review",
  failed: "Failed",
  missing: "Belum Absen",
}

const payrollLabel: Record<PayrollStatus, string> = {
  active: "Cycle Aktif",
  ready: "Siap Gajian",
  paid: "Terbayar",
}

const moduleConfigs: Record<ModuleViewId, ModuleConfig> = {
  "attendance-live": {
    subtitle: "Pantau absensi masuk/keluar secara realtime dengan validasi GPS, radius lokasi, dan face verification.",
    kpis: [
      { label: "Check-in Valid", value: 42, detail: "Hari ini", icon: UserRoundCheck, tone: "green" },
      { label: "Di Luar Radius", value: 3, detail: "Butuh approval", icon: LocateFixed, tone: "amber" },
      { label: "Face Failed", value: 2, detail: "Skor rendah", icon: ScanFace, tone: "rose" },
      { label: "Belum Absen", value: 8, detail: "Shift berjalan", icon: AlertCircle, tone: "violet" },
    ],
    filters: ["Semua Lokasi", "Gudang Utama", "Kantor Admin", "Workshop"],
    formTitle: "Override Absensi",
    formDescription: "Dummy form untuk koreksi HR saat data valid di lapangan perlu disesuaikan.",
    formFields: [
      { label: "Karyawan", placeholder: "Pilih / cari karyawan" },
      { label: "Tanggal", placeholder: "2026-08-04", type: "date" },
      { label: "Catatan", placeholder: "Alasan koreksi absensi" },
    ],
    tableTitle: "Realtime Attendance Feed",
    tableDescription: "Log dummy absensi mobile yang masuk dari user karyawan.",
    columns: ["Karyawan", "Waktu", "Lokasi", "Radius", "Face", "Status"],
    rows: [
      { Karyawan: "Rizky Pratama", Waktu: "07:58 WIB", Lokasi: "Gudang Utama", Radius: "18 m", Face: "98%", Status: "Valid" },
      { Karyawan: "Aldi Saputra", Waktu: "08:12 WIB", Lokasi: "Kantor Admin", Radius: "126 m", Face: "72%", Status: "Review" },
      { Karyawan: "Bagas Maulana", Waktu: "08:20 WIB", Lokasi: "Workshop", Radius: "24 m", Face: "48%", Status: "Face Failed" },
      { Karyawan: "Nadya Lestari", Waktu: "17:03 WIB", Lokasi: "Gudang Utama", Radius: "11 m", Face: "96%", Status: "Checkout" },
    ],
  },
  employees: {
    subtitle: "Kelola master karyawan, divisi, jabatan, status kerja, dan komponen gaji dasar.",
    kpis: [
      { label: "Aktif", value: 58, detail: "Karyawan", icon: UsersRound, tone: "blue" },
      { label: "Baru Masuk", value: 6, detail: "Bulan ini", icon: UserPlus, tone: "green" },
      { label: "Kontrak Review", value: 4, detail: "Perlu update", icon: FileCheck2, tone: "amber" },
      { label: "Nonaktif", value: 2, detail: "Arsip data", icon: ShieldCheck, tone: "violet" },
    ],
    filters: ["Semua Divisi", "Produksi", "Packing", "Finance", "Warehouse"],
    formTitle: "Tambah Karyawan",
    formDescription: "Dummy form awal untuk struktur data karyawan sebelum CRUD backend.",
    formFields: [
      { label: "Nama Lengkap", placeholder: "Nama karyawan" },
      { label: "Divisi", placeholder: "Produksi / Finance / Warehouse" },
      { label: "Gaji Harian", placeholder: "150000", type: "number" },
    ],
    tableTitle: "Employee Directory",
    tableDescription: "Daftar dummy karyawan dengan status payroll cycle.",
    columns: ["Karyawan", "Divisi", "Jabatan", "Gaji Harian", "Cycle", "Status"],
    rows: [
      { Karyawan: "Rizky Pratama", Divisi: "Produksi", Jabatan: "Operator", "Gaji Harian": "Rp150.000", Cycle: "26/26", Status: "Aktif" },
      { Karyawan: "Nadya Lestari", Divisi: "Packing", Jabatan: "Staff Packing", "Gaji Harian": "Rp140.000", Cycle: "21/26", Status: "Aktif" },
      { Karyawan: "Sinta Maharani", Divisi: "Finance", Jabatan: "Admin Finance", "Gaji Harian": "Rp180.000", Cycle: "18/26", Status: "Aktif" },
      { Karyawan: "Bagas Maulana", Divisi: "Warehouse", Jabatan: "Picker", "Gaji Harian": "Rp145.000", Cycle: "12/26", Status: "Review" },
    ],
  },
  "attendance-requests": {
    subtitle: "Kelola pengajuan izin, sakit, cuti, koreksi jam, dan lampiran bukti dari karyawan.",
    kpis: [
      { label: "Pending", value: 12, detail: "Menunggu HR", icon: MessageSquare, tone: "amber" },
      { label: "Disetujui", value: 28, detail: "Bulan ini", icon: FileCheck2, tone: "green" },
      { label: "Ditolak", value: 3, detail: "Tidak valid", icon: AlertTriangle, tone: "rose" },
      { label: "SLA", value: "1.8 jam", detail: "Rata-rata respon", icon: Bell, tone: "blue" },
    ],
    filters: ["Semua Request", "Izin", "Sakit", "Cuti", "Koreksi Jam"],
    formTitle: "Input Request Manual",
    formDescription: "Dummy form untuk request yang masuk via HR/management.",
    formFields: [
      { label: "Tipe Request", placeholder: "Izin / Sakit / Cuti" },
      { label: "Tanggal", placeholder: "2026-08-04", type: "date" },
      { label: "Keterangan", placeholder: "Ringkasan pengajuan" },
    ],
    tableTitle: "Attendance Requests",
    tableDescription: "Antrian dummy pengajuan absensi karyawan.",
    columns: ["Request", "Karyawan", "Tanggal", "Lampiran", "PIC", "Status"],
    rows: [
      { Request: "Sakit", Karyawan: "Aldi Saputra", Tanggal: "04 Aug 2026", Lampiran: "Surat dokter", PIC: "HR Manager", Status: "Pending" },
      { Request: "Koreksi Jam", Karyawan: "Sinta Maharani", Tanggal: "03 Aug 2026", Lampiran: "GPS log", PIC: "Supervisor", Status: "Review" },
      { Request: "Cuti", Karyawan: "Nadya Lestari", Tanggal: "06 Aug 2026", Lampiran: "-", PIC: "HR Manager", Status: "Approved" },
    ],
  },
  "attendance-review": {
    subtitle: "Review data absensi bermasalah sebelum dihitung sebagai hari kerja valid di cycle payroll.",
    kpis: [
      { label: "Anomali", value: 7, detail: "Perlu audit", icon: AlertTriangle, tone: "amber" },
      { label: "Radius Aman", value: "92%", detail: "Hari ini", icon: LocateFixed, tone: "green" },
      { label: "Face Match", value: "88%", detail: "Rata-rata", icon: ScanFace, tone: "blue" },
      { label: "Locked", value: 18, detail: "Sudah final", icon: ShieldCheck, tone: "violet" },
    ],
    filters: ["Semua Status", "Pending", "Approved", "Rejected"],
    formTitle: "Keputusan Review",
    formDescription: "Dummy action untuk approve/reject absensi sebelum masuk hitungan gaji.",
    formFields: [
      { label: "ID Absensi", placeholder: "ATT-00021" },
      { label: "Keputusan", placeholder: "Approve / Reject" },
      { label: "Catatan HR", placeholder: "Catatan audit" },
    ],
    tableTitle: "Review Queue",
    tableDescription: "Data dummy yang belum otomatis valid.",
    columns: ["ID", "Karyawan", "Issue", "Radius", "Face", "Status"],
    rows: [
      { ID: "ATT-00021", Karyawan: "Bagas Maulana", Issue: "Face score rendah", Radius: "24 m", Face: "48%", Status: "Pending" },
      { ID: "ATT-00022", Karyawan: "Aldi Saputra", Issue: "Di luar radius", Radius: "126 m", Face: "72%", Status: "Review" },
      { ID: "ATT-00023", Karyawan: "Rizky Pratama", Issue: "Checkout terlambat", Radius: "18 m", Face: "98%", Status: "Approved" },
    ],
  },
  "field-monitoring": {
    subtitle: "Pantau sebaran tim, lokasi kerja aktif, dan aktivitas lapangan per shift.",
    kpis: [
      { label: "Di Lokasi", value: 44, detail: "Terdeteksi GPS", icon: LocateFixed, tone: "green" },
      { label: "Mobile Aktif", value: 51, detail: "Device online", icon: ScanFace, tone: "blue" },
      { label: "Outlier", value: 5, detail: "Perlu cek", icon: AlertCircle, tone: "amber" },
      { label: "Zona Kerja", value: 4, detail: "Radius aktif", icon: Package, tone: "violet" },
    ],
    filters: ["Semua Zona", "Gudang Utama", "Kantor Admin", "Workshop"],
    formTitle: "Assign Lokasi",
    formDescription: "Dummy form untuk mengatur lokasi kerja sementara per karyawan/shift.",
    formFields: [
      { label: "Karyawan", placeholder: "Pilih karyawan" },
      { label: "Lokasi Kerja", placeholder: "Gudang Utama" },
      { label: "Radius", placeholder: "100", type: "number" },
    ],
    tableTitle: "Field Monitor",
    tableDescription: "Snapshot dummy posisi dan aktivitas tim.",
    columns: ["Karyawan", "Zona", "Last Seen", "Radius", "Device", "Status"],
    rows: [
      { Karyawan: "Fajar Nugroho", Zona: "Workshop", "Last Seen": "2 menit lalu", Radius: "12 m", Device: "Android", Status: "Online" },
      { Karyawan: "Rizky Pratama", Zona: "Gudang Utama", "Last Seen": "5 menit lalu", Radius: "18 m", Device: "Android", Status: "Online" },
      { Karyawan: "Sinta Maharani", Zona: "Kantor Admin", "Last Seen": "27 menit lalu", Radius: "8 m", Device: "iPhone", Status: "Idle" },
    ],
  },
  payroll: {
    subtitle: "Proses gaji karyawan berdasarkan 26 hari kerja valid, bonus, potongan, dan kasbon.",
    kpis: [
      { label: "Siap Gajian", value: 9, detail: "Cycle 26/26", icon: BadgeDollarSign, tone: "green" },
      { label: "Cycle Aktif", value: 43, detail: "Belum 26 hari", icon: CalendarCheck2, tone: "blue" },
      { label: "Bonus Draft", value: "Rp4,8 jt", detail: "Menunggu lock", icon: FileBarChart, tone: "violet" },
      { label: "Potongan", value: "Rp1,1 jt", detail: "Kasbon + lainnya", icon: WalletCards, tone: "amber" },
    ],
    filters: ["Semua Cycle", "Siap Gajian", "Cycle Aktif", "Terbayar"],
    formTitle: "Input Komponen Gaji",
    formDescription: "Dummy form untuk bonus, potongan, dan penyesuaian sebelum payroll final.",
    formFields: [
      { label: "Karyawan", placeholder: "Pilih karyawan" },
      { label: "Bonus", placeholder: "250000", type: "number" },
      { label: "Potongan", placeholder: "0", type: "number" },
    ],
    tableTitle: "Payroll Cycle",
    tableDescription: "Draft dummy payroll berdasarkan 26 hari kerja valid.",
    columns: ["Karyawan", "Hari Valid", "Gaji Pokok", "Bonus", "Kasbon", "Status"],
    rows: [
      { Karyawan: "Rizky Pratama", "Hari Valid": "26/26", "Gaji Pokok": "Rp3.900.000", Bonus: "Rp250.000", Kasbon: "Rp350.000", Status: "Ready" },
      { Karyawan: "Aldi Saputra", "Hari Valid": "26/26", "Gaji Pokok": "Rp3.640.000", Bonus: "Rp100.000", Kasbon: "Rp600.000", Status: "Ready" },
      { Karyawan: "Nadya Lestari", "Hari Valid": "21/26", "Gaji Pokok": "Rp2.940.000", Bonus: "-", Kasbon: "-", Status: "Active" },
    ],
  },
  "cash-advance": {
    subtitle: "Kelola kasbon karyawan, approval, limit, cicilan, dan potongan otomatis saat payroll.",
    kpis: [
      { label: "Outstanding", value: "Rp8,6 jt", detail: "Belum lunas", icon: WalletCards, tone: "amber" },
      { label: "Request Baru", value: 5, detail: "Menunggu approval", icon: MessageSquare, tone: "blue" },
      { label: "Disetujui", value: 18, detail: "Bulan ini", icon: FileCheck2, tone: "green" },
      { label: "Over Limit", value: 2, detail: "Butuh owner", icon: AlertTriangle, tone: "rose" },
    ],
    filters: ["Semua Kasbon", "Pending", "Approved", "Dicicil", "Lunas"],
    formTitle: "Input Kasbon",
    formDescription: "Dummy form untuk pengajuan dan pencatatan kasbon manual.",
    formFields: [
      { label: "Karyawan", placeholder: "Pilih karyawan" },
      { label: "Nominal", placeholder: "500000", type: "number" },
      { label: "Tenor Potong", placeholder: "1x / 2x / 3x" },
    ],
    tableTitle: "Cash Advance Ledger",
    tableDescription: "Ledger dummy kasbon yang akan terhubung ke payroll.",
    columns: ["Kode", "Karyawan", "Nominal", "Terbayar", "Sisa", "Status"],
    rows: [
      { Kode: "KB-001", Karyawan: "Rizky Pratama", Nominal: "Rp500.000", Terbayar: "Rp150.000", Sisa: "Rp350.000", Status: "Dicicil" },
      { Kode: "KB-002", Karyawan: "Aldi Saputra", Nominal: "Rp600.000", Terbayar: "-", Sisa: "Rp600.000", Status: "Approved" },
      { Kode: "KB-003", Karyawan: "Bagas Maulana", Nominal: "Rp150.000", Terbayar: "-", Sisa: "Rp150.000", Status: "Pending" },
    ],
  },
  "work-locations": {
    subtitle: "Atur titik lokasi absen, radius valid, divisi yang boleh absen, dan status area kerja.",
    kpis: [
      { label: "Lokasi Aktif", value: 4, detail: "Radius berjalan", icon: LocateFixed, tone: "green" },
      { label: "Avg Radius", value: "85 m", detail: "Standar area", icon: Database, tone: "blue" },
      { label: "Perlu Audit", value: 1, detail: "Koordinat berubah", icon: AlertCircle, tone: "amber" },
      { label: "Device Lock", value: "On", detail: "Anti manipulasi", icon: ShieldCheck, tone: "violet" },
    ],
    filters: ["Semua Lokasi", "Aktif", "Draft", "Nonaktif"],
    formTitle: "Tambah Lokasi",
    formDescription: "Dummy form untuk titik GPS dan radius absen karyawan.",
    formFields: [
      { label: "Nama Lokasi", placeholder: "Gudang Utama" },
      { label: "Koordinat", placeholder: "-6.200000, 106.816666" },
      { label: "Radius Meter", placeholder: "100", type: "number" },
    ],
    tableTitle: "Work Location Master",
    tableDescription: "Master dummy lokasi yang menjadi acuan absensi mobile.",
    columns: ["Lokasi", "Koordinat", "Radius", "Divisi", "PIC", "Status"],
    rows: [
      { Lokasi: "Gudang Utama", Koordinat: "-6.2201, 106.8321", Radius: "100 m", Divisi: "Produksi, Packing", PIC: "Supervisor", Status: "Aktif" },
      { Lokasi: "Kantor Admin", Koordinat: "-6.2148, 106.8219", Radius: "60 m", Divisi: "Finance, HR", PIC: "HR Manager", Status: "Aktif" },
      { Lokasi: "Workshop", Koordinat: "-6.2308, 106.8452", Radius: "80 m", Divisi: "Warehouse", PIC: "Ops Lead", Status: "Draft" },
    ],
  },
}

const masterCategoryLabels = masterCategories.reduce<Record<string, string>>((labels, category) => {
  labels[category.id] = category.label
  return labels
}, {})

const masterDataInitialForm: MasterDataFormValues = {
  categoryId: "divisions",
  code: "",
  name: "",
  owner: "",
  usedBy: "",
  status: "Aktif",
}

function normalizeStatus(isActive?: boolean) {
  return isActive === false ? "Nonaktif" : "Aktif"
}

function isActiveStatus(status: string) {
  return status !== "Nonaktif"
}

function buildMasterRow(
  categoryId: Exclude<MasterCategoryId, "all">,
  row: Record<string, unknown>,
  options?: {
    owner?: string
    usedBy?: string
  },
): MasterDataRow {
  return {
    id: String(row.id),
    categoryId,
    category: masterCategoryLabels[categoryId],
    code: String(row.code || ""),
    name: String(row.name || ""),
    owner: options?.owner || "Management",
    usedBy: options?.usedBy || String(row.description || "-"),
    status: normalizeStatus(Boolean(row.is_active)),
  }
}

async function loadMasterDataRows() {
  const [roles, divisions, positions, locations, shifts, payrollComponents] = await Promise.all([
    supabase.from("roles").select("id, code, name, description, is_active").order("level", { ascending: true }),
    supabase.from("divisions").select("id, code, name, description, is_active").order("code", { ascending: true }),
    supabase.from("positions").select("id, code, name, description, is_active").order("code", { ascending: true }),
    supabase.from("work_locations").select("id, code, name, address, radius_m, is_active").order("code", { ascending: true }),
    supabase.from("shifts").select("id, code, name, start_time, end_time, description, is_active").order("code", { ascending: true }),
    supabase.from("payroll_components").select("id, code, name, component_type, description, is_active").order("code", { ascending: true }),
  ])

  const error = roles.error || divisions.error || positions.error || locations.error || shifts.error || payrollComponents.error

  if (error) {
    throw error
  }

  return [
    ...(roles.data || []).map((row) => buildMasterRow("roles", row, { owner: "Management", usedBy: "User access, permission" })),
    ...(divisions.data || []).map((row) => buildMasterRow("divisions", row, { owner: "HR Manager", usedBy: "User, karyawan" })),
    ...(positions.data || []).map((row) => buildMasterRow("positions", row, { owner: "HR Manager", usedBy: "Karyawan, user" })),
    ...(locations.data || []).map((row) => buildMasterRow("locations", row, { owner: "HR Manager", usedBy: `GPS absensi${row.radius_m ? `, ${row.radius_m}m` : ""}` })),
    ...(shifts.data || []).map((row) => buildMasterRow("shifts", row, { owner: "Supervisor", usedBy: row.start_time && row.end_time ? `${row.start_time} - ${row.end_time}` : "Absensi" })),
    ...(payrollComponents.data || []).map((row) => buildMasterRow("payroll-components", row, { owner: "Finance", usedBy: row.component_type === "deduction" ? "Payroll deduction" : "Payroll earning" })),
  ]
}

function createMasterPayload(values: MasterDataFormValues) {
  const basePayload = {
    code: values.code.trim().toUpperCase(),
    name: values.name.trim(),
    description: values.usedBy.trim() || values.owner.trim() || null,
    is_active: isActiveStatus(values.status),
  }

  if (values.categoryId === "locations") {
    return { code: basePayload.code, name: basePayload.name, address: basePayload.description, radius_m: 100, is_active: basePayload.is_active }
  }

  if (values.categoryId === "payroll-components") {
    return { ...basePayload, component_type: values.code.toLowerCase().includes("pot") || values.code.toLowerCase().includes("ksb") ? "deduction" : "earning" }
  }

  if (values.categoryId === "roles") {
    return { ...basePayload, level: 100, is_system: false }
  }

  return basePayload
}

function getMasterTableName(categoryId: Exclude<MasterCategoryId, "all">) {
  const tableMap: Record<Exclude<MasterCategoryId, "all">, string> = {
    roles: "roles",
    divisions: "divisions",
    positions: "positions",
    shifts: "shifts",
    locations: "work_locations",
    "payroll-components": "payroll_components",
  }

  return tableMap[categoryId]
}

async function saveMasterData(values: MasterDataFormValues, editingRow?: MasterDataRow | null) {
  const tableName = getMasterTableName(values.categoryId)
  const payload = createMasterPayload(values)
  const query = editingRow
    ? supabase.from(tableName).update(payload as Record<string, unknown>).eq("id", editingRow.id)
    : supabase.from(tableName).insert(payload as Record<string, unknown>)
  const { error } = await query

  if (error) {
    throw error
  }
}

async function deleteMasterData(row: MasterDataRow) {
  const { error } = await supabase.from(getMasterTableName(row.categoryId)).delete().eq("id", row.id)

  if (error) {
    throw error
  }
}

function exportMasterDataCsv(rows: MasterDataRow[]) {
  const header = ["No", "Kode", "Nama Data", "Kategori", "Owner", "Dipakai Di", "Status"]
  const body = rows.map((row, index) => [index + 1, row.code, row.name, row.category, row.owner, row.usedBy, row.status])
  const csv = [header, ...body]
    .map((columns) => columns.map((column) => `"${String(column).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `dms-master-data-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value)
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      onLogin()
    }, 420)
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <span className="loginMark brandLogo">
          <img src={dmsLogo} alt="DMS" />
        </span>
        <div className="loginHeading">
          <p className="loginEyebrow">DMS System</p>
          <h1>Management App</h1>
        </div>
        <p className="loginSub">Masuk untuk mengelola data operasional internal.</p>

        <form onSubmit={handleSubmit} className="loginForm">
          <div className="loginField">
            <label htmlFor="email">Email</label>
            <div className="inputWithIcon">
              <Mail size={17} />
              <input id="email" type="email" placeholder="nama@email.com" defaultValue="hardinurahman@gmail.com" required />
            </div>
          </div>

          <div className="loginField">
            <label htmlFor="password">Password</label>
            <div className="inputWithIcon">
              <Lock size={17} />
              <input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" defaultValue="management" required />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="passwordToggle"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="uiButton primaryButton loginButton" disabled={loading}>
            {loading ? (
              "Processing..."
            ) : (
              <>
                <LogIn size={18} />
                Masuk ke Dashboard
              </>
            )}
          </button>
        </form>

        <button type="button" className="forgotPasswordButton">Lupa password?</button>

        <footer className="loginFoot">
          <p className="loginAccessNote">
            <ShieldCheck size={17} />
            Akses mengikuti role dan akses khusus user.
          </p>
        </footer>
      </section>
    </main>
  )
}

function Sidebar({
  activeView,
  collapsed,
  onNavigate,
  onToggle,
  mobile = false,
}: {
  activeView: ViewId
  collapsed: boolean
  onNavigate: (view: ViewId) => void
  onToggle: () => void
  mobile?: boolean
}) {
  const groupedItems = useMemo(() => {
    return navItems.reduce<Record<string, NavItem[]>>((groups, item) => {
      groups[item.group] = [...(groups[item.group] || []), item]
      return groups
    }, {})
  }, [])

  return (
    <aside className={clsx("sidebar", collapsed && "collapsed", mobile && "mobile")}>
      <div className="brand">
        <button className="brandMark brandToggle" type="button" onClick={onToggle} aria-label="Toggle sidebar">
          <img src={dmsLogo} alt="DMS" />
          <span className="brandStatus" aria-hidden="true" />
        </button>
        <div className="brandText">
          <strong>DMS</strong>
          <small>Management</small>
        </div>
      </div>

      <nav className="navList" aria-label="Navigasi utama">
        {Object.entries(groupedItems).map(([group, items]) => (
          <div className="navGroup" key={group || "Utama"} aria-label={group || "Utama"}>
            {group && <span className="navGroupLabel">{group}</span>}
            <div className="navGroupItems">
              {items.map((item) => {
                const Icon = item.icon
                const active = activeView === item.id
                return (
                  <button
                    key={item.id}
                    className={clsx("navItem", active && "active")}
                    type="button"
                    title={item.label}
                    onClick={() => onNavigate(item.id)}
                  >
                    <Icon size={19} />
                    <span className="navLabel">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebarUser">
        <button className="sidebarUserProfile" type="button">
          <span className="userAvatar">HR</span>
          <span className="userMeta">
            <strong>HR Manager</strong>
            <small>Owner Access</small>
          </span>
        </button>
        <button className="iconButton" type="button" onClick={onToggle} aria-label="Toggle sidebar">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
    </aside>
  )
}

function AppTopbar({ activeLabel, onMobileMenu }: { activeLabel: string; onMobileMenu: () => void }) {
  return (
    <header className="appTopbar">
      <div className="appTopbarStart">
        <button className="iconButton" type="button" onClick={onMobileMenu} aria-label="Buka menu">
          <Menu size={19} />
        </button>
        <div className="crumbLine">
          <span>DMS</span>
          <span>{activeLabel}</span>
        </div>
      </div>
      <div className="appTopbarActions">
        <button className="iconButton appTopbarSecondaryAction" type="button" aria-label="Cari">
          <Search size={18} />
        </button>
        <button className="iconButton" type="button" aria-label="Notifikasi">
          <Bell size={18} />
        </button>
      </div>
    </header>
  )
}

function BottomNav({ activeView, onNavigate }: { activeView: ViewId; onNavigate: (view: ViewId) => void }) {
  const mobileItems = navItems.slice(0, 5)

  return (
    <nav className="mobileNavBar" aria-label="Navigasi mobile">
      {mobileItems.map((item) => {
        const Icon = item.icon
        const active = activeView === item.id
        return (
          <button key={item.id} type="button" className={clsx("mobileNavItem", active && "active")} onClick={() => onNavigate(item.id)}>
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function PageHeader({ activeView, subtitle, actions }: { activeView: ViewId; subtitle?: string; actions?: ReactNode }) {
  const activeItem = navItems.find((item) => item.id === activeView)
  const Icon = activeItem?.icon || LayoutDashboard
  const defaultActions = (
    <>
      <button className="secondaryButton" type="button">
        <LocateFixed size={17} />
        Lokasi Kerja
      </button>
      <button className="primaryButton" type="button">
        <ScanFace size={17} />
        Review Absensi
      </button>
    </>
  )

  return (
    <OperationalPageHeader
      title={activeItem?.label || "Dashboard"}
      eyebrow="Management App"
      icon={Icon}
      subtitle={subtitle || "Monitoring karyawan, absensi realtime, face verification, payroll cycle 26 hari kerja, dan kasbon."}
      actions={actions || defaultActions}
    />
  )
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return <UiStatusBadge tone={status}>{statusLabel[status]}</UiStatusBadge>
}

function ModuleStatusBadge({ value }: { value: string | number }) {
  return <AutoStatusBadge value={value} />
}

function UserStatusBadge({ status }: { status: UserStatus }) {
  const label: Record<UserStatus, string> = {
    active: "Aktif",
    invited: "Invite",
    locked: "Locked",
  }
  const tone: Record<UserStatus, "valid" | "pending" | "failed"> = {
    active: "valid",
    invited: "pending",
    locked: "failed",
  }

  return <UiStatusBadge tone={tone[status]}>{label[status]}</UiStatusBadge>
}

function ProgressRing({ value }: { value: number }) {
  const percent = Math.min(100, Math.round((value / 26) * 100))
  return (
    <span className="cycleRing" style={{ background: `conic-gradient(var(--blue) ${percent}%, #e5edf7 ${percent}% 100%)` }}>
      <span>{value}</span>
    </span>
  )
}

function UsersPage({ activeView }: { activeView: ViewId }) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const activeUsers = managementUsers.filter((user) => user.status === "active").length
  const invitedUsers = managementUsers.filter((user) => user.status === "invited").length
  const lockedUsers = managementUsers.filter((user) => user.status === "locked").length
  const twoFactorEnabled = managementUsers.filter((user) => user.twoFactor === "Enabled").length

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Kelola user management app, role, status akses, 2FA, invite user, dan custom access."
        actions={
          <>
            <button className="secondaryButton" type="button">
              <FileBarChart size={17} />
              Export User
            </button>
            <button className="primaryButton" type="button" onClick={() => setInviteOpen(true)}>
              <Mail size={17} />
              Invite User
            </button>
          </>
        }
      />

      <OperationalKpiGrid>
        <OperationalKpiCard label="User Aktif" value={activeUsers} detail="Bisa akses management" icon={UsersRound} tone="blue" />
        <OperationalKpiCard label="Invite Pending" value={invitedUsers} detail="Menunggu aktivasi" icon={Mail} tone="amber" />
        <OperationalKpiCard label="2FA Enabled" value={twoFactorEnabled} detail="Admin terlindungi" icon={Lock} tone="green" />
        <OperationalKpiCard label="Locked" value={lockedUsers} detail="Akses dibekukan" icon={ShieldCheck} tone="rose" />
      </OperationalKpiGrid>

      <UsersTab />
      <InviteUserDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </OperationalPageShell>
  )
}

function InviteUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel inviteDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-user-title"
        aria-describedby="invite-user-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader">
          <div>
            <h2 id="invite-user-title">Invite User</h2>
            <p id="invite-user-description">Tambah akses login untuk user management.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="dialogForm">
          <TextFormField label="Nama User" placeholder="Nama lengkap" />
          <TextFormField label="Email Login" type="email" placeholder="nama@dms.local" />
          <TextFormField label="Role" placeholder="Owner / HR Manager / Finance" />
          <TextFormField label="Divisi" placeholder="Management / HR / Finance" />
          <div className="dialogActions">
            <button className="secondaryButton" type="button" onClick={onClose}>Draft</button>
            <button className="primaryButton" type="button" onClick={onClose}>
              <Mail size={17} />
              Kirim Invite
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function UsersTab() {
  return (
    <section className="moduleGrid">
      <OperationalFilterPanel>
        <div className="filterField">
          <label>Search</label>
          <div className="uiInput inputWithIcon compact">
            <Search size={16} />
            <input placeholder="Cari user, email, role, divisi..." />
          </div>
        </div>
        <div className="filterField">
          <label>Status</label>
          <select className="uiSelectTrigger" defaultValue="all">
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="invited">Invite</option>
            <option value="locked">Locked</option>
          </select>
        </div>
        <button className="secondaryButton" type="button">Reset Filter</button>
      </OperationalFilterPanel>

      <OperationalTableCard>
        <div className="tableHeader">
          <div>
            <h2>User Management</h2>
            <p>Daftar dummy user yang nanti tersambung ke auth dan permission backend.</p>
          </div>
        </div>
        <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
          <table>
            <colgroup>
              <col className="tableNumberColumn" />
              <col style={{ width: "220px" }} />
              <col style={{ width: "240px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "112px" }} />
              <col className="tableActionColumn" />
            </colgroup>
            <thead>
              <tr>
                <th className="tableNumberHeader">No</th>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Divisi</th>
                <th>Last Login</th>
                <th>2FA</th>
                <th>Status</th>
                <th className="tableActionHeader">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {managementUsers.map((user, index) => (
                <tr key={user.id}>
                  <td className="tableNumberCell"><TableNumberCell value={index + 1} /></td>
                  <td><TableText primary={user.name} secondary={user.id} /></td>
                  <td><TableText primary={user.email} /></td>
                  <td><TableText primary={user.role} /></td>
                  <td><TableText primary={user.division} /></td>
                  <td><TableText primary={user.lastLogin} /></td>
                  <td><TableText primary={user.twoFactor} /></td>
                  <td><UserStatusBadge status={user.status} /></td>
                  <td className="tableActionCell">
                    <div className="rowActions">
                      <RowActionButton />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>
    </section>
  )
}

function RolePermissionPage({ activeView }: { activeView: ViewId }) {
  const groupedPermissions = permissionDefinitions.reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
    groups[permission.group] = [...(groups[permission.group] || []), permission]
    return groups
  }, {})

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Atur permission per role untuk menentukan modul, action, approval, dan akses khusus user."
      />

      <OperationalKpiGrid>
        <OperationalKpiCard label="Role" value={dmsRoles.length} detail="Role aktif DMS" icon={ShieldCheck} tone="violet" />
        <OperationalKpiCard label="Permission" value={permissionDefinitions.length} detail="Akses granular" icon={Lock} tone="blue" />
        <OperationalKpiCard label="Protected" value="Owner" detail="Role tidak bisa diubah" icon={Crown} tone="amber" />
        <OperationalKpiCard label="Audit Ready" value="On" detail="Perubahan tercatat" icon={FileBarChart} tone="green" />
      </OperationalKpiGrid>

      <section className="rolePermissionHero">
        <div>
          <h2>Permission Matrix</h2>
          <p>Dummy matrix awal mengikuti pola Poles: role sebagai kolom, permission sebagai baris, group sebagai section.</p>
        </div>
        <div className="rolePermissionActions">
          <button className="secondaryButton" type="button">Reset Default</button>
          <button className="primaryButton" type="button">
            <FileCheck2 size={17} />
            Simpan Matrix
          </button>
        </div>
      </section>

      <OperationalTableCard>
        <div className="tableHeader">
          <div>
            <h2>Role & Permission</h2>
            <p>Checklist akses per role. Owner dikunci sebagai full access.</p>
          </div>
        </div>
        <div className="tableScroller uiDataTableScroller uiDataTableHasColumns rolePermissionTable">
          <table>
            <colgroup>
              <col style={{ width: "330px" }} />
              {dmsRoles.map((role) => (
                <col key={role} style={{ width: "118px" }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Permission</th>
                {dmsRoles.map((role) => (
                  <th className="textCenter" key={role}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedPermissions).map(([group, permissions]) => (
                <Fragment key={group}>
                  <tr className="permissionGroupRow" key={`${group}-group`}>
                    <td colSpan={dmsRoles.length + 1}>{group}</td>
                  </tr>
                  {permissions.map((permission) => (
                    <tr key={permission.key}>
                      <td><TableText primary={permission.label} secondary={permission.description} /></td>
                      {dmsRoles.map((role) => {
                        const checked = rolePermissionMap[role].includes(permission.key)
                        return (
                          <td className="permissionCheckCell" key={`${role}-${permission.key}`}>
                            <span className={clsx("permissionSwitch", checked && "checked", role === "Owner" && "locked")}>
                              <span />
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>
    </OperationalPageShell>
  )
}

function AuditLogPage({ activeView }: { activeView: ViewId }) {
  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Riwayat aktivitas user, perubahan permission, invite user, login, dan audit keamanan sistem."
      />

      <OperationalKpiGrid>
        <OperationalKpiCard label="Event" value={auditEvents.length} detail="Dummy hari ini" icon={FileBarChart} tone="blue" />
        <OperationalKpiCard label="Success" value={3} detail="Aktivitas aman" icon={FileCheck2} tone="green" />
        <OperationalKpiCard label="Review" value={1} detail="Butuh cek HR" icon={AlertTriangle} tone="amber" />
        <OperationalKpiCard label="Retention" value="180 hari" detail="Rencana audit log" icon={Database} tone="violet" />
      </OperationalKpiGrid>

      <OperationalTableCard>
        <div className="tableHeader">
          <div>
            <h2>Audit Log</h2>
            <p>Dummy aktivitas user dan sistem untuk kebutuhan compliance.</p>
          </div>
          <button className="secondaryButton" type="button">Export Log</button>
        </div>
        <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
          <table>
            <colgroup>
              <col className="tableNumberColumn" />
              <col style={{ width: "120px" }} />
              <col style={{ width: "220px" }} />
              <col style={{ width: "260px" }} />
              <col style={{ width: "220px" }} />
              <col style={{ width: "120px" }} />
              <col className="tableActionColumn" />
            </colgroup>
            <thead>
              <tr>
                <th className="tableNumberHeader">No</th>
                <th>Waktu</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Status</th>
                <th className="tableActionHeader">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((event, index) => (
                <tr key={`${event.time}-${event.action}`}>
                  <td className="tableNumberCell"><TableNumberCell value={index + 1} /></td>
                  <td><TableText primary={event.time} /></td>
                  <td><TableText primary={event.actor} /></td>
                  <td><TableText primary={event.action} /></td>
                  <td><TableText primary={event.target} /></td>
                  <td><ModuleStatusBadge value={event.status} /></td>
                  <td className="tableActionCell">
                    <div className="rowActions">
                      <RowActionButton />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>
    </OperationalPageShell>
  )
}

function MasterDataPage({ activeView }: { activeView: ViewId }) {
  const [activeCategory, setActiveCategory] = useState<MasterCategoryId>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<MasterDataRow | null>(null)
  const [rows, setRows] = useState<MasterDataRow[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const fetchRows = async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      setRows(await loadMasterDataRows())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal mengambil master data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchRows()
  }, [])

  const filteredRows = rows.filter((row) => {
    const matchesCategory = activeCategory === "all" || row.categoryId === activeCategory
    const normalizedTerm = searchTerm.trim().toLowerCase()
    const matchesSearch = normalizedTerm
      ? [row.code, row.name, row.category, row.owner, row.usedBy, row.status].join(" ").toLowerCase().includes(normalizedTerm)
      : true
    const matchesStatus = statusFilter === "all" || row.status === statusFilter

    return matchesCategory && matchesSearch && matchesStatus
  })
  const activeRows = rows.filter((row) => row.status === "Aktif").length
  const roleRows = rows.filter((row) => row.categoryId === "roles").length
  const divisionRows = rows.filter((row) => row.categoryId === "divisions").length

  const openCreateDialog = () => {
    setEditingRow(null)
    setDialogOpen(true)
  }

  const openEditDialog = (row: MasterDataRow) => {
    setEditingRow(row)
    setDialogOpen(true)
  }

  const handleSubmitMasterData = async (values: MasterDataFormValues) => {
    setSaving(true)
    setErrorMessage("")

    try {
      await saveMasterData(values, editingRow)
      setDialogOpen(false)
      setEditingRow(null)
      await fetchRows()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal menyimpan master data.")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteMasterData = async (row: MasterDataRow) => {
    if (!window.confirm(`Hapus ${row.name}?`)) return

    setSaving(true)
    setErrorMessage("")

    try {
      await deleteMasterData(row)
      await fetchRows()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal menghapus master data.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Pondasi dropdown dan referensi data untuk user, karyawan, absensi, payroll, lokasi kerja, bonus, potongan, dan kasbon."
        actions={
          <>
            <button className="secondaryButton" type="button" onClick={() => exportMasterDataCsv(filteredRows)} disabled={filteredRows.length === 0}>
              <FileBarChart size={17} />
              Export Master
            </button>
            <button className="primaryButton" type="button" onClick={openCreateDialog}>
              <FileCheck2 size={17} />
              Tambah Data
            </button>
          </>
        }
      />

      <OperationalKpiGrid>
        <OperationalKpiCard label="Total Data" value={rows.length} detail="Referensi aktif sistem" icon={Database} tone="blue" />
        <OperationalKpiCard label="Role" value={roleRows} detail="Dipakai form user" icon={Lock} tone="violet" />
        <OperationalKpiCard label="Divisi" value={divisionRows} detail="Dipakai user & karyawan" icon={UsersRound} tone="green" />
        <OperationalKpiCard label="Nonaktif" value={rows.length - activeRows} detail="Perlu finalisasi" icon={AlertTriangle} tone="amber" />
      </OperationalKpiGrid>

      <section className="moduleGrid">
        {errorMessage && <div className="inlineAlert">{errorMessage}</div>}

        <CategoryTabs
          activeId={activeCategory}
          ariaLabel="Kategori master data"
          items={masterCategories.map((category) => ({
            id: category.id,
            label: category.label,
            icon: category.icon,
            count: category.id === "all" ? rows.length : rows.filter((row) => row.categoryId === category.id).length,
          }))}
          onChange={setActiveCategory}
        />

        <OperationalFilterPanel>
          <div className="filterField">
            <label>Search</label>
            <div className="uiInput inputWithIcon compact">
              <Search size={16} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari kode, nama data, kategori, owner..." />
            </div>
          </div>
          <div className="filterField">
            <label>Status</label>
            <select className="uiSelectTrigger" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Semua Status</option>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif</option>
            </select>
          </div>
          <button className="secondaryButton" type="button" onClick={() => {
            setSearchTerm("")
            setStatusFilter("all")
            setActiveCategory("all")
          }}>Reset Filter</button>
        </OperationalFilterPanel>

        <OperationalTableCard>
          <div className="tableHeader">
            <div>
              <h2>Master Data Registry</h2>
              <p>Role dan divisi di sini akan menjadi sumber pilihan untuk form user dan karyawan.</p>
            </div>
          </div>
          <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
            <table>
              <colgroup>
                <col className="tableNumberColumn" />
                <col style={{ width: "150px" }} />
                <col style={{ width: "220px" }} />
                <col style={{ width: "190px" }} />
                <col style={{ width: "170px" }} />
                <col style={{ width: "220px" }} />
                <col style={{ width: "120px" }} />
                <col className="tableActionColumn" />
              </colgroup>
              <thead>
                <tr>
                  <th className="tableNumberHeader">No</th>
                  <th>Kode</th>
                  <th>Nama Data</th>
                  <th>Kategori</th>
                  <th>Owner</th>
                  <th>Dipakai Di</th>
                  <th>Status</th>
                  <th className="tableActionHeader">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8}><TableText primary="Memuat master data..." secondary="Mengambil data dari Supabase" /></td>
                  </tr>
                )}
                {!loading && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8}><TableText primary="Data tidak ditemukan" secondary="Ubah filter atau tambah master data baru." /></td>
                  </tr>
                )}
                {!loading && filteredRows.map((row, index) => (
                  <tr key={row.id}>
                    <td className="tableNumberCell"><TableNumberCell value={index + 1} /></td>
                    <td><TableText primary={row.code} secondary={row.id} /></td>
                    <td><TableText primary={row.name} /></td>
                    <td><TableText primary={row.category} /></td>
                    <td><TableText primary={row.owner} /></td>
                    <td><TableText primary={row.usedBy} /></td>
                    <td><ModuleStatusBadge value={row.status} /></td>
                    <td className="tableActionCell">
                      <div className="rowActions">
                        <button className="rowActionButton" type="button" aria-label={`Edit ${row.name}`} onClick={() => openEditDialog(row)}>
                          <Pencil size={15} />
                        </button>
                        <button className="rowActionButton danger" type="button" aria-label={`Hapus ${row.name}`} onClick={() => void handleDeleteMasterData(row)} disabled={saving}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OperationalTableCard>
      </section>
      <MasterDataDialog
        open={dialogOpen}
        mode={editingRow ? "edit" : "create"}
        initialValues={editingRow ? {
          categoryId: editingRow.categoryId,
          code: editingRow.code,
          name: editingRow.name,
          owner: editingRow.owner,
          usedBy: editingRow.usedBy,
          status: editingRow.status,
        } : masterDataInitialForm}
        saving={saving}
        onClose={() => {
          setDialogOpen(false)
          setEditingRow(null)
        }}
        onSubmit={handleSubmitMasterData}
      />
    </OperationalPageShell>
  )
}

function MasterDataDialog({
  open,
  mode,
  initialValues,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: MasterDataMutationMode
  initialValues: MasterDataFormValues
  saving: boolean
  onClose: () => void
  onSubmit: (values: MasterDataFormValues) => Promise<void>
}) {
  const [values, setValues] = useState(initialValues)

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  if (!open) return null

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDataDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="master-data-title"
        aria-describedby="master-data-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader">
          <div>
            <h2 id="master-data-title">{mode === "edit" ? "Edit Master Data" : "Tambah Master Data"}</h2>
            <p id="master-data-description">Data ini tersimpan langsung ke Supabase dan menjadi sumber pilihan modul lain.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="dialogForm" onSubmit={(event) => {
          event.preventDefault()
          void onSubmit(values)
        }}>
          <SelectFormField label="Kategori" value={values.categoryId} onChange={(event) => setValues((current) => ({ ...current, categoryId: event.target.value as MasterDataFormValues["categoryId"] }))} disabled={mode === "edit"}>
              {masterCategories.filter((category) => category.id !== "all").map((category) => (
                <option value={category.id} key={category.id}>{category.label}</option>
              ))}
          </SelectFormField>
          <TextFormField label="Kode" value={values.code} onChange={(event) => setValues((current) => ({ ...current, code: event.target.value }))} placeholder="Contoh: DIV-HR / ROLE-FIN" required />
          <TextFormField label="Nama Data" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} placeholder="Nama master data" required />
          <TextFormField label="Owner" value={values.owner} onChange={(event) => setValues((current) => ({ ...current, owner: event.target.value }))} placeholder="Management / HR Manager / Finance" />
          <TextFormField label="Dipakai Di" value={values.usedBy} onChange={(event) => setValues((current) => ({ ...current, usedBy: event.target.value }))} placeholder="User / karyawan / absensi / payroll" />
          <SelectFormField label="Status" value={values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value }))}>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif</option>
          </SelectFormField>
          <div className="dialogActions">
            <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>Batal</button>
            <button className="primaryButton" type="submit" disabled={saving}>
              <FileCheck2 size={17} />
              {saving ? "Menyimpan..." : "Simpan Data"}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function DashboardPage({ activeView }: { activeView: ViewId }) {
  const totals = useMemo(() => {
    return {
      activeEmployees: employees.length,
      validToday: employees.filter((employee) => employee.attendance === "valid").length,
      pending: employees.filter((employee) => employee.attendance === "pending" || employee.attendance === "failed").length,
      payrollReady: employees.filter((employee) => employee.payrollStatus === "ready").length,
      kasbon: employees.reduce((sum, employee) => sum + employee.kasbon, 0),
    }
  }, [])

  return (
    <OperationalPageShell>
      <PageHeader activeView={activeView} />

      <OperationalKpiGrid>
        <OperationalKpiCard label="Karyawan Aktif" value={totals.activeEmployees} detail="Terdaftar di sistem" icon={UsersRound} tone="blue" />
        <OperationalKpiCard label="Absen Valid" value={totals.validToday} detail="Lolos lokasi + wajah" icon={UserRoundCheck} tone="green" />
        <OperationalKpiCard label="Butuh Review" value={totals.pending} detail="Perlu keputusan HR" icon={AlertTriangle} tone="amber" />
        <OperationalKpiCard label="Siap Gajian" value={totals.payrollReady} detail="Cycle 26 hari valid" icon={BadgeDollarSign} tone="violet" />
      </OperationalKpiGrid>

      <OperationalFilterPanel>
        <div className="filterField">
          <label>Search</label>
          <div className="uiInput inputWithIcon compact">
            <Search size={16} />
            <input placeholder="Cari karyawan, divisi, lokasi..." />
          </div>
        </div>
        <div className="filterField">
          <label>Status</label>
          <select className="uiSelectTrigger" defaultValue="all">
            <option value="all">Semua Status</option>
            <option value="valid">Valid</option>
            <option value="pending">Review</option>
            <option value="missing">Belum Absen</option>
          </select>
        </div>
        <button className="secondaryButton" type="button">Reset Filter</button>
      </OperationalFilterPanel>

      <section className="dashboardStack">
        <aside className="surfacePanel signalPanel">
          <div className="tableHeader flushHeader">
            <div>
              <h2>Payroll Signal</h2>
              <p>Data yang butuh perhatian finance.</p>
            </div>
          </div>
          <div className="signalList">
            <div className="signalItem">
              <BadgeDollarSign size={18} />
              <div>
                <strong>{totals.payrollReady} cycle siap diproses</strong>
                <span>Pastikan bonus, potongan, dan kasbon sudah final.</span>
              </div>
            </div>
            <div className="signalItem">
              <CreditCard size={18} />
              <div>
                <strong>{formatCurrency(totals.kasbon)} kasbon aktif</strong>
                <span>Outstanding yang akan masuk komponen potongan.</span>
              </div>
            </div>
            <div className="signalItem">
              <ShieldCheck size={18} />
              <div>
                <strong>Face verification enabled</strong>
                <span>Absensi valid wajib lolos radius dan wajah.</span>
              </div>
            </div>
          </div>
        </aside>
        <EmployeeTable />
      </section>
    </OperationalPageShell>
  )
}

function EmployeeTable() {
  return (
    <OperationalTableCard>
      <div className="tableHeader">
        <div>
          <h2>Live Attendance Monitor</h2>
          <p>Status absensi hari ini dengan progress payroll cycle per karyawan.</p>
        </div>
        <button className="secondaryButton" type="button">Export</button>
      </div>
      <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
        <table>
          <colgroup>
            <col className="tableNumberColumn" />
            <col style={{ width: "210px" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "128px" }} />
            <col style={{ width: "104px" }} />
            <col style={{ width: "136px" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "140px" }} />
            <col className="tableActionColumn" />
          </colgroup>
          <thead>
            <tr>
              <th className="tableNumberHeader">No</th>
              <th>Karyawan</th>
              <th>Divisi</th>
              <th>Lokasi</th>
              <th>Absensi</th>
              <th>Face</th>
              <th>Cycle</th>
              <th>Payroll</th>
              <th>Kasbon</th>
              <th className="tableActionHeader">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee, index) => (
              <tr key={employee.id}>
                <td className="tableNumberCell"><TableNumberCell value={index + 1} /></td>
                <td>
                  <TableText primary={employee.name} secondary={employee.id} />
                </td>
                <td><TableText primary={employee.division} /></td>
                <td><TableText primary={employee.location} /></td>
                <td><StatusBadge status={employee.attendance} /></td>
                <td>
                  <span className={clsx("faceScore", employee.faceScore && employee.faceScore >= 90 ? "good" : employee.faceScore && employee.faceScore >= 70 ? "warn" : "bad")}>
                    {employee.faceScore ? `${employee.faceScore}%` : "-"}
                  </span>
                </td>
                <td>
                  <div className="cycleCell">
                    <ProgressRing value={employee.cycleDays} />
                    <span>{employee.cycleDays}/26</span>
                  </div>
                </td>
                <td><TableText primary={payrollLabel[employee.payrollStatus]} /></td>
                <td><TableText primary={employee.kasbon ? formatCurrency(employee.kasbon) : "-"} /></td>
                <td className="tableActionCell">
                  <div className="rowActions">
                    <RowActionButton />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OperationalTableCard>
  )
}

function ModulePage({ activeView }: { activeView: ModuleViewId }) {
  const config = moduleConfigs[activeView]

  return (
    <OperationalPageShell>
      <PageHeader activeView={activeView} subtitle={config.subtitle} />

      <OperationalKpiGrid>
        {config.kpis.map((kpi) => (
          <OperationalKpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            detail={kpi.detail}
            icon={kpi.icon}
            tone={kpi.tone}
          />
        ))}
      </OperationalKpiGrid>

      <OperationalFilterPanel>
        <div className="filterField">
          <label>Search</label>
          <div className="uiInput inputWithIcon compact">
            <Search size={16} />
            <input placeholder={`Cari data ${navItems.find((item) => item.id === activeView)?.label.toLowerCase()}...`} />
          </div>
        </div>
        <div className="filterField">
          <label>Filter</label>
          <select className="uiSelectTrigger" defaultValue={config.filters[0]}>
            {config.filters.map((filter) => (
              <option value={filter} key={filter}>{filter}</option>
            ))}
          </select>
        </div>
        <button className="secondaryButton" type="button">Reset Filter</button>
      </OperationalFilterPanel>

      <section className="moduleGrid">
        <section className="surfacePanel moduleFormCard">
          <div className="tableHeader flushHeader">
            <div>
              <h2>{config.formTitle}</h2>
              <p>{config.formDescription}</p>
            </div>
          </div>
          <form className="moduleForm">
            {config.formFields.map((field) => (
              field.type === "date"
                ? <DateFormField label={field.label} placeholder={field.placeholder} key={field.label} />
                : <TextFormField label={field.label} type={field.type || "text"} placeholder={field.placeholder} key={field.label} />
            ))}
            <div className="formActions">
              <button className="secondaryButton" type="button">Draft</button>
              <button className="primaryButton" type="button">
                <FileCheck2 size={17} />
                Simpan Dummy
              </button>
            </div>
          </form>
        </section>

        <OperationalTableCard>
          <div className="tableHeader">
            <div>
              <h2>{config.tableTitle}</h2>
              <p>{config.tableDescription}</p>
            </div>
            <button className="secondaryButton" type="button">Export</button>
          </div>
          <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
            <table>
              <colgroup>
                <col className="tableNumberColumn" />
                {config.columns.map((column) => (
                  <col key={column} />
                ))}
                <col className="tableActionColumn" />
              </colgroup>
              <thead>
                <tr>
                  <th className="tableNumberHeader">No</th>
                  {config.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th className="tableActionHeader">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {config.rows.map((row, rowIndex) => (
                  <tr key={`${activeView}-${rowIndex}`}>
                    <td className="tableNumberCell"><TableNumberCell value={rowIndex + 1} /></td>
                    {config.columns.map((column) => (
                      <td key={column}>
                        {column === "Status" ? (
                          <ModuleStatusBadge value={row[column]} />
                        ) : (
                          <TableText
                            primary={row[column]}
                            secondary={column === config.columns[0] ? `Dummy #${String(rowIndex + 1).padStart(3, "0")}` : undefined}
                          />
                        )}
                      </td>
                    ))}
                    <td className="tableActionCell">
                      <div className="rowActions">
                        <RowActionButton />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OperationalTableCard>
      </section>
    </OperationalPageShell>
  )
}

export function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [activeView, setActiveView] = useState<ViewId>("dashboard")
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const activeLabel = navItems.find((item) => item.id === activeView)?.label || "Dashboard"

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />
  }

  const navigate = (view: ViewId) => {
    setActiveView(view)
    setMobileMenuOpen(false)
  }

  return (
    <div className={clsx("appShell", collapsed && "sidebarCollapsed")}>
      <div className="desktopSidebarSlot">
        <Sidebar activeView={activeView} collapsed={collapsed} onNavigate={navigate} onToggle={() => setCollapsed((value) => !value)} />
      </div>

      {mobileMenuOpen && (
        <div className="mobileNavScrim open" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobileMorePanel open" onClick={(event) => event.stopPropagation()}>
            <Sidebar activeView={activeView} collapsed={false} mobile onNavigate={navigate} onToggle={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <main className="appMain">
        <AppTopbar activeLabel={activeLabel} onMobileMenu={() => setMobileMenuOpen(true)} />
        <div className="workspaceViewport withMobileNav">
          {activeView === "dashboard" ? (
            <DashboardPage activeView={activeView} />
          ) : activeView === "users" ? (
            <UsersPage activeView={activeView} />
          ) : activeView === "role-permission" ? (
            <RolePermissionPage activeView={activeView} />
          ) : activeView === "master-data" ? (
            <MasterDataPage activeView={activeView} />
          ) : activeView === "audit-log" ? (
            <AuditLogPage activeView={activeView} />
          ) : (
            <ModulePage activeView={activeView} />
          )}
        </div>
      </main>

      <BottomNav activeView={activeView} onNavigate={navigate} />
      <button className="logoutButton" type="button" onClick={() => setAuthenticated(false)}>
        <LogOut size={17} />
      </button>
    </div>
  )
}
