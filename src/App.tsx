import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
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
  ExternalLink,
  FileBarChart,
  FileCheck2,
  KeyRound,
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
  Copy,
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
import type { Session } from "@supabase/supabase-js"
import clsx from "clsx"

import dmsLogo from "../assets/brand/dms-logo.jpeg"
import { CategoryTabs } from "./components/category-tabs"
import { ConfirmDialog } from "./components/confirm-dialog"
import { ClickableTableRow, DataTablePagination, RowActionButton, RowActionMenu, RowActionMenuItem, TableNumberCell, TableText } from "./components/data-table"
import { DateFormField, SelectFormField, SwitchFormField, TextFormField } from "./components/form-field"
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
  | "profile"
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

type ModuleViewId = Exclude<ViewId, "dashboard" | "master-data" | "users" | "role-permission" | "audit-log" | "profile">

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

type TwoFactorStatus = "enabled" | "pending" | "disabled"
type PasswordActionType = "setup" | "reset"

interface UserAccessRow {
  id: string
  userCode: string
  fullName: string
  email: string
  roleId: string
  roleName: string
  divisionId: string
  divisionName: string
  lastLoginAt: string
  invitedAt: string
  passwordSetupSentAt: string
  passwordResetSentAt: string
  twoFactorStatus: TwoFactorStatus
  status: UserStatus
  notes: string
}

interface UserAccessFormValues {
  userCode: string
  fullName: string
  email: string
  roleId: string
  divisionId: string
  status: UserStatus
  twoFactorStatus: TwoFactorStatus
  notes: string
}

interface UserAccessOption {
  id: string
  code: string
  name: string
  isActive: boolean
}

interface AppAccessProfile {
  id: string
  authUserId: string
  fullName: string
  email: string
  roleId: string
  roleName: string
  divisionId: string
  divisionName: string
  status: UserStatus
  permissions: string[]
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
  manager: string
  usedBy: string
  status: string
  description?: string
  level?: number
  divisionId?: string
  address?: string
  latitude?: string
  longitude?: string
  radiusM?: number
  startTime?: string
  endTime?: string
  componentType?: string
  isSystem?: boolean
  sortOrder?: number
}

interface MasterDataFormValues {
  categoryId: Exclude<MasterCategoryId, "all">
  code: string
  name: string
  description: string
  level: string
  divisionId: string
  address: string
  latitude: string
  longitude: string
  radiusM: string
  startTime: string
  endTime: string
  componentType: "earning" | "deduction"
  status: string
  sortOrder: string
}

type MasterDataMutationMode = "create" | "edit"

type MasterTableColumnKey = "name" | "category" | "manager" | "detail" | "usage" | "status"

interface MasterTableColumn {
  key: MasterTableColumnKey
  label: string
  width: string
}

interface MasterUsageWarning {
  label: string
  value: string
}

interface MasterDetailField {
  label: string
  value: ReactNode
}

interface ToastMessage {
  id: number
  tone: "success" | "error"
  title: string
  description: string
}

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
  { id: "profile", label: "Profil Saya", icon: UserRoundCheck, group: "Sistem & Akses" },
]

const viewPermissionMap: Partial<Record<ViewId, string>> = {
  dashboard: "dashboard.view",
  "attendance-live": "attendance.view",
  employees: "attendance.view",
  "attendance-requests": "attendance.review",
  "attendance-review": "attendance.review",
  "field-monitoring": "attendance.view",
  payroll: "payroll.view",
  "cash-advance": "cash_advance.manage",
  "work-locations": "master_data.view",
  "master-data": "master_data.view",
  users: "users.view",
  "role-permission": "role_permissions.manage",
  "audit-log": "audit_logs.view",
}

function canAccessView(profile: AppAccessProfile, view: ViewId) {
  if (view === "profile") return true
  const permission = viewPermissionMap[view]
  return !permission || profile.permissions.includes(permission)
}

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

const masterCategoryCopy: Record<Exclude<MasterCategoryId, "all">, {
  createTitle: string
  editTitle: string
  description: string
  nameLabel: string
  namePlaceholder: string
}> = {
  roles: {
    createTitle: "Tambah Role Management",
    editTitle: "Edit Role Management",
    description: "Role menentukan akses pengguna management app dan permission dasar.",
    nameLabel: "Nama Role",
    namePlaceholder: "Contoh: HR Manager",
  },
  divisions: {
    createTitle: "Tambah Divisi",
    editTitle: "Edit Divisi",
    description: "Divisi dipakai untuk data user, karyawan, approval, dan filter operasional.",
    nameLabel: "Nama Divisi",
    namePlaceholder: "Contoh: Produksi",
  },
  positions: {
    createTitle: "Tambah Jabatan",
    editTitle: "Edit Jabatan",
    description: "Jabatan menempel ke karyawan dan dapat dikaitkan dengan divisi.",
    nameLabel: "Nama Jabatan",
    namePlaceholder: "Contoh: Supervisor",
  },
  shifts: {
    createTitle: "Tambah Shift",
    editTitle: "Edit Shift",
    description: "Shift menjadi acuan jadwal kerja, validasi absensi, dan cycle gaji.",
    nameLabel: "Nama Shift",
    namePlaceholder: "Contoh: Shift Pagi",
  },
  locations: {
    createTitle: "Tambah Lokasi Kerja",
    editTitle: "Edit Lokasi Kerja",
    description: "Lokasi kerja dipakai sebagai radius GPS absensi karyawan lapangan.",
    nameLabel: "Nama Lokasi",
    namePlaceholder: "Contoh: Gudang Utama",
  },
  "payroll-components": {
    createTitle: "Tambah Komponen Gaji",
    editTitle: "Edit Komponen Gaji",
    description: "Komponen gaji menjadi referensi bonus, potongan, kasbon, dan payroll.",
    nameLabel: "Nama Komponen",
    namePlaceholder: "Contoh: Bonus Kehadiran",
  },
}

const masterTableColumnsByCategory: Record<MasterCategoryId, MasterTableColumn[]> = {
  all: [
    { key: "name", label: "Nama Data", width: "300px" },
    { key: "category", label: "Kategori", width: "190px" },
    { key: "detail", label: "Detail", width: "260px" },
    { key: "usage", label: "Dipakai Di", width: "220px" },
    { key: "status", label: "Status", width: "120px" },
  ],
  roles: [
    { key: "name", label: "Nama Role", width: "300px" },
    { key: "detail", label: "Level Akses", width: "180px" },
    { key: "usage", label: "Permission Scope", width: "300px" },
    { key: "status", label: "Status", width: "120px" },
  ],
  divisions: [
    { key: "name", label: "Nama Divisi", width: "300px" },
    { key: "detail", label: "Fungsi Divisi", width: "320px" },
    { key: "usage", label: "Dipakai Di", width: "220px" },
    { key: "status", label: "Status", width: "120px" },
  ],
  positions: [
    { key: "name", label: "Nama Jabatan", width: "300px" },
    { key: "manager", label: "Divisi", width: "220px" },
    { key: "detail", label: "Deskripsi Jabatan", width: "300px" },
    { key: "status", label: "Status", width: "120px" },
  ],
  shifts: [
    { key: "name", label: "Nama Shift", width: "300px" },
    { key: "detail", label: "Jam Kerja", width: "180px" },
    { key: "usage", label: "Catatan", width: "300px" },
    { key: "status", label: "Status", width: "120px" },
  ],
  locations: [
    { key: "name", label: "Nama Lokasi", width: "300px" },
    { key: "detail", label: "Radius GPS", width: "190px" },
    { key: "usage", label: "Koordinat / Alamat", width: "360px" },
    { key: "status", label: "Status", width: "120px" },
  ],
  "payroll-components": [
    { key: "name", label: "Komponen Gaji", width: "300px" },
    { key: "detail", label: "Jenis", width: "190px" },
    { key: "usage", label: "Aturan", width: "320px" },
    { key: "status", label: "Status", width: "120px" },
  ],
}

const masterCodePrefixes: Record<Exclude<MasterCategoryId, "all">, string> = {
  roles: "ROLE",
  divisions: "DIV",
  positions: "POS",
  shifts: "SFT",
  locations: "LOC",
  "payroll-components": "PAY",
}

function createCodeSlug(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "BARU"
}

function generateMasterCode(categoryId: Exclude<MasterCategoryId, "all">, name: string) {
  return `${masterCodePrefixes[categoryId]}-${createCodeSlug(name)}`
}

function createEmptyMasterForm(categoryId: Exclude<MasterCategoryId, "all">): MasterDataFormValues {
  return {
    categoryId,
    code: "",
    name: "",
    description: "",
    level: "100",
    divisionId: "",
    address: "",
    latitude: "",
    longitude: "",
    radiusM: "100",
    startTime: "",
    endTime: "",
    componentType: "earning",
    status: "Aktif",
    sortOrder: "0",
  }
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
    manager?: string
    usedBy?: string
  },
): MasterDataRow {
  return {
    id: String(row.id),
    categoryId,
    category: masterCategoryLabels[categoryId],
    code: String(row.code || ""),
    name: String(row.name || ""),
    manager: options?.manager || "Management",
    usedBy: options?.usedBy || String(row.description || "-"),
    status: normalizeStatus(Boolean(row.is_active)),
    description: String(row.description || ""),
    level: typeof row.level === "number" ? row.level : undefined,
    divisionId: row.division_id ? String(row.division_id) : "",
    address: String(row.address || ""),
    latitude: row.latitude !== null && row.latitude !== undefined ? String(row.latitude) : "",
    longitude: row.longitude !== null && row.longitude !== undefined ? String(row.longitude) : "",
    radiusM: typeof row.radius_m === "number" ? row.radius_m : undefined,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : "",
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : "",
    componentType: row.component_type ? String(row.component_type) : undefined,
    isSystem: Boolean(row.is_system),
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
  }
}

async function loadMasterDataRows() {
  const [roles, divisions, positions, locations, shifts, payrollComponents] = await Promise.all([
    supabase.from("roles").select("id, code, name, description, level, is_system, is_active, sort_order").order("sort_order", { ascending: true }).order("level", { ascending: true }),
    supabase.from("divisions").select("id, code, name, description, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("positions").select("id, code, name, division_id, description, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("work_locations").select("id, code, name, address, latitude, longitude, radius_m, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("shifts").select("id, code, name, start_time, end_time, description, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("payroll_components").select("id, code, name, component_type, description, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
  ])

  const error = roles.error || divisions.error || positions.error || locations.error || shifts.error || payrollComponents.error

  if (error) {
    throw error
  }

  const divisionNameMap = new Map((divisions.data || []).map((row) => [String(row.id), String(row.name || "-")]))

  return [
    ...(roles.data || []).map((row) => buildMasterRow("roles", row, { manager: "Sistem", usedBy: row.description || "User access, permission" })),
    ...(divisions.data || []).map((row) => buildMasterRow("divisions", row, { manager: "HR", usedBy: row.description || "User, karyawan" })),
    ...(positions.data || []).map((row) => buildMasterRow("positions", row, { manager: row.division_id ? divisionNameMap.get(String(row.division_id)) || "Belum pilih divisi" : "Belum pilih divisi", usedBy: row.description || "Karyawan, user" })),
    ...(locations.data || []).map((row) => buildMasterRow("locations", row, { manager: "HR", usedBy: `${row.address || "GPS absensi"}${row.latitude && row.longitude ? `, ${row.latitude}, ${row.longitude}` : ""}` })),
    ...(shifts.data || []).map((row) => buildMasterRow("shifts", row, { manager: "Operasional", usedBy: row.description || "Absensi" })),
    ...(payrollComponents.data || []).map((row) => buildMasterRow("payroll-components", row, { manager: "Finance", usedBy: row.description || (row.component_type === "deduction" ? "Potongan payroll" : "Penambah payroll") })),
  ]
}

function createMasterPayload(values: MasterDataFormValues) {
  const generatedCode = values.code.trim() || generateMasterCode(values.categoryId, values.name)
  const basePayload = {
    code: generatedCode.toUpperCase(),
    name: values.name.trim(),
    description: values.description.trim() || null,
    is_active: isActiveStatus(values.status),
    sort_order: Number(values.sortOrder || 0),
  }

  if (values.categoryId === "locations") {
    return {
      code: basePayload.code,
      name: basePayload.name,
      address: values.address.trim() || null,
      latitude: values.latitude ? Number(values.latitude) : null,
      longitude: values.longitude ? Number(values.longitude) : null,
      radius_m: Number(values.radiusM || 100),
      is_active: basePayload.is_active,
      sort_order: basePayload.sort_order,
    }
  }

  if (values.categoryId === "payroll-components") {
    return { ...basePayload, component_type: values.componentType }
  }

  if (values.categoryId === "roles") {
    return { ...basePayload, level: Number(values.level || 100), is_system: false }
  }

  if (values.categoryId === "positions") {
    return { ...basePayload, division_id: values.divisionId || null }
  }

  if (values.categoryId === "shifts") {
    return {
      ...basePayload,
      start_time: values.startTime || null,
      end_time: values.endTime || null,
    }
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

async function updateMasterDataStatus(row: MasterDataRow, isActive: boolean) {
  const { error } = await supabase.from(getMasterTableName(row.categoryId)).update({ is_active: isActive }).eq("id", row.id)

  if (error) {
    throw error
  }
}

async function updateMasterSortOrder(row: MasterDataRow, rows: MasterDataRow[], direction: "up" | "down") {
  const orderedRows = getOrderedMasterCategoryRows(rows, row.categoryId)
  const currentIndex = orderedRows.findIndex((item) => item.id === row.id)
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
  const nextRows = [...orderedRows]

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedRows.length) return false

  const [currentRow] = nextRows.splice(currentIndex, 1)
  nextRows.splice(targetIndex, 0, currentRow)

  const results = await Promise.all(nextRows.map((item, index) => (
    supabase
      .from(getMasterTableName(item.categoryId))
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", item.id)
  )))
  const error = results.find((result) => result.error)?.error

  if (error) throw error

  return true
}

function getOrderedMasterCategoryRows(rows: MasterDataRow[], categoryId: Exclude<MasterCategoryId, "all">) {
  return rows
    .filter((row) => row.categoryId === categoryId)
    .slice()
    .sort((first, second) => (first.sortOrder || 0) - (second.sortOrder || 0) || first.code.localeCompare(second.code) || first.name.localeCompare(second.name))
}

function canMoveMasterRow(row: MasterDataRow, rows: MasterDataRow[], direction: "up" | "down") {
  const orderedRows = getOrderedMasterCategoryRows(rows, row.categoryId)
  const index = orderedRows.findIndex((item) => item.id === row.id)

  if (index < 0) return false
  return direction === "up" ? index > 0 : index < orderedRows.length - 1
}

async function writeAuditLog(action: string, targetTable: string, targetId: string, metadata: Record<string, unknown> = {}) {
  await supabase.from("audit_logs").insert({
    actor_name: "Management App",
    action,
    target_table: targetTable,
    target_id: targetId,
    status: "success",
    metadata,
  })
}

function getFriendlySupabaseError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback
  const message = error.message.toLowerCase()
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : ""

  if (code === "23505" || message.includes("duplicate key") || message.includes("already exists")) {
    return "Kode atau nama data sudah dipakai. Gunakan nama lain agar kode otomatis tidak bentrok."
  }

  if (message.includes("violates check constraint")) {
    return "Data belum sesuai aturan database. Periksa kembali angka, status, radius, atau koordinat."
  }

  return error.message || fallback
}

async function countTableRows(tableName: string, columnName: string, value: string) {
  const { count, error } = await supabase
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq(columnName, value)

  if (error) throw error
  return count || 0
}

async function loadMasterUsageWarnings(row: MasterDataRow, rows: MasterDataRow[]) {
  const warnings = getMasterUsageWarnings(row, rows)

  try {
    if (row.categoryId === "roles") {
      const [userCount, permissionCount] = await Promise.all([
        countTableRows("app_users", "role_id", row.id),
        countTableRows("role_permissions", "role_id", row.id),
      ])

      return [
        ...warnings,
        { label: "User terkait", value: `${userCount} user` },
        { label: "Permission terkait", value: `${permissionCount} rule` },
      ]
    }

    if (row.categoryId === "divisions") {
      const [positionCount, userCount] = await Promise.all([
        countTableRows("positions", "division_id", row.id),
        countTableRows("app_users", "division_id", row.id),
      ])

      return [
        ...warnings.filter((warning) => warning.label !== "Jabatan terkait"),
        { label: "Jabatan terkait", value: `${positionCount} data` },
        { label: "User terkait", value: `${userCount} user` },
      ]
    }
  } catch {
    return [...warnings, { label: "Cek relasi DB", value: "Belum bisa dihitung" }]
  }

  return warnings
}

function validateMasterForm(values: MasterDataFormValues) {
  const errors: string[] = []
  const name = values.name.trim()
  const level = Number(values.level)
  const radius = Number(values.radiusM)
  const sortOrder = Number(values.sortOrder)
  const latitude = values.latitude === "" ? null : Number(values.latitude)
  const longitude = values.longitude === "" ? null : Number(values.longitude)

  if (!name) errors.push("Nama data wajib diisi.")
  if (name.length > 90) errors.push("Nama data maksimal 90 karakter.")
  if (!Number.isFinite(sortOrder) || sortOrder < 0) errors.push("Urutan dropdown wajib angka 0 atau lebih.")

  if (values.categoryId === "roles") {
    if (!Number.isFinite(level) || level <= 0) errors.push("Level akses wajib angka positif.")
  }

  if (values.categoryId === "positions" && !values.divisionId) {
    errors.push("Jabatan wajib memilih divisi.")
  }

  if (values.categoryId === "shifts") {
    if (!values.startTime || !values.endTime) errors.push("Shift wajib memiliki jam mulai dan jam selesai.")
  }

  if (values.categoryId === "locations") {
    if (!values.address.trim()) errors.push("Alamat lokasi kerja wajib diisi.")
    if (!Number.isFinite(radius) || radius <= 0 || radius > 10000) errors.push("Radius harus antara 1 sampai 10.000 meter.")
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) errors.push("Latitude harus berada di rentang -90 sampai 90.")
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) errors.push("Longitude harus berada di rentang -180 sampai 180.")
    if ((values.latitude && !values.longitude) || (!values.latitude && values.longitude)) errors.push("Latitude dan longitude harus diisi berpasangan.")
  }

  if (values.categoryId === "payroll-components" && !values.componentType) {
    errors.push("Jenis komponen wajib dipilih.")
  }

  return errors
}

function getMasterUsageWarnings(row: MasterDataRow, rows: MasterDataRow[]): MasterUsageWarning[] {
  const warnings: MasterUsageWarning[] = []

  if (row.categoryId === "roles") {
    warnings.push({ label: "Permission", value: row.isSystem ? "Role sistem, sebaiknya tetap aktif" : "Akses user akan ikut terpengaruh" })
  }

  if (row.categoryId === "divisions") {
    const positionCount = rows.filter((item) => item.categoryId === "positions" && item.divisionId === row.id).length
    warnings.push({ label: "Jabatan terkait", value: `${positionCount} data` })
  }

  if (row.categoryId === "positions") {
    warnings.push({ label: "Dipakai di", value: "Profil karyawan dan user lapangan" })
  }

  if (row.categoryId === "shifts") {
    warnings.push({ label: "Dipakai di", value: "Jadwal kerja dan validasi absensi" })
  }

  if (row.categoryId === "locations") {
    warnings.push({ label: "Radius GPS", value: `${row.radiusM || 100} meter` })
    warnings.push({ label: "Koordinat", value: hasLocationCoordinate(row) ? `${row.latitude}, ${row.longitude}` : "Belum lengkap" })
  }

  if (row.categoryId === "payroll-components") {
    warnings.push({ label: "Payroll", value: getPayrollComponentLabel(row.componentType) })
  }

  return warnings
}

function getMasterDetailFields(row: MasterDataRow): MasterDetailField[] {
  const fields: MasterDetailField[] = [
    { label: "Kode", value: row.code },
    { label: "Kategori", value: row.category },
    { label: "Status", value: <ModuleStatusBadge value={row.status} /> },
    { label: "Urutan Dropdown", value: row.sortOrder ?? 0 },
  ]

  if (row.description) {
    fields.push({ label: "Deskripsi", value: row.description })
  }

  if (row.categoryId === "roles") {
    fields.push(
      { label: "Level Akses", value: row.level || 100 },
      { label: "Role Sistem", value: row.isSystem ? "Ya" : "Tidak" },
      { label: "Dipakai Di", value: getMasterUsage(row) },
    )
  }

  if (row.categoryId === "divisions") {
    fields.push({ label: "Dipakai Di", value: getMasterUsage(row) })
  }

  if (row.categoryId === "positions") {
    fields.push(
      { label: "Divisi", value: row.manager },
      { label: "Dipakai Di", value: getMasterUsage(row) },
    )
  }

  if (row.categoryId === "shifts") {
    fields.push(
      { label: "Jam Kerja", value: formatMasterTimeRange(row) },
      { label: "Dipakai Di", value: getMasterUsage(row) },
    )
  }

  if (row.categoryId === "locations") {
    fields.push(
      { label: "Alamat", value: row.address || "Belum diisi" },
      { label: "Koordinat", value: hasLocationCoordinate(row) ? `${row.latitude}, ${row.longitude}` : "Belum lengkap" },
      { label: "Radius Absensi", value: `${row.radiusM || 100} meter` },
    )
  }

  if (row.categoryId === "payroll-components") {
    fields.push(
      { label: "Jenis Komponen", value: getPayrollComponentLabel(row.componentType) },
      { label: "Dipakai Di", value: getMasterUsage(row) },
    )
  }

  return fields
}

function formatMasterTimeRange(row: MasterDataRow) {
  if (!row.startTime && !row.endTime) return "-"
  return `${row.startTime || "--:--"} - ${row.endTime || "--:--"}`
}

function formatMasterCoordinate(row: MasterDataRow) {
  if (row.latitude && row.longitude) return `${row.latitude}, ${row.longitude}`
  return row.address || "-"
}

function hasLocationCoordinate(row: MasterDataRow) {
  return row.categoryId === "locations" && row.latitude !== "" && row.longitude !== ""
}

function getLocationMapUrl(row: MasterDataRow) {
  if (!hasLocationCoordinate(row)) return ""
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.latitude},${row.longitude}`)}`
}

function copyLocationCoordinate(row: MasterDataRow) {
  if (!hasLocationCoordinate(row) || !navigator.clipboard) return
  void navigator.clipboard.writeText(`${row.latitude}, ${row.longitude}`)
}

function getPayrollComponentLabel(componentType?: string) {
  return componentType === "deduction" ? "Potongan" : "Penambah"
}

function getMasterDetail(row: MasterDataRow) {
  if (row.categoryId === "roles") return `Level ${row.level || 100}`
  if (row.categoryId === "positions") return row.description || "Belum ada deskripsi"
  if (row.categoryId === "shifts") return formatMasterTimeRange(row)
  if (row.categoryId === "locations") return `${row.radiusM || 100} meter`
  if (row.categoryId === "payroll-components") return getPayrollComponentLabel(row.componentType)
  return row.description || row.usedBy || "-"
}

function getMasterUsage(row: MasterDataRow) {
  if (row.categoryId === "roles") return row.usedBy || "Permission management app"
  if (row.categoryId === "positions") return row.usedBy || "Karyawan, user"
  if (row.categoryId === "locations") return formatMasterCoordinate(row)
  return row.usedBy || "-"
}

function renderMasterColumn(row: MasterDataRow, column: MasterTableColumn, onViewLocation?: (row: MasterDataRow) => void) {
  if (column.key === "name") return <TableText primary={row.name} secondary={row.code} />
  if (column.key === "category") return <TableText primary={row.category} />
  if (column.key === "manager") return <TableText primary={row.manager} />
  if (column.key === "detail") return <TableText primary={getMasterDetail(row)} />
  if (column.key === "usage" && row.categoryId === "locations") {
    return (
      <span className="locationCell">
        <TableText primary={getMasterUsage(row)} secondary={row.address || "Belum ada alamat"} />
        <button
          className="locationMapIconButton"
          type="button"
          aria-label={`Lihat maps ${row.name}`}
          disabled={!hasLocationCoordinate(row)}
          onClick={() => onViewLocation?.(row)}
        >
          <LocateFixed size={16} />
        </button>
      </span>
    )
  }
  if (column.key === "usage") return <TableText primary={getMasterUsage(row)} />
  return <ModuleStatusBadge value={row.status} />
}

function exportMasterDataCsv(rows: MasterDataRow[]) {
  const header = ["No", "Kode", "Nama Data", "Kategori", "Pengelola", "Detail", "Dipakai Di", "Status"]
  const body = rows.map((row, index) => [index + 1, row.code, row.name, row.category, row.manager, getMasterDetail(row), getMasterUsage(row), row.status])
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

function LocationMapDialog({
  row,
  onClose,
}: {
  row: MasterDataRow | null
  onClose: () => void
}) {
  if (!row) return null

  const radius = row.radiusM || 100
  const radiusSize = Math.max(130, Math.min(310, radius * 1.45))
  const mapUrl = getLocationMapUrl(row)
  const coordinate = hasLocationCoordinate(row) ? `${row.latitude}, ${row.longitude}` : "Koordinat belum lengkap"

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel locationMapDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-map-title"
        aria-describedby="location-map-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader">
          <div>
            <h2 id="location-map-title">{row.name}</h2>
            <p id="location-map-description">Preview titik absen dan radius valid berdasarkan master lokasi kerja.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup maps" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="locationMapBody">
          <div className="locationMapCanvas" aria-label={`Radius ${radius} meter di ${row.name}`}>
            <div className="locationMapGrid" />
            <span className="locationMapRadius" style={{ width: radiusSize, height: radiusSize }} />
            <span className="locationMapPin">
              <LocateFixed size={26} />
            </span>
            <span className="locationMapBadge">{radius}m</span>
          </div>

          <div className="locationMapPanel">
            <div className="locationMapStat">
              <span>Koordinat</span>
              <strong>{coordinate}</strong>
            </div>
            <div className="locationMapStat">
              <span>Radius Absensi</span>
              <strong>{radius} meter</strong>
            </div>
            <div className="locationMapStat">
              <span>Alamat</span>
              <strong>{row.address || "Belum diisi"}</strong>
            </div>
            <div className="locationMapActions">
              <button className="secondaryButton" type="button" disabled={!hasLocationCoordinate(row)} onClick={() => copyLocationCoordinate(row)}>
                <Copy size={16} />
                Copy Koordinat
              </button>
              <a className={clsx("primaryButton", !mapUrl && "disabledLink")} href={mapUrl || undefined} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                Buka Google Maps
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value)
}

function LoginPage({ authError, onLogin }: { authError?: string; onLogin: (session: Session) => Promise<void> | void }) {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setMessage("")
    setErrorMessage("")

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) throw error
      if (!data.session) throw new Error("Session login belum tersedia.")

      await onLogin(data.session)
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Email atau password belum valid."))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setMessage("")
    setErrorMessage("")

    if (!email.trim()) {
      setErrorMessage("Isi email dulu untuk reset password.")
      return
    }

    setResetLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/?flow=reset-password`,
      })

      if (error) throw error
      setMessage("Link reset password dikirim jika email punya akses DMS.")
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Gagal mengirim reset password."))
    } finally {
      setResetLoading(false)
    }
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
          {(authError || errorMessage || message) && (
            <div className={clsx("loginAlert", message && !errorMessage && !authError ? "success" : "danger")}>
              {message && !errorMessage && !authError ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
              <span>{errorMessage || authError || message}</span>
            </div>
          )}
          <div className="loginField">
            <label htmlFor="email">Email</label>
            <div className="inputWithIcon">
              <Mail size={17} />
              <input id="email" type="email" placeholder="nama@email.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </div>
          </div>

          <div className="loginField">
            <label htmlFor="password">Password</label>
            <div className="inputWithIcon">
              <Lock size={17} />
              <input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
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
              "Memeriksa akses..."
            ) : (
              <>
                <LogIn size={18} />
                Masuk ke Dashboard
              </>
            )}
          </button>
        </form>

        <button type="button" className="forgotPasswordButton" onClick={handleForgotPassword} disabled={resetLoading}>
          {resetLoading ? "Mengirim reset..." : "Lupa password?"}
        </button>

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
  profile,
  items,
  onNavigate,
  onLogout,
  onToggle,
  mobile = false,
}: {
  activeView: ViewId
  collapsed: boolean
  profile: AppAccessProfile
  items: NavItem[]
  onNavigate: (view: ViewId) => void
  onLogout: () => void
  onToggle: () => void
  mobile?: boolean
}) {
  const groupedItems = useMemo(() => {
    return items.reduce<Record<string, NavItem[]>>((groups, item) => {
      groups[item.group] = [...(groups[item.group] || []), item]
      return groups
    }, {})
  }, [items])

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

      <div className={clsx("sidebarUser", activeView === "profile" && "active")}>
        <button className="sidebarUserProfile" type="button" onClick={() => onNavigate("profile")} title="Buka profil saya">
          <span className="userAvatar">{getProfileInitials(profile.fullName || profile.email)}</span>
          <span className="userMeta">
            <strong>{profile.fullName}</strong>
            <small>{profile.roleName}</small>
          </span>
        </button>
        <span className="sidebarUserActions">
          <button className="iconButton dangerIconButton" type="button" onClick={onLogout} aria-label="Keluar aplikasi" title="Keluar">
            <LogOut size={17} />
          </button>
          <button className="iconButton" type="button" onClick={onToggle} aria-label="Toggle sidebar">
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </span>
      </div>
    </aside>
  )
}

function AppTopbar({
  activeLabel,
  profile,
  onMobileMenu,
  onProfile,
  onLogout,
}: {
  activeLabel: string
  profile: AppAccessProfile
  onMobileMenu: () => void
  onProfile: () => void
  onLogout: () => void
}) {
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
        <button className="topbarProfileButton" type="button" onClick={onProfile} aria-label="Buka profil saya">
          <span className="userAvatar small">{getProfileInitials(profile.fullName || profile.email)}</span>
        </button>
        <button className="iconButton appTopbarSecondaryAction" type="button" aria-label="Cari">
          <Search size={18} />
        </button>
        <button className="iconButton" type="button" aria-label="Notifikasi">
          <Bell size={18} />
        </button>
        <button className="iconButton dangerIconButton" type="button" onClick={onLogout} aria-label="Keluar aplikasi">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  )
}

function BottomNav({ activeView, items, onNavigate }: { activeView: ViewId; items: NavItem[]; onNavigate: (view: ViewId) => void }) {
  const mobileItems = items.filter((item) => item.id !== "profile").slice(0, 5)

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

function PageHeader({
  activeView,
  subtitle,
  actions,
  meta,
}: {
  activeView: ViewId
  subtitle?: string
  actions?: ReactNode
  meta?: ReactNode
}) {
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
      meta={meta}
      actions={actions || defaultActions}
    />
  )
}

function InlinePageStats({ items }: { items: string[] }) {
  return (
    <div className="inlinePageStats" aria-label="Ringkasan data">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  )
}

function TableState({
  title,
  description,
  icon: Icon = Database,
  tone,
}: {
  title: string
  description: string
  icon?: LucideIcon
  tone?: "danger"
}) {
  return (
    <div className={clsx("tableState", tone)}>
      <span>
        <Icon size={20} />
      </span>
      <strong>{title}</strong>
      <small>{description}</small>
    </div>
  )
}

function ToastViewport({
  toast,
  onClose,
}: {
  toast: ToastMessage | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(onClose, 3200)
    return () => window.clearTimeout(timer)
  }, [toast, onClose])

  if (!toast) return null

  const Icon = toast.tone === "success" ? FileCheck2 : AlertTriangle

  return (
    <div className="toastViewport" role="status" aria-live="polite">
      <div className={clsx("toastItem", toast.tone)} key={toast.id}>
        <span>
          <Icon size={18} />
        </span>
        <div>
          <strong>{toast.title}</strong>
          <small>{toast.description}</small>
        </div>
        <button type="button" aria-label="Tutup notifikasi" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
    </div>
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

function formatUserDateTime(value?: string | null, fallback = "Belum login") {
  if (!value) return fallback
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function getProfileInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const initials = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`
    : value.slice(0, 2)

  return initials.toUpperCase()
}

function mapAccessStatus(status: unknown): UserStatus {
  if (status === "active" || status === "locked") return status
  return "invited"
}

async function loadAppAccessProfile(session: Session): Promise<AppAccessProfile | null> {
  const userEmail = session.user.email?.trim().toLowerCase()
  const columns = "id, auth_user_id, full_name, email, role_id, division_id, status"
  let row: Record<string, unknown> | null = null

  const linkedProfile = await supabase
    .from("app_users")
    .select(columns)
    .eq("auth_user_id", session.user.id)
    .maybeSingle()

  if (linkedProfile.error) throw linkedProfile.error
  row = linkedProfile.data

  if (!row && userEmail) {
    const emailProfile = await supabase
      .from("app_users")
      .select(columns)
      .eq("email", userEmail)
      .maybeSingle()

    if (emailProfile.error) throw emailProfile.error
    row = emailProfile.data

    if (row && !row.auth_user_id) {
      const { error } = await supabase
        .from("app_users")
        .update({ auth_user_id: session.user.id })
        .eq("id", String(row.id))

      if (error) throw error
      row.auth_user_id = session.user.id
    }
  }

  if (!row) return null

  const roleId = row.role_id ? String(row.role_id) : ""
  const divisionId = row.division_id ? String(row.division_id) : ""
  const [role, division, permissions] = await Promise.all([
    roleId ? supabase.from("roles").select("name").eq("id", roleId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    divisionId ? supabase.from("divisions").select("name").eq("id", divisionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    roleId ? supabase.from("role_permissions").select("permission_key, enabled").eq("role_id", roleId).eq("enabled", true) : Promise.resolve({ data: [], error: null }),
  ])

  if (role.error) throw role.error
  if (division.error) throw division.error
  if (permissions.error) throw permissions.error

  return {
    id: String(row.id),
    authUserId: String(row.auth_user_id || session.user.id),
    fullName: String(row.full_name || userEmail || "User DMS"),
    email: String(row.email || userEmail || ""),
    roleId,
    roleName: String(role.data?.name || "Belum pilih role"),
    divisionId,
    divisionName: String(division.data?.name || "Belum pilih divisi"),
    status: mapAccessStatus(row.status),
    permissions: (permissions.data || []).map((permission) => String(permission.permission_key)),
  }
}

function createEmptyUserForm(rows: UserAccessRow[] = []): UserAccessFormValues {
  return {
    userCode: generateNextUserCode(rows),
    fullName: "",
    email: "",
    roleId: "",
    divisionId: "",
    status: "invited",
    twoFactorStatus: "pending",
    notes: "",
  }
}

function generateNextUserCode(rows: UserAccessRow[]) {
  const maxNumber = rows.reduce((max, row) => {
    const number = Number(row.userCode.replace(/\D/g, ""))
    return Number.isFinite(number) ? Math.max(max, number) : max
  }, 0)

  return `USR-${String(maxNumber + 1).padStart(3, "0")}`
}

function mapUserAccessRow(
  row: Record<string, unknown>,
  roleMap: Map<string, UserAccessOption>,
  divisionMap: Map<string, UserAccessOption>,
): UserAccessRow {
  const roleId = row.role_id ? String(row.role_id) : ""
  const divisionId = row.division_id ? String(row.division_id) : ""

  return {
    id: String(row.id),
    userCode: String(row.user_code || ""),
    fullName: String(row.full_name || ""),
    email: String(row.email || ""),
    roleId,
    roleName: roleMap.get(roleId)?.name || "Belum pilih role",
    divisionId,
    divisionName: divisionMap.get(divisionId)?.name || "Belum pilih divisi",
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : "",
    invitedAt: row.invited_at ? String(row.invited_at) : "",
    passwordSetupSentAt: row.password_setup_sent_at ? String(row.password_setup_sent_at) : "",
    passwordResetSentAt: row.password_reset_sent_at ? String(row.password_reset_sent_at) : "",
    twoFactorStatus: (row.two_factor_status === "enabled" || row.two_factor_status === "disabled") ? row.two_factor_status : "pending",
    status: (row.status === "active" || row.status === "locked") ? row.status : "invited",
    notes: String(row.notes || ""),
  }
}

async function loadUserAccessData() {
  const [users, roles, divisions] = await Promise.all([
    supabase.from("app_users").select("id, user_code, full_name, email, role_id, division_id, status, two_factor_status, last_login_at, invited_at, password_setup_sent_at, password_reset_sent_at, notes, created_at").order("created_at", { ascending: false }),
    supabase.from("roles").select("id, code, name, is_active, sort_order, level").order("sort_order", { ascending: true }).order("level", { ascending: true }),
    supabase.from("divisions").select("id, code, name, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
  ])
  const error = users.error || roles.error || divisions.error

  if (error) throw error

  const roleOptions = (roles.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    isActive: row.is_active !== false,
  }))
  const divisionOptions = (divisions.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    isActive: row.is_active !== false,
  }))
  const roleMap = new Map(roleOptions.map((role) => [role.id, role]))
  const divisionMap = new Map(divisionOptions.map((division) => [division.id, division]))

  return {
    rows: (users.data || []).map((row) => mapUserAccessRow(row, roleMap, divisionMap)),
    roles: roleOptions,
    divisions: divisionOptions,
  }
}

function createUserAccessPayload(values: UserAccessFormValues) {
  return {
    user_code: values.userCode.trim().toUpperCase(),
    full_name: values.fullName.trim(),
    email: values.email.trim().toLowerCase(),
    role_id: values.roleId || null,
    division_id: values.divisionId || null,
    status: values.status,
    two_factor_status: values.twoFactorStatus,
    invited_at: values.status === "invited" ? new Date().toISOString() : null,
    notes: values.notes.trim() || null,
  }
}

function validateUserAccessForm(values: UserAccessFormValues) {
  const errors: string[] = []
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())

  if (!values.fullName.trim()) errors.push("Nama user wajib diisi.")
  if (!emailValid) errors.push("Email login wajib valid.")
  if (!values.roleId) errors.push("Role wajib dipilih dari Master Data.")
  if (!values.divisionId) errors.push("Divisi wajib dipilih dari Master Data.")

  return errors
}

function useAppUsersFunction() {
  return import.meta.env.VITE_USE_APP_USERS_FUNCTION === "true"
}

async function invokeAppUsersFunction(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("app-users", {
    body: { action, payload },
  })

  if (error) {
    const context = "context" in error ? (error as { context?: unknown }).context : null

    if (context instanceof Response) {
      const text = await context.clone().text()

      if (text) {
        let parsedMessage = ""

        try {
          const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
          parsedMessage = String(parsed.error || parsed.message || "")
        } catch {
          parsedMessage = ""
        }

        throw new Error(parsedMessage || text)
      }
    }

    throw error
  }
  if (data?.error) throw new Error(String(data.error))

  return data
}

async function saveUserAccess(values: UserAccessFormValues, editingRow?: UserAccessRow | null) {
  if (useAppUsersFunction()) {
    await invokeAppUsersFunction(editingRow ? "update" : "create", {
      id: editingRow?.id,
      userCode: values.userCode,
      fullName: values.fullName,
      email: values.email,
      roleId: values.roleId,
      divisionId: values.divisionId,
      status: values.status,
      twoFactorStatus: values.twoFactorStatus,
      notes: values.notes,
    })
    return
  }

  const payload = createUserAccessPayload(values)
  const query = editingRow
    ? supabase.from("app_users").update(payload).eq("id", editingRow.id)
    : supabase.from("app_users").insert(payload)
  const { error } = await query

  if (error) throw error
}

async function updateUserAccessStatus(row: UserAccessRow, status: UserStatus) {
  if (useAppUsersFunction()) {
    await invokeAppUsersFunction(status === "locked" ? "lock" : "unlock", { id: row.id })
    return
  }

  const { error } = await supabase.from("app_users").update({ status }).eq("id", row.id)

  if (error) throw error
}

async function deleteUserAccess(row: UserAccessRow) {
  if (useAppUsersFunction()) {
    await invokeAppUsersFunction("delete", { id: row.id })
    return
  }

  const { error } = await supabase.from("app_users").delete().eq("id", row.id)

  if (error) throw error
}

async function requestUserPasswordLink(row: UserAccessRow, type: PasswordActionType) {
  if (useAppUsersFunction()) {
    await invokeAppUsersFunction("send_password_link", { id: row.id, passwordActionType: type })
    return
  }

  const redirectTo = `${window.location.origin}/?flow=reset-password`
  const { error: authError } = await supabase.auth.resetPasswordForEmail(row.email, { redirectTo })

  if (authError) throw authError

  const timestampColumn = type === "setup" ? "password_setup_sent_at" : "password_reset_sent_at"
  const { error: profileError } = await supabase
    .from("app_users")
    .update({ [timestampColumn]: new Date().toISOString() })
    .eq("id", row.id)

  if (profileError) throw profileError
}

function exportUserAccessCsv(rows: UserAccessRow[]) {
  const header = ["No", "Kode", "Nama", "Email", "Role", "Divisi", "Last Login", "2FA", "Status"]
  const body = rows.map((row, index) => [
    index + 1,
    row.userCode,
    row.fullName,
    row.email,
    row.roleName,
    row.divisionName,
    formatUserDateTime(row.lastLoginAt),
    twoFactorLabel[row.twoFactorStatus],
    userStatusLabel[row.status],
  ])
  const csv = [header, ...body]
    .map((columns) => columns.map((column) => `"${String(column).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `dms-users-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

const userStatusLabel: Record<UserStatus, string> = {
  active: "Aktif",
  invited: "Invite",
  locked: "Locked",
}

const twoFactorLabel: Record<TwoFactorStatus, string> = {
  enabled: "Enabled",
  pending: "Pending",
  disabled: "Disabled",
}

const passwordActionCopy: Record<PasswordActionType, { action: string; confirm: string; description: string; title: string }> = {
  setup: {
    action: "Send password setup",
    confirm: "Kirim Link",
    description: "User akan menerima link untuk membuat password pertama secara mandiri melalui email.",
    title: "Kirim link buat password",
  },
  reset: {
    action: "Send password reset",
    confirm: "Kirim Reset",
    description: "User akan menerima link reset password. Password lama tidak akan terlihat oleh admin.",
    title: "Kirim reset password",
  },
}

function UsersPage({ activeView }: { activeView: ViewId }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<UserAccessRow | null>(null)
  const [detailRow, setDetailRow] = useState<UserAccessRow | null>(null)
  const [statusRow, setStatusRow] = useState<UserAccessRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<UserAccessRow | null>(null)
  const [passwordActionRow, setPasswordActionRow] = useState<UserAccessRow | null>(null)
  const [passwordActionType, setPasswordActionType] = useState<PasswordActionType>("setup")
  const [formInitialValues, setFormInitialValues] = useState<UserAccessFormValues>(() => createEmptyUserForm())
  const [rows, setRows] = useState<UserAccessRow[]>([])
  const [roles, setRoles] = useState<UserAccessOption[]>([])
  const [divisions, setDivisions] = useState<UserAccessOption[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const fetchRows = async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      const data = await loadUserAccessData()
      setRows(data.rows)
      setRoles(data.roles)
      setDivisions(data.divisions)
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Gagal mengambil data pengguna."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchRows()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [searchTerm, statusFilter, pageSize])

  const filteredRows = rows.filter((row) => {
    const normalizedTerm = searchTerm.trim().toLowerCase()
    const matchesSearch = normalizedTerm
      ? [row.userCode, row.fullName, row.email, row.roleName, row.divisionName, row.status, row.twoFactorStatus].join(" ").toLowerCase().includes(normalizedTerm)
      : true
    const matchesStatus = statusFilter === "all" || row.status === statusFilter

    return matchesSearch && matchesStatus
  })
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / Math.min(pageSize, 50)))
  const currentPage = Math.min(page, pageCount)
  const paginatedRows = filteredRows.slice((currentPage - 1) * Math.min(pageSize, 50), currentPage * Math.min(pageSize, 50))
  const activeUsers = rows.filter((user) => user.status === "active").length
  const invitedUsers = rows.filter((user) => user.status === "invited").length
  const lockedUsers = rows.filter((user) => user.status === "locked").length
  const twoFactorEnabled = rows.filter((user) => user.twoFactorStatus === "enabled").length
  const statusTarget = statusRow?.status === "locked" ? "active" : "locked"
  const passwordAction = passwordActionCopy[passwordActionType]

  const showToast = (message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() })
  }

  const openCreateDialog = () => {
    setEditingRow(null)
    setFormInitialValues(createEmptyUserForm(rows))
    setDialogOpen(true)
  }

  const openEditDialog = (row: UserAccessRow) => {
    setDetailRow(null)
    setEditingRow(row)
    setFormInitialValues({
      userCode: row.userCode,
      fullName: row.fullName,
      email: row.email,
      roleId: row.roleId,
      divisionId: row.divisionId,
      status: row.status,
      twoFactorStatus: row.twoFactorStatus,
      notes: row.notes,
    })
    setDialogOpen(true)
  }

  const handleSubmitUser = async (values: UserAccessFormValues) => {
    setSaving(true)
    setErrorMessage("")

    try {
      await saveUserAccess(values, editingRow)
      if (!useAppUsersFunction()) {
        await writeAuditLog(editingRow ? "Update app user" : "Create app user", "app_users", editingRow?.id || values.userCode, {
          email: values.email,
          role_id: values.roleId,
          division_id: values.divisionId,
          status: values.status,
        }).catch(() => {})
      }
      setDialogOpen(false)
      setEditingRow(null)
      await fetchRows()
      showToast({
        tone: "success",
        title: editingRow ? "User berhasil diupdate" : "User berhasil ditambahkan",
        description: `${values.fullName} sudah tersimpan di Pengguna & Akses.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal menyimpan user.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal menyimpan user", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!statusRow) return
    setSaving(true)
    setErrorMessage("")

    try {
      await updateUserAccessStatus(statusRow, statusTarget)
      if (!useAppUsersFunction()) {
        await writeAuditLog(statusTarget === "locked" ? "Lock app user" : "Unlock app user", "app_users", statusRow.id, {
          email: statusRow.email,
          previous_status: statusRow.status,
          next_status: statusTarget,
        }).catch(() => {})
      }
      setStatusRow(null)
      await fetchRows()
      showToast({
        tone: "success",
        title: statusTarget === "locked" ? "User dikunci" : "User dibuka",
        description: `${statusRow.fullName} berhasil diperbarui.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal mengubah status user.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal mengubah status", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteRow) return
    const targetRow = deleteRow
    setSaving(true)
    setErrorMessage("")

    try {
      await deleteUserAccess(targetRow)
      if (!useAppUsersFunction()) {
        await writeAuditLog("Delete app user", "app_users", targetRow.id, {
          email: targetRow.email,
          user_code: targetRow.userCode,
          full_name: targetRow.fullName,
        }).catch(() => {})
      }
      setDeleteRow(null)
      await fetchRows()
      showToast({
        tone: "success",
        title: "User dihapus",
        description: `${targetRow.fullName} sudah dihapus dari Pengguna & Akses.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal menghapus user.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal menghapus user", description: message })
    } finally {
      setSaving(false)
    }
  }

  const openPasswordAction = (row: UserAccessRow, type: PasswordActionType = row.status === "invited" ? "setup" : "reset") => {
    setDetailRow(null)
    setPasswordActionRow(row)
    setPasswordActionType(type)
  }

  const handlePasswordAction = async () => {
    if (!passwordActionRow) return
    const targetRow = passwordActionRow
    const targetAction = passwordActionType
    setSaving(true)
    setErrorMessage("")

    try {
      await requestUserPasswordLink(targetRow, targetAction)
      if (!useAppUsersFunction()) {
        await writeAuditLog(passwordActionCopy[targetAction].action, "app_users", targetRow.id, {
          email: targetRow.email,
          user_code: targetRow.userCode,
          flow: targetAction,
        }).catch(() => {})
      }
      setPasswordActionRow(null)
      await fetchRows()
      showToast({
        tone: "success",
        title: targetAction === "setup" ? "Link buat password dikirim" : "Reset password dikirim",
        description: `Email dikirim ke ${targetRow.email}.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, targetAction === "setup" ? "Gagal mengirim link buat password." : "Gagal mengirim reset password.")
      setErrorMessage(message)
      showToast({ tone: "error", title: targetAction === "setup" ? "Gagal kirim link" : "Gagal reset password", description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Kelola user management app, role, status akses, 2FA, invite user, dan custom access."
        meta={
          <InlinePageStats
            items={[
              `${filteredRows.length} dari ${rows.length} user`,
              `${activeUsers} aktif`,
              `${invitedUsers} invite`,
              `${lockedUsers} locked`,
            ]}
          />
        }
        actions={
          <>
            <button className="secondaryButton" type="button" onClick={() => exportUserAccessCsv(filteredRows)} disabled={filteredRows.length === 0}>
              <FileBarChart size={17} />
              Export User
            </button>
            <button className="primaryButton" type="button" onClick={openCreateDialog}>
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

      <section className="moduleGrid">
        {errorMessage && <div className="inlineAlert">{errorMessage}</div>}

        <OperationalFilterPanel>
          <div className="filterField">
            <label>Search</label>
            <div className="uiInput inputWithIcon compact">
              <Search size={16} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari user, email, role, divisi..." />
            </div>
          </div>
          <div className="filterField">
            <label>Status</label>
            <select className="uiSelectTrigger" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="invited">Invite</option>
              <option value="locked">Locked</option>
            </select>
          </div>
          <button className="secondaryButton" type="button" onClick={() => {
            setSearchTerm("")
            setStatusFilter("all")
          }}>Reset Filter</button>
        </OperationalFilterPanel>

        <OperationalTableCard>
          <div className="tableHeader">
            <div>
              <h2>User Management</h2>
              <p>Daftar pengguna management app yang terhubung ke role dan divisi Master Data.</p>
            </div>
          </div>
          <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
            <table>
              <colgroup>
                <col className="tableNumberColumn" />
                <col style={{ width: "240px" }} />
                <col style={{ width: "250px" }} />
                <col style={{ width: "170px" }} />
                <col style={{ width: "170px" }} />
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
                {loading && (
                  <tr>
                    <td className="tableStateCell" colSpan={9}>
                      <TableState title="Memuat user" description="Mengambil pengguna, role, dan divisi dari Supabase." icon={UsersRound} />
                    </td>
                  </tr>
                )}
                {!loading && errorMessage && rows.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={9}>
                      <TableState title="Gagal memuat user" description={errorMessage} icon={AlertTriangle} tone="danger" />
                    </td>
                  </tr>
                )}
                {!loading && !errorMessage && filteredRows.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={9}>
                      <TableState title="User tidak ditemukan" description="Ubah filter atau invite user baru." icon={Search} />
                    </td>
                  </tr>
                )}
                {!loading && paginatedRows.map((user, index) => (
                  <ClickableTableRow key={user.id} label={`Lihat detail ${user.fullName}`} onOpen={() => setDetailRow(user)}>
                    <td className="tableNumberCell"><TableNumberCell value={(currentPage - 1) * Math.min(pageSize, 50) + index + 1} /></td>
                    <td><TableText primary={user.fullName} secondary={user.userCode} /></td>
                    <td><TableText primary={user.email} /></td>
                    <td><TableText primary={user.roleName} /></td>
                    <td><TableText primary={user.divisionName} /></td>
                    <td><TableText primary={formatUserDateTime(user.lastLoginAt)} /></td>
                    <td><TableText primary={twoFactorLabel[user.twoFactorStatus]} /></td>
                    <td><UserStatusBadge status={user.status} /></td>
                    <td className="tableActionCell">
                      <div className="rowActions">
                        <RowActionMenu label={`Aksi ${user.fullName}`}>
                          <RowActionMenuItem onClick={() => openEditDialog(user)}>
                            <Pencil size={14} />
                            Edit
                          </RowActionMenuItem>
                          <RowActionMenuItem disabled={saving} onClick={() => openPasswordAction(user)}>
                            <KeyRound size={14} />
                            {user.status === "invited" ? "Buat Password" : "Reset Password"}
                          </RowActionMenuItem>
                          <RowActionMenuItem danger={user.status !== "locked"} disabled={saving} onClick={() => {
                            setDetailRow(null)
                            setStatusRow(user)
                          }}>
                            {user.status === "locked" ? <FileCheck2 size={14} /> : <Lock size={14} />}
                            {user.status === "locked" ? "Unlock" : "Lock"}
                          </RowActionMenuItem>
                          <RowActionMenuItem danger disabled={saving} onClick={() => {
                            setDetailRow(null)
                            setDeleteRow(user)
                          }}>
                            <Trash2 size={14} />
                            Hapus
                          </RowActionMenuItem>
                        </RowActionMenu>
                      </div>
                    </td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          </div>
          <DataTablePagination
            page={currentPage}
            pageSize={pageSize}
            totalRows={filteredRows.length}
            onPageChange={setPage}
            onPageSizeChange={(value) => setPageSize(Math.min(value, 50))}
          />
        </OperationalTableCard>
      </section>

      <UserAccessDialog
        open={dialogOpen}
        mode={editingRow ? "edit" : "create"}
        initialValues={formInitialValues}
        roles={roles}
        divisions={divisions}
        saving={saving}
        onClose={() => {
          setDialogOpen(false)
          setEditingRow(null)
        }}
        onSubmit={handleSubmitUser}
      />
      <UserAccessDetailDialog
        row={detailRow}
        onClose={() => setDetailRow(null)}
        onEdit={openEditDialog}
        onToggleStatus={(row) => {
          setDetailRow(null)
          setStatusRow(row)
        }}
        onDelete={(row) => {
          setDetailRow(null)
          setDeleteRow(row)
        }}
        onPasswordAction={openPasswordAction}
      />
      <ConfirmDialog
        open={Boolean(statusRow)}
        tone={statusTarget === "locked" ? "danger" : "default"}
        eyebrow={statusTarget === "locked" ? "Lock User" : "Unlock User"}
        title={statusRow ? `${statusTarget === "locked" ? "Lock" : "Unlock"} ${statusRow.fullName}?` : "Ubah status user?"}
        description={statusTarget === "locked" ? "User tidak bisa mengakses management app sampai akses dibuka kembali." : "User akan kembali bisa mengakses management app sesuai role aktifnya."}
        confirmLabel={statusTarget === "locked" ? "Lock User" : "Unlock User"}
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setStatusRow(null)
        }}
        onConfirm={() => void handleToggleStatus()}
      >
        {statusRow && (
          <div className="confirmDialogPreview">
            <span>{statusRow.roleName}</span>
            <strong>{statusRow.fullName}</strong>
            <small>{statusRow.email}</small>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(deleteRow)}
        tone="danger"
        eyebrow="Hapus User"
        title={deleteRow ? `Hapus ${deleteRow.fullName}?` : "Hapus user?"}
        description="Profil user akan dihapus dari daftar Pengguna & Akses. Gunakan hanya untuk invite atau user yang salah input."
        confirmLabel="Hapus User"
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setDeleteRow(null)
        }}
        onConfirm={() => void handleDeleteUser()}
      >
        {deleteRow && (
          <div className="confirmDialogPreview">
            <span>{deleteRow.userCode}</span>
            <strong>{deleteRow.fullName}</strong>
            <small>{deleteRow.email}</small>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(passwordActionRow)}
        tone="default"
        icon={KeyRound}
        eyebrow={passwordActionType === "setup" ? "Buat Password" : "Reset Password"}
        title={passwordActionRow ? `${passwordAction.title} untuk ${passwordActionRow.fullName}?` : `${passwordAction.title}?`}
        description={passwordAction.description}
        confirmLabel={passwordAction.confirm}
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setPasswordActionRow(null)
        }}
        onConfirm={() => void handlePasswordAction()}
      >
        {passwordActionRow && (
          <div className="confirmDialogPreview">
            <span>{passwordActionRow.userCode}</span>
            <strong>{passwordActionRow.fullName}</strong>
            <small>{passwordActionRow.email}</small>
          </div>
        )}
      </ConfirmDialog>
      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </OperationalPageShell>
  )
}

function UserAccessDialog({
  open,
  mode,
  initialValues,
  roles,
  divisions,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: "create" | "edit"
  initialValues: UserAccessFormValues
  roles: UserAccessOption[]
  divisions: UserAccessOption[]
  saving: boolean
  onClose: () => void
  onSubmit: (values: UserAccessFormValues) => Promise<void>
}) {
  const [values, setValues] = useState(initialValues)
  const [formErrors, setFormErrors] = useState<string[]>([])

  useEffect(() => {
    setValues(initialValues)
    setFormErrors([])
  }, [initialValues])

  if (!open) return null

  const activeRoles = roles.filter((role) => role.isActive || role.id === values.roleId)
  const activeDivisions = divisions.filter((division) => division.isActive || division.id === values.divisionId)

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
            <h2 id="invite-user-title">{mode === "edit" ? "Edit User" : "Invite User"}</h2>
            <p id="invite-user-description">Role dan divisi diambil live dari Master Data.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="dialogForm" onSubmit={(event) => {
          event.preventDefault()
          const nextErrors = validateUserAccessForm(values)

          if (nextErrors.length > 0) {
            setFormErrors(nextErrors)
            return
          }

          setFormErrors([])
          void onSubmit(values)
        }}>
          {formErrors.length > 0 && (
            <div className="formValidationPanel">
              <AlertTriangle size={18} />
              <div>
                <strong>Periksa data user</strong>
                {formErrors.map((error) => (
                  <span key={error}>{error}</span>
                ))}
              </div>
            </div>
          )}
          <TextFormField label="Kode User" value={values.userCode} readOnly disabled required />
          <TextFormField label="Nama User" value={values.fullName} onChange={(event) => setValues((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nama lengkap" required />
          <TextFormField label="Email Login" type="email" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} placeholder="nama@dms.local" required />
          <SelectFormField label="Role" value={values.roleId} onChange={(event) => setValues((current) => ({ ...current, roleId: event.target.value }))} required>
            <option value="">Pilih role</option>
            {activeRoles.map((role) => (
              <option value={role.id} key={role.id}>{role.name}</option>
            ))}
          </SelectFormField>
          <SelectFormField label="Divisi" value={values.divisionId} onChange={(event) => setValues((current) => ({ ...current, divisionId: event.target.value }))} required>
            <option value="">Pilih divisi</option>
            {activeDivisions.map((division) => (
              <option value={division.id} key={division.id}>{division.name}</option>
            ))}
          </SelectFormField>
          <SelectFormField label="Status" value={values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value as UserStatus }))} required>
            <option value="invited">Invite</option>
            <option value="active">Aktif</option>
            <option value="locked">Locked</option>
          </SelectFormField>
          <SelectFormField label="2FA" value={values.twoFactorStatus} onChange={(event) => setValues((current) => ({ ...current, twoFactorStatus: event.target.value as TwoFactorStatus }))} required>
            <option value="pending">Pending</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </SelectFormField>
          <TextFormField label="Catatan" value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} placeholder="Catatan akses user" />
          <div className="dialogActions">
            <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>Batal</button>
            <button className="primaryButton" type="submit" disabled={saving}>
              <Mail size={17} />
              {saving ? "Menyimpan..." : mode === "edit" ? "Simpan User" : "Kirim Invite"}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function UserAccessDetailDialog({
  row,
  onClose,
  onEdit,
  onToggleStatus,
  onDelete,
  onPasswordAction,
}: {
  row: UserAccessRow | null
  onClose: () => void
  onEdit: (row: UserAccessRow) => void
  onToggleStatus: (row: UserAccessRow) => void
  onDelete: (row: UserAccessRow) => void
  onPasswordAction: (row: UserAccessRow, type?: PasswordActionType) => void
}) {
  if (!row) return null

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="masterDetailTitle">
            <span className="masterDetailIcon">
              <ShieldCheck size={22} />
            </span>
            <div>
              <span>{row.roleName}</span>
              <h2 id="user-detail-title">{row.fullName}</h2>
              <p>{row.email}</p>
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail user" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="masterDetailBody">
          <div className="masterDetailGrid">
            <div className="masterDetailField"><span>Kode User</span><strong>{row.userCode}</strong></div>
            <div className="masterDetailField"><span>Status</span><strong><UserStatusBadge status={row.status} /></strong></div>
            <div className="masterDetailField"><span>Role</span><strong>{row.roleName}</strong></div>
            <div className="masterDetailField"><span>Divisi</span><strong>{row.divisionName}</strong></div>
            <div className="masterDetailField"><span>2FA</span><strong>{twoFactorLabel[row.twoFactorStatus]}</strong></div>
            <div className="masterDetailField"><span>Last Login</span><strong>{formatUserDateTime(row.lastLoginAt)}</strong></div>
            <div className="masterDetailField"><span>Invited</span><strong>{formatUserDateTime(row.invitedAt)}</strong></div>
            <div className="masterDetailField"><span>Setup Password</span><strong>{formatUserDateTime(row.passwordSetupSentAt, "Belum dikirim")}</strong></div>
            <div className="masterDetailField"><span>Reset Password</span><strong>{formatUserDateTime(row.passwordResetSentAt, "Belum dikirim")}</strong></div>
            <div className="masterDetailField"><span>Catatan</span><strong>{row.notes || "-"}</strong></div>
          </div>
        </div>
        <div className="masterDetailActions">
          <button className="secondaryButton" type="button" onClick={() => onEdit(row)}>
            <Pencil size={16} />
            Edit
          </button>
          <button className="secondaryButton dangerSoftButton" type="button" onClick={() => onDelete(row)}>
            <Trash2 size={16} />
            Hapus
          </button>
          <button className="secondaryButton" type="button" onClick={() => onPasswordAction(row)}>
            <KeyRound size={16} />
            {row.status === "invited" ? "Buat Password" : "Reset Password"}
          </button>
          <button className={clsx("primaryButton", row.status !== "locked" && "dangerButton")} type="button" onClick={() => onToggleStatus(row)}>
            {row.status === "locked" ? <FileCheck2 size={16} /> : <Lock size={16} />}
            {row.status === "locked" ? "Unlock" : "Lock"}
          </button>
        </div>
      </section>
    </div>
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

function ProfilePage({
  activeView,
  profile,
  session,
  onLogout,
}: {
  activeView: ViewId
  profile: AppAccessProfile
  session: Session
  onLogout: () => void
}) {
  const [feedback, setFeedback] = useState<ToastMessage | null>(null)
  const [sendingReset, setSendingReset] = useState(false)

  const handleSendReset = async () => {
    setSendingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/?flow=reset-password`,
      })

      if (error) throw error
      setFeedback({
        id: Date.now(),
        tone: "success",
        title: "Reset password dikirim",
        description: `Link reset dikirim ke ${profile.email}.`,
      })
    } catch (error) {
      setFeedback({
        id: Date.now(),
        tone: "error",
        title: "Gagal mengirim reset",
        description: getFriendlySupabaseError(error, "Reset password belum bisa dikirim."),
      })
    } finally {
      setSendingReset(false)
    }
  }

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Informasi akun login, role akses, divisi, dan kontrol keamanan session."
        meta={
          <InlinePageStats
            items={[
              profile.status === "active" ? "Akses aktif" : userStatusLabel[profile.status],
              profile.roleName,
              profile.divisionName,
            ]}
          />
        }
        actions={
          <>
            <button className="secondaryButton" type="button" onClick={handleSendReset} disabled={sendingReset}>
              <KeyRound size={17} />
              {sendingReset ? "Mengirim..." : "Reset Password"}
            </button>
            <button className="primaryButton dangerButton" type="button" onClick={onLogout}>
              <LogOut size={17} />
              Keluar
            </button>
          </>
        }
      />

      <section className="profileLayout">
        <section className="profileHeroPanel">
          <span className="profileHeroAvatar">{getProfileInitials(profile.fullName || profile.email)}</span>
          <div>
            <span className="profileHeroEyebrow">Signed In</span>
            <h2>{profile.fullName}</h2>
            <p>{profile.email}</p>
          </div>
          <UserStatusBadge status={profile.status} />
        </section>

        <section className="profileInfoGrid">
          <div className="profileInfoPanel">
            <span className="profileInfoIcon"><ShieldCheck size={20} /></span>
            <span>Role Akses</span>
            <strong>{profile.roleName}</strong>
            <small>Permission mengikuti modul Role & Permission.</small>
          </div>
          <div className="profileInfoPanel">
            <span className="profileInfoIcon"><UsersRound size={20} /></span>
            <span>Divisi</span>
            <strong>{profile.divisionName}</strong>
            <small>Dipakai untuk scope data operasional.</small>
          </div>
          <div className="profileInfoPanel">
            <span className="profileInfoIcon"><Mail size={20} /></span>
            <span>Email Login</span>
            <strong>{profile.email}</strong>
            <small>Terhubung dengan Supabase Auth.</small>
          </div>
          <div className="profileInfoPanel">
            <span className="profileInfoIcon"><CalendarCheck2 size={20} /></span>
            <span>Last Sign In</span>
            <strong>{formatUserDateTime(session.user.last_sign_in_at, "Belum tersedia")}</strong>
            <small>Session aktif di perangkat ini.</small>
          </div>
        </section>

        <OperationalTableCard>
          <div className="tableHeader">
            <div>
              <h2>Security Session</h2>
              <p>Password tidak pernah ditampilkan ke admin. Reset selalu dikirim lewat email user.</p>
            </div>
          </div>
          <div className="profileSecurityList">
            <div>
              <span>User ID</span>
              <strong>{profile.id}</strong>
            </div>
            <div>
              <span>Auth ID</span>
              <strong>{profile.authUserId}</strong>
            </div>
            <div>
              <span>Created Auth</span>
              <strong>{formatUserDateTime(session.user.created_at, "Belum tersedia")}</strong>
            </div>
          </div>
        </OperationalTableCard>
      </section>

      <ToastViewport toast={feedback} onClose={() => setFeedback(null)} />
    </OperationalPageShell>
  )
}

function MasterDataPage({ activeView }: { activeView: ViewId }) {
  const [activeCategory, setActiveCategory] = useState<MasterCategoryId>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<MasterDataRow | null>(null)
  const [detailRow, setDetailRow] = useState<MasterDataRow | null>(null)
  const [mapRow, setMapRow] = useState<MasterDataRow | null>(null)
  const [statusRow, setStatusRow] = useState<MasterDataRow | null>(null)
  const [detailWarnings, setDetailWarnings] = useState<MasterUsageWarning[]>([])
  const [statusWarnings, setStatusWarnings] = useState<MasterUsageWarning[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [dialogInitialValues, setDialogInitialValues] = useState<MasterDataFormValues>(() => createEmptyMasterForm("divisions"))
  const [rows, setRows] = useState<MasterDataRow[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
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
      ? [row.code, row.name, row.category, row.manager, row.usedBy, row.description, row.address, row.status].join(" ").toLowerCase().includes(normalizedTerm)
      : true
    const matchesStatus = statusFilter === "all" || row.status === statusFilter

    return matchesCategory && matchesSearch && matchesStatus
  })
  const tableColumns = masterTableColumnsByCategory[activeCategory]
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / Math.min(pageSize, 50)))
  const currentPage = Math.min(page, pageCount)
  const paginatedRows = filteredRows.slice((currentPage - 1) * Math.min(pageSize, 50), currentPage * Math.min(pageSize, 50))
  const filteredActiveRows = filteredRows.filter((row) => row.status === "Aktif").length
  const locationReadyRows = rows.filter((row) => row.categoryId === "locations" && hasLocationCoordinate(row) && row.status === "Aktif").length
  const activeCategoryLabel = activeCategory === "all" ? `${masterCategories.length - 1} kategori` : masterCategoryLabels[activeCategory]

  const openCreateDialog = () => {
    const categoryId = activeCategory === "all" ? "divisions" : activeCategory
    setEditingRow(null)
    setDialogInitialValues(createEmptyMasterForm(categoryId))
    setDialogOpen(true)
  }

  const openEditDialog = (row: MasterDataRow) => {
    setEditingRow(row)
    setDetailRow(null)
    setDialogInitialValues({
      categoryId: row.categoryId,
      code: row.code,
      name: row.name,
      description: row.description || "",
      level: String(row.level || 100),
      divisionId: row.divisionId || "",
      address: row.address || "",
      latitude: row.latitude || "",
      longitude: row.longitude || "",
      radiusM: String(row.radiusM || 100),
      startTime: row.startTime || "",
      endTime: row.endTime || "",
      componentType: row.componentType === "deduction" ? "deduction" : "earning",
      status: row.status,
      sortOrder: String(row.sortOrder || 0),
    })
    setDialogOpen(true)
  }

  const openStatusDialog = (row: MasterDataRow) => {
    setDetailRow(null)
    setStatusRow(row)
    setStatusWarnings(getMasterUsageWarnings(row, rows))
    void loadMasterUsageWarnings(row, rows).then((warnings) => setStatusWarnings(warnings))
  }

  const openDetailDialog = (row: MasterDataRow) => {
    setDetailRow(row)
    setDetailWarnings(getMasterUsageWarnings(row, rows))
    void loadMasterUsageWarnings(row, rows).then((warnings) => setDetailWarnings(warnings))
  }

  const showToast = (message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() })
  }

  useEffect(() => {
    setPage(1)
  }, [activeCategory, searchTerm, statusFilter, pageSize])

  const handleSubmitMasterData = async (values: MasterDataFormValues) => {
    setSaving(true)
    setErrorMessage("")

    try {
      await saveMasterData(values, editingRow)
      await writeAuditLog(editingRow ? "Update master data" : "Create master data", getMasterTableName(values.categoryId), editingRow?.id || values.code, {
        category: values.categoryId,
        code: values.code,
        name: values.name,
      }).catch(() => {})
      setDialogOpen(false)
      setEditingRow(null)
      await fetchRows()
      showToast({
        tone: "success",
        title: editingRow ? "Data berhasil diupdate" : "Data berhasil ditambahkan",
        description: `${values.name} sudah tersimpan di Master Data.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal menyimpan master data.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal menyimpan", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChangeMasterData = async () => {
    if (!statusRow) return
    setSaving(true)
    setErrorMessage("")

    try {
      await updateMasterDataStatus(statusRow, !isActiveStatus(statusRow.status))
      await writeAuditLog(isActiveStatus(statusRow.status) ? "Deactivate master data" : "Activate master data", getMasterTableName(statusRow.categoryId), statusRow.id, {
        category: statusRow.categoryId,
        code: statusRow.code,
        name: statusRow.name,
      }).catch(() => {})
      setStatusRow(null)
      await fetchRows()
      showToast({
        tone: "success",
        title: isActiveStatus(statusRow.status) ? "Data dinonaktifkan" : "Data diaktifkan",
        description: `${statusRow.name} berhasil diperbarui.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal mengubah status master data.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal mengubah status", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleReorderMasterData = async (row: MasterDataRow, direction: "up" | "down") => {
    setSaving(true)
    setErrorMessage("")

    try {
      const changed = await updateMasterSortOrder(row, rows, direction)
      if (!changed) return
      await writeAuditLog("Reorder master data", getMasterTableName(row.categoryId), row.id, {
        category: row.categoryId,
        code: row.code,
        direction,
      }).catch(() => {})
      await fetchRows()
      showToast({ tone: "success", title: "Urutan diperbarui", description: `${row.name} berhasil dipindahkan.` })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal mengubah urutan master data.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal mengubah urutan", description: message })
    } finally {
      setSaving(false)
    }
  }

  const statusTargetActive = statusRow ? !isActiveStatus(statusRow.status) : false

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Pondasi dropdown dan referensi data untuk user, karyawan, absensi, payroll, lokasi kerja, bonus, potongan, dan kasbon."
        meta={
          <InlinePageStats
            items={[
              `${filteredRows.length} dari ${rows.length} item`,
              `${filteredActiveRows} aktif`,
              activeCategoryLabel,
              `${locationReadyRows} lokasi GPS siap`,
            ]}
          />
        }
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
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari kode, nama data, kategori, pengelola..." />
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
              <p>Role, divisi, jabatan, shift, lokasi, dan komponen gaji menjadi sumber pilihan modul lain.</p>
            </div>
          </div>
          <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
            <table>
              <colgroup>
                <col className="tableNumberColumn" />
                {tableColumns.map((column) => (
                  <col style={{ width: column.width }} key={column.key} />
                ))}
                <col className="tableActionColumn" />
              </colgroup>
              <thead>
                <tr>
                  <th className="tableNumberHeader">No</th>
                  {tableColumns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th className="tableActionHeader">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="tableStateCell" colSpan={tableColumns.length + 2}>
                      <TableState title="Memuat master data" description="Mengambil data terbaru dari Supabase." icon={Database} />
                    </td>
                  </tr>
                )}
                {!loading && errorMessage && rows.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={tableColumns.length + 2}>
                      <TableState title="Gagal memuat data" description={errorMessage} icon={AlertTriangle} tone="danger" />
                    </td>
                  </tr>
                )}
                {!loading && !errorMessage && filteredRows.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={tableColumns.length + 2}>
                      <TableState title="Data tidak ditemukan" description="Ubah filter atau tambah master data baru." icon={Search} />
                    </td>
                  </tr>
                )}
                {!loading && paginatedRows.map((row, index) => (
                  <ClickableTableRow key={row.id} label={`Lihat detail ${row.name}`} onOpen={() => openDetailDialog(row)}>
                    <td className="tableNumberCell"><TableNumberCell value={(currentPage - 1) * Math.min(pageSize, 50) + index + 1} /></td>
                    {tableColumns.map((column) => (
                      <td key={column.key}>{renderMasterColumn(row, column, setMapRow)}</td>
                    ))}
                    <td className="tableActionCell">
                      <div className="rowActions">
                        <RowActionMenu label={`Aksi ${row.name}`}>
                          {row.categoryId === "locations" && (
                            <RowActionMenuItem disabled={!hasLocationCoordinate(row)} onClick={() => setMapRow(row)}>
                              <LocateFixed size={14} />
                              Lihat Maps
                            </RowActionMenuItem>
                          )}
                          <RowActionMenuItem onClick={() => openEditDialog(row)}>
                            <Pencil size={14} />
                            Edit
                          </RowActionMenuItem>
                          <RowActionMenuItem disabled={saving || !canMoveMasterRow(row, rows, "up")} onClick={() => void handleReorderMasterData(row, "up")}>
                            <ArrowUp size={14} />
                            Naikkan
                          </RowActionMenuItem>
                          <RowActionMenuItem disabled={saving || !canMoveMasterRow(row, rows, "down")} onClick={() => void handleReorderMasterData(row, "down")}>
                            <ArrowDown size={14} />
                            Turunkan
                          </RowActionMenuItem>
                          <RowActionMenuItem danger={isActiveStatus(row.status)} disabled={saving || (row.isSystem && isActiveStatus(row.status))} onClick={() => openStatusDialog(row)}>
                            {isActiveStatus(row.status) ? <Trash2 size={14} /> : <FileCheck2 size={14} />}
                            {isActiveStatus(row.status) ? "Nonaktifkan" : "Aktifkan"}
                          </RowActionMenuItem>
                        </RowActionMenu>
                      </div>
                    </td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          </div>
          <DataTablePagination
            page={currentPage}
            pageSize={pageSize}
            totalRows={filteredRows.length}
            onPageChange={setPage}
            onPageSizeChange={(value) => setPageSize(Math.min(value, 50))}
          />
        </OperationalTableCard>
      </section>
      <MasterDataDialog
        open={dialogOpen}
        mode={editingRow ? "edit" : "create"}
        initialValues={dialogInitialValues}
        divisions={rows.filter((row) => row.categoryId === "divisions")}
        saving={saving}
        onClose={() => {
          setDialogOpen(false)
          setEditingRow(null)
        }}
        onSubmit={handleSubmitMasterData}
      />
      <MasterDataDetailDialog
        row={detailRow}
        usageWarnings={detailWarnings}
        onClose={() => setDetailRow(null)}
        onEdit={(row) => openEditDialog(row)}
        onViewLocation={(row) => {
          setDetailRow(null)
          setMapRow(row)
        }}
        onToggleStatus={(row) => openStatusDialog(row)}
      />
      <ConfirmDialog
        open={Boolean(statusRow)}
        tone={statusTargetActive ? "default" : "danger"}
        eyebrow={statusTargetActive ? "Aktifkan Master Data" : "Nonaktifkan Master Data"}
        title={statusRow ? `${statusTargetActive ? "Aktifkan" : "Nonaktifkan"} ${statusRow.name}?` : "Ubah status data ini?"}
        description={statusTargetActive ? "Data akan kembali muncul sebagai pilihan aktif di modul lain." : "Data tidak dihapus dari Supabase, tapi tidak akan dipakai sebagai pilihan aktif di modul lain."}
        confirmLabel={statusTargetActive ? "Aktifkan Data" : "Nonaktifkan"}
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setStatusRow(null)
        }}
        onConfirm={() => void handleStatusChangeMasterData()}
      >
        {statusRow && (
          <div className="confirmDialogPreview">
            <span>{statusRow.category}</span>
            <strong>{statusRow.name}</strong>
            <small>{statusRow.code}</small>
          </div>
        )}
        {statusWarnings.length > 0 && (
          <div className="confirmRelationList">
            {statusWarnings.map((warning) => (
              <span key={`${warning.label}-${warning.value}`}>
                <small>{warning.label}</small>
                <strong>{warning.value}</strong>
              </span>
            ))}
          </div>
        )}
      </ConfirmDialog>
      <LocationMapDialog row={mapRow} onClose={() => setMapRow(null)} />
      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </OperationalPageShell>
  )
}

function MasterDataDetailDialog({
  row,
  usageWarnings,
  onClose,
  onEdit,
  onViewLocation,
  onToggleStatus,
}: {
  row: MasterDataRow | null
  usageWarnings: MasterUsageWarning[]
  onClose: () => void
  onEdit: (row: MasterDataRow) => void
  onViewLocation: (row: MasterDataRow) => void
  onToggleStatus: (row: MasterDataRow) => void
}) {
  if (!row) return null

  const fields = getMasterDetailFields(row)
  const canToggleStatus = !(row.isSystem && isActiveStatus(row.status))

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="master-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="masterDetailTitle">
            <span className="masterDetailIcon">
              <Database size={22} />
            </span>
            <div>
              <span>{row.category}</span>
              <h2 id="master-detail-title">{row.name}</h2>
              <p>Klik edit untuk mengubah data, atau ubah status jika data tidak lagi dipakai.</p>
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="masterDetailBody">
          <div className="masterDetailGrid">
            {fields.map((field) => (
              <div className="masterDetailField" key={field.label}>
                <span>{field.label}</span>
                <strong>{field.value}</strong>
              </div>
            ))}
          </div>

          {usageWarnings.length > 0 && (
            <div className="masterDetailRelation">
              <small>Relasi & dampak</small>
              <div>
                {usageWarnings.map((warning) => (
                  <span key={`${warning.label}-${warning.value}`}>
                    <em>{warning.label}</em>
                    <strong>{warning.value}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="masterDetailActions">
          {row.categoryId === "locations" && (
            <button className="secondaryButton" type="button" disabled={!hasLocationCoordinate(row)} onClick={() => onViewLocation(row)}>
              <LocateFixed size={16} />
              Lihat Maps
            </button>
          )}
          <button className="secondaryButton" type="button" onClick={() => onEdit(row)}>
            <Pencil size={16} />
            Edit
          </button>
          <button className={clsx("primaryButton", isActiveStatus(row.status) && "dangerButton")} type="button" disabled={!canToggleStatus} onClick={() => onToggleStatus(row)}>
            {isActiveStatus(row.status) ? <Trash2 size={16} /> : <FileCheck2 size={16} />}
            {isActiveStatus(row.status) ? "Nonaktifkan" : "Aktifkan"}
          </button>
        </div>
      </section>
    </div>
  )
}

function MasterDataDialog({
  open,
  mode,
  initialValues,
  divisions,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: MasterDataMutationMode
  initialValues: MasterDataFormValues
  divisions: MasterDataRow[]
  saving: boolean
  onClose: () => void
  onSubmit: (values: MasterDataFormValues) => Promise<void>
}) {
  const [values, setValues] = useState(initialValues)
  const [formErrors, setFormErrors] = useState<string[]>([])

  useEffect(() => {
    setValues(initialValues)
    setFormErrors([])
  }, [initialValues])

  if (!open) return null

  const generatedCode = mode === "edit" ? values.code : generateMasterCode(values.categoryId, values.name)
  const categoryCopy = masterCategoryCopy[values.categoryId]
  const handleCategoryChange = (categoryId: MasterDataFormValues["categoryId"]) => {
    setValues(createEmptyMasterForm(categoryId))
    setFormErrors([])
  }

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
            <h2 id="master-data-title">{mode === "edit" ? categoryCopy.editTitle : categoryCopy.createTitle}</h2>
            <p id="master-data-description">{categoryCopy.description}</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="dialogForm" onSubmit={(event) => {
          event.preventDefault()
          const nextValues = { ...values, code: generatedCode }
          const nextErrors = validateMasterForm(nextValues)

          if (nextErrors.length > 0) {
            setFormErrors(nextErrors)
            return
          }

          setFormErrors([])
          void onSubmit(nextValues)
        }}>
          {formErrors.length > 0 && (
            <div className="formValidationPanel">
              <AlertTriangle size={18} />
              <div>
                <strong>Periksa data form</strong>
                {formErrors.map((error) => (
                  <span key={error}>{error}</span>
                ))}
              </div>
            </div>
          )}
          <SelectFormField label="Kategori" value={values.categoryId} onChange={(event) => handleCategoryChange(event.target.value as MasterDataFormValues["categoryId"])} disabled={mode === "edit"} required>
              {masterCategories.filter((category) => category.id !== "all").map((category) => (
                <option value={category.id} key={category.id}>{category.label}</option>
              ))}
          </SelectFormField>
          <TextFormField label={categoryCopy.nameLabel} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} placeholder={categoryCopy.namePlaceholder} required />
          <TextFormField label="Kode Otomatis" value={generatedCode} disabled readOnly required />
          <TextFormField label="Urutan Dropdown" type="number" min={0} value={values.sortOrder} onChange={(event) => setValues((current) => ({ ...current, sortOrder: event.target.value }))} placeholder="0" required />
          {values.categoryId === "roles" && (
            <>
              <TextFormField label="Level Akses" type="number" value={values.level} onChange={(event) => setValues((current) => ({ ...current, level: event.target.value }))} placeholder="10 / 20 / 100" required />
              <TextFormField label="Deskripsi Role" value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder="Fungsi role di management app" />
            </>
          )}
          {values.categoryId === "divisions" && (
            <TextFormField label="Deskripsi Divisi" value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder="Fungsi divisi dalam operasional" />
          )}
          {values.categoryId === "positions" && (
            <>
              <SelectFormField label="Divisi" value={values.divisionId} onChange={(event) => setValues((current) => ({ ...current, divisionId: event.target.value }))} required>
                <option value="">Pilih divisi</option>
                {divisions.map((division) => (
                  <option value={division.id} key={division.id}>{division.name}</option>
                ))}
              </SelectFormField>
              <TextFormField label="Deskripsi Jabatan" value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder="Tanggung jawab jabatan" />
            </>
          )}
          {values.categoryId === "shifts" && (
            <>
              <TextFormField label="Jam Mulai" type="time" value={values.startTime} onChange={(event) => setValues((current) => ({ ...current, startTime: event.target.value }))} required />
              <TextFormField label="Jam Selesai" type="time" value={values.endTime} onChange={(event) => setValues((current) => ({ ...current, endTime: event.target.value }))} required />
              <TextFormField label="Catatan Shift" value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder="Catatan operasional shift" />
            </>
          )}
          {values.categoryId === "locations" && (
            <>
              <TextFormField label="Alamat" value={values.address} onChange={(event) => setValues((current) => ({ ...current, address: event.target.value }))} placeholder="Alamat lokasi kerja" required />
              <TextFormField label="Latitude" type="number" step="any" value={values.latitude} onChange={(event) => setValues((current) => ({ ...current, latitude: event.target.value }))} placeholder="-6.200000" />
              <TextFormField label="Longitude" type="number" step="any" value={values.longitude} onChange={(event) => setValues((current) => ({ ...current, longitude: event.target.value }))} placeholder="106.816666" />
              <TextFormField label="Radius Meter" type="number" value={values.radiusM} onChange={(event) => setValues((current) => ({ ...current, radiusM: event.target.value }))} placeholder="100" required />
            </>
          )}
          {values.categoryId === "payroll-components" && (
            <>
              <SelectFormField label="Jenis Komponen" value={values.componentType} onChange={(event) => setValues((current) => ({ ...current, componentType: event.target.value as MasterDataFormValues["componentType"] }))} required>
                <option value="earning">Penambah Gaji</option>
                <option value="deduction">Potongan Gaji</option>
              </SelectFormField>
              <TextFormField label="Deskripsi Komponen" value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder="Aturan penggunaan komponen gaji" />
            </>
          )}
          <SwitchFormField
            label="Status"
            checked={values.status === "Aktif"}
            onChange={(checked) => setValues((current) => ({ ...current, status: checked ? "Aktif" : "Nonaktif" }))}
            required
          />
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

function AuthLoadingPage() {
  return (
    <main className="loginShell">
      <section className="loginCard authStateCard">
        <span className="loginMark brandLogo">
          <img src={dmsLogo} alt="DMS" />
        </span>
        <div className="loginHeading">
          <p className="loginEyebrow">DMS System</p>
          <h1>Memeriksa Akses</h1>
        </div>
        <p className="loginSub">Menghubungkan session Supabase dengan Pengguna & Akses.</p>
        <span className="authLoadingBar" />
      </section>
    </main>
  )
}

function AccessDeniedPage({ error, profile, onLogout }: { error?: string; profile: AppAccessProfile | null; onLogout: () => void }) {
  const statusReason = profile?.status === "locked"
    ? "Akses user sedang dikunci oleh admin."
    : profile?.status === "invited"
      ? "User masih berstatus invite dan belum aktif."
      : "Email login belum terdaftar di Pengguna & Akses."

  return (
    <main className="loginShell">
      <section className="loginCard authStateCard">
        <span className="loginMark brandLogo">
          <img src={dmsLogo} alt="DMS" />
        </span>
        <div className="loginHeading">
          <p className="loginEyebrow">Access Guard</p>
          <h1>Akses Ditolak</h1>
        </div>
        <p className="loginSub">{error || statusReason}</p>
        {profile && (
          <div className="accessProfilePreview">
            <span>{profile.email}</span>
            <strong>{profile.fullName}</strong>
            <small>{profile.roleName} / {profile.divisionName}</small>
            <UserStatusBadge status={profile.status} />
          </div>
        )}
        <button className="primaryButton loginButton" type="button" onClick={onLogout}>
          <LogOut size={18} />
          Keluar
        </button>
      </section>
    </main>
  )
}

function isPasswordRecoveryUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const search = new URLSearchParams(window.location.search)

  return search.get("flow") === "reset-password" || window.location.hash.includes("reset-password") || hash.get("type") === "recovery" || search.get("type") === "recovery"
}

function clearAuthCallbackUrl() {
  window.history.replaceState({}, document.title, window.location.pathname)
}

function PasswordRecoveryPage({ email, onCancel, onComplete }: { email?: string; onCancel: () => void; onComplete: () => Promise<void> | void }) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage("")

    if (password.length < 8) {
      setErrorMessage("Password minimal 8 karakter.")
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage("Konfirmasi password belum sama.")
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) throw error
      clearAuthCallbackUrl()
      await onComplete()
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Gagal menyimpan password baru."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="loginShell">
      <section className="loginCard authStateCard">
        <span className="loginMark brandLogo">
          <img src={dmsLogo} alt="DMS" />
        </span>
        <div className="loginHeading">
          <p className="loginEyebrow">Password Access</p>
          <h1>Buat Password Baru</h1>
        </div>
        <p className="loginSub">Masukkan password baru untuk akun DMS{email ? ` ${email}` : ""}.</p>

        <form className="loginForm" onSubmit={handleSubmit}>
          {errorMessage && (
            <div className="loginAlert danger">
              <AlertTriangle size={17} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="loginField">
            <label htmlFor="new-password">Password Baru</label>
            <div className="inputWithIcon">
              <KeyRound size={17} />
              <input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" autoComplete="new-password" required />
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

          <div className="loginField">
            <label htmlFor="confirm-password">Konfirmasi Password</label>
            <div className="inputWithIcon">
              <Lock size={17} />
              <input id="confirm-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Ulangi password baru" autoComplete="new-password" required />
            </div>
          </div>

          <button className="primaryButton loginButton" type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : (
              <>
                <KeyRound size={18} />
                Simpan Password
              </>
            )}
          </button>
        </form>

        <button type="button" className="forgotPasswordButton" onClick={onCancel} disabled={loading}>Batal dan keluar</button>
      </section>
    </main>
  )
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [passwordRecoverySession, setPasswordRecoverySession] = useState<Session | null>(null)
  const [accessProfile, setAccessProfile] = useState<AppAccessProfile | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState("")
  const [activeView, setActiveView] = useState<ViewId>("dashboard")
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const activeLabel = navItems.find((item) => item.id === activeView)?.label || "Dashboard"
  const visibleNavItems = useMemo(
    () => accessProfile ? navItems.filter((item) => canAccessView(accessProfile, item.id)) : navItems.filter((item) => item.id === "dashboard" || item.id === "profile"),
    [accessProfile],
  )

  const applySession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession)
    setAuthError("")

    if (!nextSession) {
      setAccessProfile(null)
      setAuthLoading(false)
      return
    }

    setAuthLoading(true)
    try {
      const profile = await loadAppAccessProfile(nextSession)
      setAccessProfile(profile)
    } catch (error) {
      setAccessProfile(null)
      setAuthError(getFriendlySupabaseError(error, "Gagal memeriksa akses user."))
    } finally {
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      setAuthLoading(true)
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) return
      if (error) {
        setAuthError(getFriendlySupabaseError(error, "Gagal membaca session login."))
        setAuthLoading(false)
        return
      }

      if (data.session && isPasswordRecoveryUrl()) {
        setSession(data.session)
        setPasswordRecoverySession(data.session)
        setAuthError("")
        setAuthLoading(false)
        return
      }

      await applySession(data.session)
    }

    void bootstrap()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      if (event === "PASSWORD_RECOVERY" && nextSession) {
        setSession(nextSession)
        setPasswordRecoverySession(nextSession)
        setAccessProfile(null)
        setAuthError("")
        setAuthLoading(false)
        return
      }

      if (event === "SIGNED_OUT") {
        setPasswordRecoverySession(null)
      }

      void applySession(nextSession)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [applySession])

  const handleLogout = async () => {
    await supabase.auth.signOut().catch(() => {})
    setSession(null)
    setPasswordRecoverySession(null)
    setAccessProfile(null)
    setAuthError("")
    setMobileMenuOpen(false)
    clearAuthCallbackUrl()
  }

  const handlePasswordRecoveryComplete = async () => {
    setPasswordRecoverySession(null)
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      setAuthError(getFriendlySupabaseError(error, "Password tersimpan, tapi session belum bisa dibaca. Silakan login ulang."))
      await handleLogout()
      return
    }

    await applySession(data.session)
  }

  useEffect(() => {
    if (!accessProfile || accessProfile.status !== "active") return
    if (canAccessView(accessProfile, activeView)) return

    const fallbackView = canAccessView(accessProfile, "dashboard") ? "dashboard" : "profile"
    setActiveView(fallbackView)
  }, [accessProfile, activeView])

  const navigate = (view: ViewId) => {
    if (accessProfile && !canAccessView(accessProfile, view)) {
      setActiveView(canAccessView(accessProfile, "dashboard") ? "dashboard" : "profile")
      setMobileMenuOpen(false)
      return
    }

    setActiveView(view)
    setMobileMenuOpen(false)
  }

  if (authLoading) {
    return <AuthLoadingPage />
  }

  if (passwordRecoverySession) {
    return (
      <PasswordRecoveryPage
        email={passwordRecoverySession.user.email}
        onCancel={handleLogout}
        onComplete={handlePasswordRecoveryComplete}
      />
    )
  }

  if (!session) {
    return <LoginPage authError={authError} onLogin={applySession} />
  }

  if (!accessProfile || accessProfile.status !== "active") {
    return <AccessDeniedPage error={authError} profile={accessProfile} onLogout={handleLogout} />
  }

  return (
    <div className={clsx("appShell", collapsed && "sidebarCollapsed")}>
      <div className="desktopSidebarSlot">
        <Sidebar activeView={activeView} collapsed={collapsed} profile={accessProfile} items={visibleNavItems} onNavigate={navigate} onLogout={handleLogout} onToggle={() => setCollapsed((value) => !value)} />
      </div>

      {mobileMenuOpen && (
        <div className="mobileNavScrim open" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobileMorePanel open" onClick={(event) => event.stopPropagation()}>
            <Sidebar activeView={activeView} collapsed={false} profile={accessProfile} items={visibleNavItems} mobile onNavigate={navigate} onLogout={handleLogout} onToggle={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <main className="appMain">
        <AppTopbar activeLabel={activeLabel} profile={accessProfile} onMobileMenu={() => setMobileMenuOpen(true)} onProfile={() => navigate("profile")} onLogout={handleLogout} />
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
          ) : activeView === "profile" ? (
            <ProfilePage activeView={activeView} profile={accessProfile} session={session} onLogout={handleLogout} />
          ) : (
            <ModulePage activeView={activeView} />
          )}
        </div>
      </main>

      <BottomNav activeView={activeView} items={visibleNavItems} onNavigate={navigate} />
    </div>
  )
}
