import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, ChangeEvent, KeyboardEvent, ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Archive,
  BadgeDollarSign,
  Bell,
  CalendarCheck2,
  Camera,
  ClipboardList,
  ChevronDown,
  CreditCard,
  Crown,
  Database,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileBarChart,
  FileCheck2,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LocateFixed,
  LogIn,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Menu,
  Megaphone,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Copy,
  Printer,
  RefreshCcw,
  RotateCcw,
  ScanFace,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
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
import { FoundationSkeleton, FoundationTableSkeletonRows } from "./components/foundation-loading"
import { FoundationSelect } from "./components/foundation-select"
import { DateFormField, SegmentedFormField, SelectFormField, SwitchFormField, TextFormField } from "./components/form-field"
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
  | "kiosk-mode"
  | "biofinger"
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
type PayrollStatus = "active" | "ready" | "locked" | "paid" | "void"
type PayrollProcessAction = "lock" | "mark_paid" | "unlock" | "void" | "restore"
type AttendanceLogStatus = "valid" | "review" | "rejected"
type AttendanceGpsStatus = "valid" | "out_of_radius" | "missing"
type AttendanceFaceStatus = "verified" | "review" | "failed" | "not_required"
type EmployeeFaceProfileStatus = "unenrolled" | "pending_review" | "approved" | "rejected" | "disabled"
type AppScope = "management" | "field" | "both"

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

interface AttendanceMonitorRow {
  id: string
  employeeId: string
  employeeCode: string
  fullName: string
  employeePhotoPath: string
  employeePhotoUrl: string
  divisionName: string
  workLocationName: string
  attendanceDate: string
  eventAt: string
  checkInId: string
  checkInAt: string
  checkInStatus: AttendanceLogStatus | "missing"
  checkInGpsStatus: AttendanceGpsStatus | "missing"
  checkInFaceStatus: AttendanceFaceStatus
  checkInFaceScore: number | null
  checkInDistanceM: number | null
  checkInNotes: string
  checkOutId: string
  checkOutAt: string
  checkOutStatus: AttendanceLogStatus | "missing"
  checkOutGpsStatus: AttendanceGpsStatus | "missing"
  checkOutFaceStatus: AttendanceFaceStatus
  checkOutFaceScore: number | null
  checkOutDistanceM: number | null
  checkOutNotes: string
  attendanceStatus: AttendanceStatus
  logStatus: AttendanceLogStatus | "missing"
  gpsStatus: AttendanceGpsStatus | "missing"
  faceStatus: AttendanceFaceStatus
  faceScore: number | null
  distanceM: number | null
  radiusM: number | null
  cycleDays: number
  targetDays: number
  payrollCycleId: string
  payrollCycleNumber: number
  periodStartedAt: string
  periodClosedAt: string
  payrollReadyAt: string
  payrollLockedAt: string
  payrollPaidAt: string
  payrollStatus: PayrollStatus
  payrollAmount: number
  basePayrollAmount: number
  overtimeAmount: number
  salaryType: EmployeeSalaryType
  workDurationLabel: string
  notes: string
}

interface AttendanceReviewRow {
  id: string
  employeeId: string
  employeeCode: string
  fullName: string
  employeePhotoPath: string
  employeePhotoUrl: string
  divisionName: string
  workLocationName: string
  attendanceDate: string
  eventType: "check_in" | "check_out"
  eventAt: string
  latitude: string
  longitude: string
  status: AttendanceLogStatus
  gpsStatus: AttendanceGpsStatus
  faceStatus: AttendanceFaceStatus
  faceScore: number | null
  faceSnapshotPath: string
  faceSnapshotUrl: string
  distanceM: number | null
  radiusM: number | null
  workLocationLatitude: string
  workLocationLongitude: string
  workdayCounted: boolean
  workDurationLabel: string
  pairedCheckInAt: string
  pairedCheckInStatus: AttendanceLogStatus | "missing"
  pairedCheckOutAt: string
  pairedCheckOutStatus: AttendanceLogStatus | "missing"
  issueLabel: string
  notes: string
}

interface AttendanceReviewGroup {
  id: string
  employeeId: string
  employeeCode: string
  fullName: string
  employeePhotoUrl: string
  divisionName: string
  workLocationName: string
  attendanceDate: string
  checkIn?: AttendanceReviewRow
  checkOut?: AttendanceReviewRow
  pairedCheckInAt: string
  pairedCheckInStatus: AttendanceLogStatus | "missing"
  pairedCheckOutAt: string
  pairedCheckOutStatus: AttendanceLogStatus | "missing"
  reviewCount: number
  issues: string[]
  workDurationLabel: string
  status: AttendanceLogStatus
}

interface FieldLocationSummary {
  id: string
  code: string
  name: string
  address: string
  latitude: string
  longitude: string
  radiusM: number
  isReady: boolean
  employeeCount: number
  validToday: number
  reviewToday: number
}

type OvertimeStatus = "draft" | "pending" | "approved" | "rejected"

interface OvertimeReviewRow {
  id: string
  employeeId: string
  employeeCode: string
  fullName: string
  employeePhotoPath: string
  employeePhotoUrl: string
  divisionName: string
  overtimeDate: string
  shiftStartTime: string
  shiftEndTime: string
  actualCheckOutAt: string
  overtimeMinutes: number
  approvedMinutes: number
  rateAmount: number
  totalAmount: number
  dayType: "weekday" | "sunday" | "holiday"
  status: OvertimeStatus
  componentName: string
  notes: string
}

interface OperationsFoundationData {
  rows: AttendanceMonitorRow[]
  allRows: AttendanceMonitorRow[]
  locations: FieldLocationSummary[]
  reviews: AttendanceReviewRow[]
  overtime: OvertimeReviewRow[]
}

type AttendanceRecapRange = "day" | "week" | "month"
type AttendanceDateMode = "today" | "yesterday" | "last7" | "last30" | "day" | "week" | "month" | "year" | "all"

interface FieldAttendanceSubmitPayload {
  mode?: "field" | "kiosk"
  eventType: "check_in" | "check_out" | "auto"
  kioskId?: string | null
  kioskCode?: string | null
  credentialType?: "barcode" | "rfid" | null
  credentialValue?: string | null
  latitude?: number
  longitude?: number
  faceScore: number | null
  faceEmbedding?: number[] | null
  faceEmbeddingModel?: string | null
  faceSnapshotBase64?: string | null
  faceSnapshotContentType?: string | null
  notes: string
}

interface FaceEnrollmentSubmitPayload {
  snapshotsBase64: string[]
  faceEmbeddings: number[][]
  faceEmbeddingModel: string
}

interface FieldAttendanceResult {
  log: {
    id: string
    attendance_date: string
    event_type: "check_in" | "check_out"
    status: AttendanceLogStatus
    gps_status: AttendanceGpsStatus
    face_status: AttendanceFaceStatus
    distance_m: number
    radius_m: number
    face_score: number | null
  }
  employee: {
    id: string
    code: string
    name: string
  }
  location: {
    id: string
    name: string
    radiusM: number
  }
}

interface AttendanceWorkLocationGate {
  name: string
  latitude: string | number
  longitude: string | number
  radiusM: number
}

interface EmployeePortalAttendanceLog {
  id: string
  attendanceDate: string
  eventType: "check_in" | "check_out"
  eventAt: string
  status: AttendanceLogStatus
  gpsStatus: AttendanceGpsStatus
  faceStatus: AttendanceFaceStatus
  faceScore: number | null
  distanceM: number | null
  radiusM: number | null
  workdayCounted: boolean
  notes: string
}

interface EmployeePortalData {
  employee: {
    id: string
    code: string
    name: string
    photoPath: string
    photoUrl: string
    divisionName: string
    positionName: string
    workLocationName: string
    workLocationAddress: string
    workLocationLatitude: string
    workLocationLongitude: string
    radiusM: number
    shiftName: string
    salaryType: EmployeeSalaryType
    dailySalary: number
    monthlySalary: number
    payrollMethod: EmployeePayrollMethod
    joinDate: string
    status: EmployeeStatus
  }
  faceProfile: {
    status: EmployeeFaceProfileStatus
    threshold: number
    verificationRequired: boolean
    submittedAt: string
    reviewedAt: string
    reviewNotes: string
  }
  payrollCycle: {
    id: string
    cycleNumber: number
    workDaysCount: number
    targetWorkDays: number
    grossAmount: number
    overtimeAmount: number
    netAmount: number
    status: PayrollStatus
    periodStartedAt: string
    periodClosedAt: string
    readyAt: string
  } | null
  todayLogs: EmployeePortalAttendanceLog[]
  recentLogs: EmployeePortalAttendanceLog[]
}

type ModuleViewId = Exclude<ViewId, "dashboard" | "kiosk-mode" | "biofinger" | "master-data" | "users" | "role-permission" | "audit-log" | "profile">

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
type PasswordDeliveryMode = "manual" | "email"
type EmployeeStatus = "active" | "review" | "inactive"
type EmployeeSalaryType = "daily" | "monthly"
type EmployeePayrollMethod = "attendance_cycle" | "calendar_month" | "custom"
type EmployeeDirectoryTab = "all" | EmployeeStatus | "archived"

interface EmployeeDirectoryRow {
  id: string
  employeeCode: string
  fullName: string
  photoPath: string
  photoUrl: string
  nik: string
  phone: string
  email: string
  divisionId: string
  divisionName: string
  positionId: string
  positionName: string
  workLocationId: string
  workLocationName: string
  shiftId: string
  shiftName: string
  salaryType: EmployeeSalaryType
  dailySalary: number
  monthlySalary: number
  payrollMethod: EmployeePayrollMethod
  prorateEnabled: boolean
  qrToken: string
  rfidUid: string
  attendancePolicyId: string
  attendancePolicyName: string
  kioskAccessEnabled: boolean
  lastCardIssuedAt: string
  joinDate: string
  payrollCycleDays: number
  status: EmployeeStatus
  faceProfileId: string
  faceProfileStatus: EmployeeFaceProfileStatus
  faceProfileThreshold: number
  faceProfileRequired: boolean
  faceReferenceImagePath: string
  faceReferenceImageUrl: string
  faceProfileSubmittedAt: string
  faceProfileReviewedAt: string
  faceProfileReviewNotes: string
  notes: string
  deletedAt: string
}

interface EmployeeFormValues {
  employeeCode: string
  fullName: string
  photoPath: string
  photoUrl: string
  photoFile: File | null
  removePhoto: boolean
  nik: string
  phone: string
  email: string
  divisionId: string
  positionId: string
  workLocationId: string
  shiftId: string
  salaryType: EmployeeSalaryType
  dailySalary: string
  monthlySalary: string
  payrollMethod: EmployeePayrollMethod
  prorateEnabled: boolean
  qrToken: string
  rfidUid: string
  attendancePolicyId: string
  kioskAccessEnabled: boolean
  kioskSchemaReady: boolean
  joinDate: string
  payrollCycleDays: string
  status: EmployeeStatus
  notes: string
}

interface EmployeeOption {
  id: string
  code: string
  name: string
  divisionId?: string
  isActive: boolean
}

interface AttendancePolicyOption {
  id: string
  code: string
  name: string
  requireFace: boolean
  requireLocation: boolean
  allowedMedia: string[]
  isActive: boolean
}

interface AttendanceKioskOption {
  id: string
  kioskCode: string
  name: string
  source: "kiosk" | "location"
  workLocationId: string
  workLocationName: string
  policyId: string
  policyName: string
  allowedMedia: string[]
  requireFace: boolean
  requireLocation: boolean
  status: string
}

type BiofingerLinkStatus = "pending" | "active" | "ignored" | "inactive"
type BiofingerImportStatus = "pending" | "mapped" | "converted" | "ignored" | "error"
type BiofingerWorkspaceTab = "overview" | "devices" | "mapping" | "events"

const BIOFINGER_ALL_DEVICES = "all"

interface BiofingerDeviceRow {
  id: string
  deviceCode: string
  name: string
  vendor: string
  model: string
  serialNumber: string
  macAddress: string
  ipAddress: string
  port: number
  workLocationId: string
  workLocationName: string
  status: string
  lastSeenAt: string
  lastSyncAt: string
  syncCursorAt: string
  notes: string
}

interface BiofingerWorkLocationOption {
  id: string
  code: string
  name: string
  isActive: boolean
}

interface BiofingerEmployeeOption {
  id: string
  employeeCode: string
  fullName: string
  status: EmployeeStatus
}

interface BiofingerUserLinkRow {
  id: string
  attendanceDeviceId: string
  employeeId: string
  employeeCode: string
  employeeName: string
  externalUserId: string
  externalUid: number | null
  externalName: string
  privilege: number | null
  status: BiofingerLinkStatus
  matchedBy: string
  lastSeenAt: string
  lastSyncedAt: string
  notes: string
}

interface BiofingerEventRow {
  id: string
  attendanceDeviceId: string
  externalUserId: string
  employeeId: string
  employeeCode: string
  employeeName: string
  deviceEventAt: string
  attendanceDate: string
  punch: number | null
  statusCode: number | null
  normalizedEventType: "check_in" | "check_out" | "unknown"
  importStatus: BiofingerImportStatus
  sourceHash: string
}

interface BiofingerData {
  schemaReady: boolean
  devices: BiofingerDeviceRow[]
  links: BiofingerUserLinkRow[]
  events: BiofingerEventRow[]
  eventCount: number
  employees: BiofingerEmployeeOption[]
  workLocations: BiofingerWorkLocationOption[]
}

type BiofingerDataUpdater = BiofingerData | ((current: BiofingerData) => BiofingerData)

function createEmptyBiofingerData(): BiofingerData {
  return { schemaReady: true, devices: [], links: [], events: [], eventCount: 0, employees: [], workLocations: [] }
}

let biofingerDataCache: BiofingerData | null = null
let biofingerSelectedDeviceCache = ""
let biofingerActiveTabCache: BiofingerWorkspaceTab = "overview"
let biofingerStatusFilterCache: "all" | BiofingerLinkStatus = "all"
let biofingerSearchTermCache = ""
let biofingerPageSizeCache = 25

interface FaceEnrollmentTarget {
  id?: string
  employeeCode: string
  fullName: string
  divisionName?: string
  positionName?: string
  photoUrl?: string
}

interface UserAccessRow {
  id: string
  userCode: string
  fullName: string
  email: string
  roleId: string
  roleName: string
  divisionId: string
  divisionName: string
  employeeId: string
  employeeCode: string
  employeeName: string
  appScope: AppScope
  lastLoginAt: string
  invitedAt: string
  passwordSetupSentAt: string
  passwordResetSentAt: string
  passwordManualSetAt: string
  emailVerifiedAt: string
  forcePasswordChange: boolean
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
  employeeId: string
  appScope: AppScope
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

interface UserEmployeeOption {
  id: string
  code: string
  name: string
  email: string
  divisionId: string
  isActive: boolean
  linkedUserId: string
  linkedUserName: string
  linkedUserEmail: string
}

interface AppAccessProfile {
  id: string
  userCode: string
  authUserId: string
  fullName: string
  email: string
  roleId: string
  roleName: string
  divisionId: string
  divisionName: string
  employeeId: string
  appScope: AppScope
  status: UserStatus
  permissions: string[]
  emailVerifiedAt: string
  forcePasswordChange: boolean
  twoFactorStatus: TwoFactorStatus
}

interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  targetTable: string
  targetId: string
  status: string
  metadata: string
  createdAt: string
}

interface PermissionDefinition {
  key: string
  label: string
  group: string
  description: string
}

interface RolePermissionRole {
  id: string
  code: string
  name: string
  description: string
  level: number
  isSystem: boolean
  isActive: boolean
  userCount: number
}

interface RolePermissionRecord {
  roleId: string
  permissionKey: string
  enabled: boolean
}

interface RolePermissionData {
  roles: RolePermissionRole[]
  permissions: PermissionDefinition[]
  matrix: Record<string, Record<string, boolean>>
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
  calculationUnit?: string
  rateAmount?: number
  dayType?: string
  autoDetectOvertime?: boolean
  requiresApproval?: boolean
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
  calculationUnit: "fixed" | "hour" | "day"
  rateAmount: string
  dayType: "all" | "weekday" | "sunday" | "holiday"
  autoDetectOvertime: boolean
  requiresApproval: boolean
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

const accessProfileCacheKey = "dms.management.accessProfile.v4"
const accessProfileCacheMaxAgeMs = 1000 * 60 * 60 * 12

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "" },
  { id: "attendance-live", label: "Live Absensi", icon: Megaphone, group: "Operasional" },
  { id: "kiosk-mode", label: "Kiosk Mode", icon: ScanLine, group: "Operasional" },
  { id: "biofinger", label: "Biofinger", icon: Fingerprint, group: "Operasional" },
  { id: "employees", label: "Karyawan", icon: UserPlus, group: "Operasional" },
  { id: "attendance-requests", label: "Rekap Absensi", icon: CalendarCheck2, group: "Operasional" },
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

const productionReadyViews = new Set<ViewId>([
  "dashboard",
  "attendance-live",
  "kiosk-mode",
  "biofinger",
  "employees",
  "attendance-requests",
  "attendance-review",
  "field-monitoring",
  "payroll",
  "master-data",
  "users",
  "role-permission",
  "audit-log",
  "profile",
])

const viewPermissionMap: Partial<Record<ViewId, string>> = {
  dashboard: "dashboard.view",
  "attendance-live": "attendance.view",
  "kiosk-mode": "attendance.view",
  biofinger: "biofinger.view",
  employees: "employees.view",
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
  if (view === "biofinger") return profile.permissions.includes("biofinger.view") || profile.permissions.includes("attendance.view")
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
  { key: "employees.view", label: "Lihat Karyawan", group: "Karyawan", description: "Melihat direktori karyawan dan relasi master data." },
  { key: "employees.manage", label: "Kelola Karyawan", group: "Karyawan", description: "Tambah, ubah, nonaktifkan, dan hapus data karyawan." },
  { key: "attendance.view", label: "Lihat Absensi", group: "Absensi", description: "Monitoring absensi GPS dan face verification." },
  { key: "attendance.review", label: "Review Absensi", group: "Absensi", description: "Approve/reject absensi bermasalah." },
  { key: "biofinger.view", label: "Lihat Biofinger", group: "Absensi", description: "Melihat device, user mesin, dan raw event fingerprint." },
  { key: "biofinger.manage", label: "Kelola Biofinger", group: "Absensi", description: "Mapping user Biofinger ke karyawan DMS dan proses import." },
  { key: "overtime.view", label: "Lihat Lembur", group: "Payroll", description: "Melihat kandidat lembur dari check-out melewati jam shift." },
  { key: "overtime.review", label: "Review Lembur", group: "Payroll", description: "Approve/reject lembur sebelum masuk payroll." },
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
    "employees.view",
    "employees.manage",
    "attendance.view",
    "attendance.review",
    "biofinger.view",
    "biofinger.manage",
    "overtime.view",
    "overtime.review",
    "payroll.view",
    "cash_advance.manage",
    "audit_logs.view",
  ],
  Finance: ["dashboard.view", "master_data.view", "employees.view", "attendance.view", "biofinger.view", "overtime.view", "overtime.review", "payroll.view", "payroll.process", "cash_advance.manage", "audit_logs.view"],
  Supervisor: ["dashboard.view", "users.view", "employees.view", "attendance.view", "attendance.review", "biofinger.view", "overtime.view", "master_data.view"],
  Admin: ["dashboard.view", "users.view", "users.create", "master_data.view", "master_data.manage", "employees.view", "employees.manage", "attendance.view", "attendance.review", "biofinger.view", "biofinger.manage", "audit_logs.view"],
  Viewer: ["dashboard.view", "users.view", "master_data.view", "employees.view", "attendance.view", "biofinger.view", "payroll.view"],
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
  locked: "Locked",
  paid: "Terbayar",
  void: "Void",
}

const appScopeLabel: Record<AppScope, string> = {
  management: "Management",
  field: "Lapangan",
  both: "Management + Lapangan",
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
    formDescription: "Draft form untuk koreksi HR saat data valid di lapangan perlu disesuaikan.",
    formFields: [
      { label: "Karyawan", placeholder: "Pilih / cari karyawan" },
      { label: "Tanggal", placeholder: "2026-08-04", type: "date" },
      { label: "Catatan", placeholder: "Alasan koreksi absensi" },
    ],
    tableTitle: "Realtime Attendance Feed",
    tableDescription: "Log draft absensi mobile yang masuk dari user karyawan.",
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
    formDescription: "Draft form awal untuk struktur data karyawan sebelum CRUD backend.",
    formFields: [
      { label: "Nama Lengkap", placeholder: "Nama karyawan" },
      { label: "Divisi", placeholder: "Produksi / Finance / Warehouse" },
      { label: "Gaji Harian", placeholder: "150000", type: "number" },
    ],
    tableTitle: "Employee Directory",
    tableDescription: "Daftar draft karyawan dengan status payroll cycle.",
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
    formDescription: "Draft form untuk request yang masuk via HR/management.",
    formFields: [
      { label: "Tipe Request", placeholder: "Izin / Sakit / Cuti" },
      { label: "Tanggal", placeholder: "2026-08-04", type: "date" },
      { label: "Keterangan", placeholder: "Ringkasan pengajuan" },
    ],
    tableTitle: "Attendance Requests",
    tableDescription: "Antrian draft pengajuan absensi karyawan.",
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
    formDescription: "Draft action untuk approve/reject absensi sebelum masuk hitungan gaji.",
    formFields: [
      { label: "ID Absensi", placeholder: "ATT-00021" },
      { label: "Keputusan", placeholder: "Approve / Reject" },
      { label: "Catatan HR", placeholder: "Catatan audit" },
    ],
    tableTitle: "Review Queue",
    tableDescription: "Data draft yang belum otomatis valid.",
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
    formDescription: "Draft form untuk mengatur lokasi kerja sementara per karyawan/shift.",
    formFields: [
      { label: "Karyawan", placeholder: "Pilih karyawan" },
      { label: "Lokasi Kerja", placeholder: "Gudang Utama" },
      { label: "Radius", placeholder: "100", type: "number" },
    ],
    tableTitle: "Field Monitor",
    tableDescription: "Snapshot draft posisi dan aktivitas tim.",
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
    formDescription: "Draft form untuk bonus, potongan, dan penyesuaian sebelum payroll final.",
    formFields: [
      { label: "Karyawan", placeholder: "Pilih karyawan" },
      { label: "Bonus", placeholder: "250000", type: "number" },
      { label: "Potongan", placeholder: "0", type: "number" },
    ],
    tableTitle: "Payroll Cycle",
    tableDescription: "Draft payroll berdasarkan 26 hari kerja valid.",
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
    formDescription: "Draft form untuk pengajuan dan pencatatan kasbon manual.",
    formFields: [
      { label: "Karyawan", placeholder: "Pilih karyawan" },
      { label: "Nominal", placeholder: "500000", type: "number" },
      { label: "Tenor Potong", placeholder: "1x / 2x / 3x" },
    ],
    tableTitle: "Cash Advance Ledger",
    tableDescription: "Ledger draft kasbon yang akan terhubung ke payroll.",
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
    formDescription: "Draft form untuk titik GPS dan radius absen karyawan.",
    formFields: [
      { label: "Nama Lokasi", placeholder: "Gudang Utama" },
      { label: "Koordinat", placeholder: "-6.200000, 106.816666" },
      { label: "Radius Meter", placeholder: "100", type: "number" },
    ],
    tableTitle: "Work Location Master",
    tableDescription: "Master draft lokasi yang menjadi acuan absensi mobile.",
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

function normalizeNumericInput(value: string) {
  return value.trim().replace(",", ".")
}

function parseOptionalNumberInput(value: string) {
  const normalized = normalizeNumericInput(value)
  return normalized ? Number(normalized) : null
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
    calculationUnit: "fixed",
    rateAmount: "0",
    dayType: "all",
    autoDetectOvertime: false,
    requiresApproval: true,
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
    calculationUnit: row.calculation_unit ? String(row.calculation_unit) : "fixed",
    rateAmount: row.rate_amount === null || row.rate_amount === undefined ? 0 : Number(row.rate_amount),
    dayType: row.day_type ? String(row.day_type) : "all",
    autoDetectOvertime: row.auto_detect_overtime === true,
    requiresApproval: row.requires_approval !== false,
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
    supabase.from("payroll_components").select("id, code, name, component_type, description, calculation_unit, rate_amount, day_type, auto_detect_overtime, requires_approval, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
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

function createMasterPayload(values: MasterDataFormValues, codeOverride?: string) {
  const generatedCode = codeOverride || values.code.trim() || generateMasterCode(values.categoryId, values.name)
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
      latitude: parseOptionalNumberInput(values.latitude),
      longitude: parseOptionalNumberInput(values.longitude),
      radius_m: Number(normalizeNumericInput(values.radiusM) || 100),
      is_active: basePayload.is_active,
      sort_order: basePayload.sort_order,
    }
  }

  if (values.categoryId === "payroll-components") {
    return {
      ...basePayload,
      component_type: values.componentType,
      calculation_unit: values.calculationUnit,
      rate_amount: Number(values.rateAmount || 0),
      day_type: values.dayType,
      auto_detect_overtime: values.autoDetectOvertime,
      requires_approval: values.requiresApproval,
    }
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

async function getAvailableMasterCode(
  tableName: string,
  categoryId: Exclude<MasterCategoryId, "all">,
  name: string,
  editingRow?: MasterDataRow | null,
) {
  const currentCode = editingRow?.code || ""
  const baseCode = (currentCode || generateMasterCode(categoryId, name)).toUpperCase()

  if (editingRow || currentCode) return baseCode

  const { data, error } = await supabase
    .from(tableName)
    .select("id, code")
    .ilike("code", `${baseCode}%`)

  if (error) throw error

  const usedCodes = new Set(
    (data || [])
      .map((row) => String(row.code || "").toUpperCase()),
  )

  if (!usedCodes.has(baseCode)) return baseCode

  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${baseCode}-${index}`
    if (!usedCodes.has(candidate)) return candidate
  }

  return `${baseCode}-${Date.now().toString(36).toUpperCase()}`
}

async function saveMasterData(values: MasterDataFormValues, editingRow?: MasterDataRow | null) {
  const tableName = getMasterTableName(values.categoryId)
  const code = await getAvailableMasterCode(tableName, values.categoryId, values.name, editingRow)
  const payload = createMasterPayload(values, code)
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
  const errorObject = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } : null
  const rawMessage = error instanceof Error ? error.message : String(errorObject?.message || "")
  const rawDetails = String(errorObject?.details || "")
  const rawHint = String(errorObject?.hint || "")
  const message = `${rawMessage} ${rawDetails} ${rawHint}`.toLowerCase()
  const code = String(errorObject?.code || "")

  if (!rawMessage && !message.trim()) return fallback

  if (code === "42501" || message.includes("row-level security") || message.includes("permission denied")) {
    return "Akses user belum punya izin Kelola Master Data. Cek Role & Permission untuk permission master_data.manage."
  }

  if (code === "23505" || message.includes("duplicate key") || message.includes("already exists")) {
    return "Kode atau nama data sudah dipakai. Gunakan nama lokasi yang belum ada."
  }

  if (message.includes("work_locations_latitude") || message.includes("latitude")) {
    return "Latitude lokasi harus berada di rentang -90 sampai 90."
  }

  if (message.includes("work_locations_longitude") || message.includes("longitude")) {
    return "Longitude lokasi harus berada di rentang -180 sampai 180."
  }

  if (message.includes("work_locations_radius") || message.includes("radius")) {
    return "Radius lokasi harus angka 1 sampai 10.000 meter."
  }

  if (message.includes("violates check constraint")) {
    return "Data belum sesuai aturan database. Periksa kembali angka, status, radius, atau koordinat."
  }

  return rawMessage || fallback
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
  const radius = Number(normalizeNumericInput(values.radiusM))
  const sortOrder = Number(values.sortOrder)
  const latitude = parseOptionalNumberInput(values.latitude)
  const longitude = parseOptionalNumberInput(values.longitude)

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

  if (values.categoryId === "payroll-components") {
    const rateAmount = Number(values.rateAmount)

    if (!values.calculationUnit) errors.push("Unit hitung komponen wajib dipilih.")
    if (!Number.isFinite(rateAmount) || rateAmount < 0) errors.push("Nominal rate komponen wajib angka 0 atau lebih.")
    if (values.autoDetectOvertime && values.componentType !== "earning") errors.push("Auto lembur wajib memakai jenis Penambah Gaji.")
    if (values.autoDetectOvertime && values.calculationUnit !== "hour") errors.push("Auto lembur wajib memakai unit Per Jam.")
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
    warnings.push({ label: "Rate", value: row.calculationUnit === "hour" ? `${formatCurrency(row.rateAmount || 0)} / jam` : getPayrollCalculationLabel(row.calculationUnit) })
    if (row.autoDetectOvertime) warnings.push({ label: "Auto Lembur", value: getPayrollDayTypeLabel(row.dayType) })
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
      { label: "Unit Hitung", value: getPayrollCalculationLabel(row.calculationUnit) },
      { label: "Rate", value: row.calculationUnit === "hour" ? `${formatCurrency(row.rateAmount || 0)} / jam` : formatCurrency(row.rateAmount || 0) },
      { label: "Tipe Hari", value: getPayrollDayTypeLabel(row.dayType) },
      { label: "Auto Detect Lembur", value: row.autoDetectOvertime ? "Aktif" : "Tidak" },
      { label: "Perlu Approval", value: row.requiresApproval ? "Ya" : "Tidak" },
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

function getPayrollCalculationLabel(unit?: string) {
  if (unit === "hour") return "Per jam"
  if (unit === "day") return "Per hari"
  return "Nominal tetap"
}

function getPayrollDayTypeLabel(dayType?: string) {
  if (dayType === "weekday") return "Weekday"
  if (dayType === "sunday") return "Minggu"
  if (dayType === "holiday") return "Hari Libur"
  return "Semua Hari"
}

function getMasterDetail(row: MasterDataRow) {
  if (row.categoryId === "roles") return `Level ${row.level || 100}`
  if (row.categoryId === "positions") return row.description || "Belum ada deskripsi"
  if (row.categoryId === "shifts") return formatMasterTimeRange(row)
  if (row.categoryId === "locations") return `${row.radiusM || 100} meter`
  if (row.categoryId === "payroll-components") {
    if (row.calculationUnit === "hour") return `${getPayrollComponentLabel(row.componentType)} · ${formatCurrency(row.rateAmount || 0)}/jam`
    return `${getPayrollComponentLabel(row.componentType)} · ${getPayrollCalculationLabel(row.calculationUnit)}`
  }
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value)
}

function formatPayrollDate(value: string) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
}

function formatPayrollPeriod(row: AttendanceMonitorRow) {
  if (!row.periodStartedAt && !row.periodClosedAt) return "Cycle belum terbentuk"
  return `${formatPayrollDate(row.periodStartedAt)} - ${row.periodClosedAt ? formatPayrollDate(row.periodClosedAt) : "berjalan"}`
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

function InlinePageStats({ items }: { items: ReactNode[] }) {
  return (
    <div className="inlinePageStats" aria-label="Ringkasan data">
      {items.map((item, index) => (
        <span key={index}>{item}</span>
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

function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  const tone: Record<PayrollStatus, "valid" | "pending" | "failed" | "missing"> = {
    active: "missing",
    ready: "pending",
    locked: "pending",
    paid: "valid",
    void: "failed",
  }

  return <UiStatusBadge tone={tone[status]}>{payrollLabel[status]}</UiStatusBadge>
}

function EmailVerifiedBadge({ verifiedAt }: { verifiedAt: string }) {
  return (
    <UiStatusBadge tone={verifiedAt ? "valid" : "pending"}>
      {verifiedAt ? "Verified" : "Belum verified"}
    </UiStatusBadge>
  )
}

function ProgressRing({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(26, value))
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (safeValue / 26) * circumference
  return (
    <span className="cycleRing">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="cycleRingTrack" cx="20" cy="20" r={radius} />
        <circle
          className="cycleRingValue"
          cx="20"
          cy="20"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span>{safeValue}</span>
    </span>
  )
}

function calculateDistanceMeters(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
  const earthRadiusM = 6371000
  const toRad = (value: number) => (value * Math.PI) / 180
  const lat1 = toRad(fromLatitude)
  const lat2 = toRad(toLatitude)
  const deltaLat = toRad(toLatitude - fromLatitude)
  const deltaLon = toRad(toLongitude - fromLongitude)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(earthRadiusM * c)
}

function EmployeeIdentityCell({
  fullName,
  code,
  photoUrl,
  secondary,
}: {
  fullName: string
  code: string
  photoUrl?: string
  secondary?: ReactNode
}) {
  return (
    <span className="employeeTableIdentity">
      <span className="employeeMiniAvatar">
        {photoUrl ? <img src={photoUrl} alt="" /> : getProfileInitials(fullName || code)}
      </span>
      <TableText primary={fullName} secondary={secondary ?? code} />
    </span>
  )
}

function AttendanceTimelineCell({ row }: { row: AttendanceMonitorRow }) {
  const checkInTone = row.checkInStatus === "valid" ? "valid" : row.checkInStatus === "missing" ? "missing" : row.checkInStatus === "rejected" ? "failed" : "pending"
  const checkOutTone = row.checkOutAt ? row.checkOutStatus === "valid" ? "valid" : row.checkOutStatus === "rejected" ? "failed" : "pending" : "missing"
  const missingCheckout = isMissingCheckoutShift(row.checkInAt, row.checkOutAt, row.attendanceDate)
  const durationTone = row.checkOutAt ? "valid" : row.checkInAt ? missingCheckout ? "failed" : "pending" : "missing"
  const events = [
    {
      key: "check-in",
      label: "Masuk",
      value: row.checkInAt ? formatAttendanceTime(row.checkInAt) : "Belum",
      meta: row.checkInStatus === "missing" ? formatEmployeeDate(row.attendanceDate) : row.checkInStatus,
      tone: checkInTone,
    },
    {
      key: "check-out",
      label: "Pulang",
      value: row.checkOutAt ? formatAttendanceTime(row.checkOutAt) : "Belum",
      meta: row.checkOutStatus === "missing" ? "Menunggu" : row.checkOutStatus,
      tone: checkOutTone,
    },
    {
      key: "duration",
      label: "Jam kerja",
      value: row.workDurationLabel,
      meta: row.checkOutAt ? "Final" : row.checkInAt ? missingCheckout ? "Perlu koreksi HR" : "Sementara" : "Belum mulai",
      tone: durationTone,
    },
  ] as const

  return (
    <div className="attendanceTimelineCell">
      {events.map((event) => (
        <span className={clsx("attendanceTimelineStep", `tone-${event.tone}`)} key={event.key}>
          <span className="attendanceTimelineDot" aria-hidden="true" />
          <span className="attendanceTimelineCopy">
            <span>{event.label}</span>
            <strong>{event.value}</strong>
            <small>{event.meta}</small>
          </span>
        </span>
      ))}
    </div>
  )
}

function AttendanceValidationCell({ row }: { row: AttendanceMonitorRow }) {
  const gpsLabel = row.gpsStatus === "valid" ? "Dalam radius" : row.gpsStatus === "out_of_radius" ? "Luar radius" : "GPS kosong"
  const faceLabel = row.faceScore === null ? "-" : `${row.faceScore}%`
  const gpsTone = row.gpsStatus === "valid" ? "valid" : row.gpsStatus === "out_of_radius" ? "failed" : "missing"
  const faceTone = row.faceStatus === "verified" ? "valid" : row.faceStatus === "review" ? "pending" : row.faceStatus === "failed" ? "failed" : "missing"
  const distanceLabel = row.distanceM === null ? "Belum ada GPS" : `${row.distanceM}m dari radius ${row.radiusM || "-"}m`

  return (
    <div className="attendanceValidationCell">
      <span className={clsx("attendanceValidationLocation", `tone-${gpsTone}`)}>
        <span className="attendanceValidationIcon">
          <LocateFixed size={14} />
        </span>
        <span className="attendanceValidationCopy">
          <strong>{row.workLocationName || "-"}</strong>
          <small>{distanceLabel}</small>
        </span>
      </span>
      <span className="attendanceValidationMetrics">
        <span className={clsx("attendanceValidationMetric", `tone-${gpsTone}`)} title={`GPS: ${gpsLabel}`}>
          <AlertCircle size={13} />
          <span>{gpsLabel}</span>
        </span>
        <span className={clsx("attendanceValidationMetric", `tone-${faceTone}`)} title={`Face: ${faceLabel} ${row.faceStatus}`}>
          <ScanFace size={13} />
          <span>{faceLabel}</span>
        </span>
      </span>
    </div>
  )
}

function AttendanceDateFilter({
  value,
  mode,
  onChange,
}: {
  value: string
  mode: AttendanceDateMode
  onChange: (nextDate: string, nextMode: AttendanceDateMode) => void
}) {
  const [open, setOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(`${value || getLocalDateKey()}T00:00:00+07:00`))
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const todayDate = getLocalDateKey()
  const yesterdayDate = shiftDateKey(todayDate, -1)
  const activeLabel = getAttendanceDateFilterLabel(value, mode)
  const calendarDays = getCalendarMonthDays(calendarMonth)
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(calendarMonth)
  const presets: Array<{ mode: AttendanceDateMode; label: string; date?: string }> = [
    { mode: "today", label: "Hari ini", date: todayDate },
    { mode: "yesterday", label: "Kemarin", date: yesterdayDate },
    { mode: "last7", label: "7 hari sebelumnya" },
    { mode: "last30", label: "30 hari sebelumnya" },
    { mode: "day", label: "Per Hari" },
    { mode: "week", label: "Per Minggu" },
    { mode: "month", label: "Per Bulan" },
    { mode: "year", label: "Berdasarkan Tahun" },
    { mode: "all", label: "Semua Waktu" },
  ]

  useEffect(() => {
    setCalendarMonth(new Date(`${value || todayDate}T00:00:00+07:00`))
  }, [todayDate, value])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) setOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown)
    return () => window.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  const selectPreset = (preset: { mode: AttendanceDateMode; label: string; date?: string }) => {
    const nextDate = preset.date || value || todayDate
    onChange(nextDate, preset.mode)
    if (preset.date) setCalendarMonth(new Date(`${nextDate}T00:00:00+07:00`))
  }

  const moveMonth = (amount: number) => {
    setCalendarMonth((current) => {
      const next = new Date(current)
      next.setMonth(current.getMonth() + amount)
      return next
    })
  }

  return (
    <div className={clsx("attendanceDateFilter", open && "open")} ref={fieldRef}>
      <button
        className={clsx("attendanceDateTrigger", open && "active")}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarCheck2 size={18} />
        <span>{activeLabel}</span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="attendanceDatePopover">
          <aside className="attendanceDateSidebar">
            {presets.map((preset) => (
              <button
                className={clsx(mode === preset.mode && "active")}
                key={preset.mode}
                type="button"
                onClick={() => selectPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </aside>
          <section className="attendanceDateCalendar">
            <div className="attendanceDateCalendarHeader">
              <button type="button" onClick={() => moveMonth(-12)} aria-label="Tahun sebelumnya">«</button>
              <button type="button" onClick={() => moveMonth(-1)} aria-label="Bulan sebelumnya">‹</button>
              <strong>{monthLabel}</strong>
              <button type="button" onClick={() => moveMonth(1)} aria-label="Bulan berikutnya">›</button>
              <button type="button" onClick={() => moveMonth(12)} aria-label="Tahun berikutnya">»</button>
            </div>
            <div className="attendanceDateWeekdays">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="attendanceDateGrid">
              {calendarDays.map((day) => (
                <button
                  className={clsx(day.muted && "muted", day.key === todayDate && "today", day.key === value && "active")}
                  key={day.key}
                  type="button"
                  onClick={() => {
                    onChange(day.key, "day")
                    setCalendarMonth(day.date)
                  }}
                >
                  {day.date.getDate()}
                </button>
              ))}
            </div>
            <div className="attendanceDateFooter">
              <strong>{mode === "today" ? "Real-time (GMT+07)" : getAttendanceDateFilterLabel(value, mode)}</strong>
              <button type="button" onClick={() => setOpen(false)}>Tutup</button>
            </div>
          </section>
        </div>
      )}
    </div>
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

function formatShortId(value?: string | null, prefix = "ID") {
  if (!value) return "-"
  const cleanValue = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  if (!cleanValue) return "-"

  return `${prefix}-${cleanValue.slice(0, 8)}`
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

function readCachedAccessProfile(session: Session | null): AppAccessProfile | null {
  if (!session || typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(accessProfileCacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { cachedAt?: unknown; profile?: Partial<AppAccessProfile> }
    const cachedAt = Number(parsed.cachedAt || 0)
    const profile = parsed.profile

    if (!profile || profile.authUserId !== session.user.id) return null
    if (!cachedAt || Date.now() - cachedAt > accessProfileCacheMaxAgeMs) return null
    if (!profile.id || !profile.email || !Array.isArray(profile.permissions)) return null
    if (!profile.userCode) return null

    return {
      id: String(profile.id),
      userCode: String(profile.userCode || ""),
      authUserId: String(profile.authUserId),
      fullName: String(profile.fullName || profile.email),
      email: String(profile.email),
      roleId: String(profile.roleId || ""),
      roleName: String(profile.roleName || "Belum pilih role"),
      divisionId: String(profile.divisionId || ""),
      divisionName: String(profile.divisionName || "Belum pilih divisi"),
      employeeId: String(profile.employeeId || ""),
      appScope: profile.appScope === "field" || profile.appScope === "both" ? profile.appScope : "management",
      status: mapAccessStatus(profile.status),
      permissions: profile.permissions.map(String),
      emailVerifiedAt: String(profile.emailVerifiedAt || ""),
      forcePasswordChange: profile.forcePasswordChange === true,
      twoFactorStatus: profile.twoFactorStatus === "enabled" || profile.twoFactorStatus === "disabled" ? profile.twoFactorStatus : "pending",
    }
  } catch {
    return null
  }
}

function writeCachedAccessProfile(profile: AppAccessProfile | null) {
  if (typeof window === "undefined") return

  try {
    if (!profile) {
      window.localStorage.removeItem(accessProfileCacheKey)
      return
    }

    window.localStorage.setItem(accessProfileCacheKey, JSON.stringify({
      cachedAt: Date.now(),
      profile,
    }))
  } catch {
    // Cache is only for startup UX; failing to write it must not block auth.
  }
}

async function loadAppAccessProfile(session: Session): Promise<AppAccessProfile | null> {
  const userEmail = session.user.email?.trim().toLowerCase()
  const columns = "id, user_code, auth_user_id, full_name, email, role_id, division_id, employee_id, app_scope, status, two_factor_status, email_verified_at, force_password_change"
  let row: Record<string, unknown> | null = null

  await invokeAppUsersFunction("claim_profile", {}).catch(() => {})

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

    if (row && !row.auth_user_id) row.auth_user_id = session.user.id
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
    userCode: String(row.user_code || ""),
    authUserId: String(row.auth_user_id || session.user.id),
    fullName: String(row.full_name || userEmail || "User DMS"),
    email: String(row.email || userEmail || ""),
    roleId,
    roleName: String(role.data?.name || "Belum pilih role"),
    divisionId,
    divisionName: String(division.data?.name || "Belum pilih divisi"),
    employeeId: row.employee_id ? String(row.employee_id) : "",
    appScope: row.app_scope === "field" || row.app_scope === "both" ? row.app_scope : "management",
    status: mapAccessStatus(row.status),
    permissions: (permissions.data || []).map((permission) => String(permission.permission_key)),
    emailVerifiedAt: row.email_verified_at ? String(row.email_verified_at) : "",
    forcePasswordChange: row.force_password_change === true,
    twoFactorStatus: row.two_factor_status === "enabled" || row.two_factor_status === "disabled" ? row.two_factor_status : "pending",
  }
}

function createEmptyUserForm(rows: UserAccessRow[] = []): UserAccessFormValues {
  return {
    userCode: generateNextUserCode(rows),
    fullName: "",
    email: "",
    roleId: "",
    divisionId: "",
    employeeId: "",
    appScope: "management",
    status: "invited",
    twoFactorStatus: "disabled",
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
  employeeMap: Map<string, UserEmployeeOption>,
): UserAccessRow {
  const roleId = row.role_id ? String(row.role_id) : ""
  const divisionId = row.division_id ? String(row.division_id) : ""
  const employeeId = row.employee_id ? String(row.employee_id) : ""

  return {
    id: String(row.id),
    userCode: String(row.user_code || ""),
    fullName: String(row.full_name || ""),
    email: String(row.email || ""),
    roleId,
    roleName: roleMap.get(roleId)?.name || "Belum pilih role",
    divisionId,
    divisionName: divisionMap.get(divisionId)?.name || "Belum pilih divisi",
    employeeId,
    employeeCode: employeeMap.get(employeeId)?.code || "",
    employeeName: employeeMap.get(employeeId)?.name || "Belum dikaitkan",
    appScope: row.app_scope === "field" || row.app_scope === "both" ? row.app_scope : "management",
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : "",
    invitedAt: row.invited_at ? String(row.invited_at) : "",
    passwordSetupSentAt: row.password_setup_sent_at ? String(row.password_setup_sent_at) : "",
    passwordResetSentAt: row.password_reset_sent_at ? String(row.password_reset_sent_at) : "",
    passwordManualSetAt: row.password_manual_set_at ? String(row.password_manual_set_at) : "",
    emailVerifiedAt: row.email_verified_at ? String(row.email_verified_at) : "",
    forcePasswordChange: row.force_password_change === true,
    twoFactorStatus: (row.two_factor_status === "enabled" || row.two_factor_status === "disabled") ? row.two_factor_status : "pending",
    status: (row.status === "active" || row.status === "locked") ? row.status : "invited",
    notes: String(row.notes || ""),
  }
}

async function loadUserAccessData() {
  const [users, roles, divisions, employeesResult] = await Promise.all([
    supabase.from("app_users").select("id, user_code, full_name, email, role_id, division_id, employee_id, app_scope, status, two_factor_status, last_login_at, invited_at, password_setup_sent_at, password_reset_sent_at, password_manual_set_at, email_verified_at, force_password_change, notes, created_at").order("created_at", { ascending: false }),
    supabase.from("roles").select("id, code, name, is_active, sort_order, level").order("sort_order", { ascending: true }).order("level", { ascending: true }),
    supabase.from("divisions").select("id, code, name, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("employees").select("id, employee_code, full_name, email, division_id, status, deleted_at").is("deleted_at", null).order("employee_code", { ascending: true }),
  ])
  const error = users.error || roles.error || divisions.error || employeesResult.error

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
  const employeeOptions = (employeesResult.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.employee_code || ""),
    name: String(row.full_name || ""),
    email: String(row.email || ""),
    divisionId: row.division_id ? String(row.division_id) : "",
    isActive: row.status === "active",
  }))
  const roleMap = new Map(roleOptions.map((role) => [role.id, role]))
  const divisionMap = new Map(divisionOptions.map((division) => [division.id, division]))
  const userRows = (users.data || []) as Array<Record<string, unknown>>
  const linkedEmployeeMap = new Map<string, { id: string; name: string; email: string }>()

  userRows.forEach((row) => {
    const employeeId = String(row.employee_id || "")
    if (!employeeId) return
    linkedEmployeeMap.set(employeeId, {
      id: String(row.id || ""),
      name: String(row.full_name || ""),
      email: String(row.email || ""),
    })
  })

  const employeeOptionsWithLinks = employeeOptions.map((employee) => {
    const linkedUser = linkedEmployeeMap.get(employee.id)

    return {
      ...employee,
      linkedUserId: linkedUser?.id || "",
      linkedUserName: linkedUser?.name || "",
      linkedUserEmail: linkedUser?.email || "",
    }
  })
  const employeeMap = new Map(employeeOptionsWithLinks.map((employee) => [employee.id, employee]))

  return {
    rows: userRows.map((row) => mapUserAccessRow(row, roleMap, divisionMap, employeeMap)),
    roles: roleOptions,
    divisions: divisionOptions,
    employees: employeeOptionsWithLinks,
  }
}

function createUserAccessPayload(values: UserAccessFormValues) {
  return {
    user_code: values.userCode.trim().toUpperCase(),
    full_name: values.fullName.trim(),
    email: values.email.trim().toLowerCase(),
    role_id: values.roleId || null,
    division_id: values.divisionId || null,
    employee_id: values.employeeId || null,
    app_scope: values.appScope,
    status: values.status,
    two_factor_status: "disabled",
    invited_at: values.status === "invited" ? new Date().toISOString() : null,
    notes: values.notes.trim() || null,
  }
}

function validateUserAccessForm(values: UserAccessFormValues, employees: UserEmployeeOption[] = [], currentUserId = "") {
  const errors: string[] = []
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
  const linkedEmployee = values.employeeId ? employees.find((employee) => employee.id === values.employeeId) : null

  if (!values.fullName.trim()) errors.push("Nama user wajib diisi.")
  if (!emailValid) errors.push("Email login wajib valid.")
  if (!values.roleId) errors.push("Role wajib dipilih dari Master Data.")
  if (!values.divisionId) errors.push("Divisi wajib dipilih dari Master Data.")
  if ((values.appScope === "field" || values.appScope === "both") && !values.employeeId) errors.push("User lapangan wajib dikaitkan ke data karyawan.")
  if (linkedEmployee?.linkedUserId && linkedEmployee.linkedUserId !== currentUserId) {
    errors.push(`${linkedEmployee.code} sudah terhubung ke user ${linkedEmployee.linkedUserName || linkedEmployee.linkedUserEmail}. Pilih karyawan lain atau edit user yang sudah ada.`)
  }

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

async function invokeRolePermissionsFunction(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("role-permissions", {
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

function hasPermission(profile: AppAccessProfile, permissionKey: string) {
  return profile.permissions.includes(permissionKey)
}

function buildPermissionMatrix(roles: RolePermissionRole[], permissions: PermissionDefinition[], records: RolePermissionRecord[]) {
  const matrix: Record<string, Record<string, boolean>> = {}

  roles.forEach((role) => {
    matrix[role.id] = {}
    permissions.forEach((permission) => {
      matrix[role.id][permission.key] = false
    })
  })

  records.forEach((record) => {
    if (!matrix[record.roleId]) matrix[record.roleId] = {}
    matrix[record.roleId][record.permissionKey] = record.enabled
  })

  return matrix
}

function clonePermissionMatrix(matrix: Record<string, Record<string, boolean>>) {
  return Object.fromEntries(
    Object.entries(matrix).map(([roleId, permissions]) => [roleId, { ...permissions }]),
  ) as Record<string, Record<string, boolean>>
}

function getRolePermissionSnapshot(roleId: string, matrix: Record<string, Record<string, boolean>>) {
  return Object.entries(matrix[roleId] || {})
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([permissionKey, enabled]) => `${permissionKey}:${enabled ? "1" : "0"}`)
    .join("|")
}

async function loadRolePermissionData(): Promise<RolePermissionData> {
  const [roles, permissions, rolePermissions, appUsers] = await Promise.all([
    supabase
      .from("roles")
      .select("id, code, name, description, level, is_system, is_active, sort_order")
      .order("sort_order", { ascending: true })
      .order("level", { ascending: true }),
    supabase
      .from("permissions")
      .select("key, label, group_name, description")
      .order("group_name", { ascending: true })
      .order("key", { ascending: true }),
    supabase
      .from("role_permissions")
      .select("role_id, permission_key, enabled"),
    supabase
      .from("app_users")
      .select("role_id, status"),
  ])
  const error = roles.error || permissions.error || rolePermissions.error || appUsers.error

  if (error) throw error

  const userCountByRole = new Map<string, number>()
  ;(appUsers.data || []).forEach((row) => {
    const roleId = String(row.role_id || "")
    if (!roleId || row.status === "locked") return
    userCountByRole.set(roleId, (userCountByRole.get(roleId) || 0) + 1)
  })

  const roleRows: RolePermissionRole[] = (roles.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    description: String(row.description || ""),
    level: Number(row.level || 100),
    isSystem: row.is_system === true,
    isActive: row.is_active !== false,
    userCount: userCountByRole.get(String(row.id)) || 0,
  }))
  const permissionRows: PermissionDefinition[] = (permissions.data || []).map((row) => ({
    key: String(row.key),
    label: String(row.label || row.key),
    group: String(row.group_name || "Sistem"),
    description: String(row.description || ""),
  }))
  const rolePermissionRows: RolePermissionRecord[] = (rolePermissions.data || []).map((row) => ({
    roleId: String(row.role_id),
    permissionKey: String(row.permission_key),
    enabled: row.enabled === true,
  }))

  return {
    roles: roleRows,
    permissions: permissionRows,
    matrix: buildPermissionMatrix(roleRows, permissionRows, rolePermissionRows),
  }
}

async function saveRolePermissionMatrix(role: RolePermissionRole, permissions: Record<string, boolean>) {
  await invokeRolePermissionsFunction("save_matrix", {
    roleId: role.id,
    permissions: Object.entries(permissions).map(([permissionKey, enabled]) => ({ permissionKey, enabled })),
  })
}

async function resetRolePermissionDefaults(role: RolePermissionRole) {
  await invokeRolePermissionsFunction("reset_defaults", { roleId: role.id })
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
      employeeId: values.employeeId,
      appScope: values.appScope,
      status: values.status,
      twoFactorStatus: "disabled",
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

async function setUserManualPassword(row: UserAccessRow, password: string) {
  if (useAppUsersFunction()) {
    await invokeAppUsersFunction("set_password", { id: row.id, password })
    return
  }

  throw new Error("Set password manual wajib memakai Edge Function.")
}

function validateManualPassword(password: string, confirmPassword: string) {
  const errors: string[] = []
  const weakPasswords = ["password", "password123", "admin123", "qwerty123", "dms12345", "12345678", "123456789", "letmein123"]

  if (password.length < 12) errors.push("Password minimal 12 karakter.")
  if (password && !/[a-z]/.test(password)) errors.push("Password wajib berisi huruf kecil.")
  if (password && !/[A-Z]/.test(password)) errors.push("Password wajib berisi huruf besar.")
  if (password && !/\d/.test(password)) errors.push("Password wajib berisi angka.")
  if (password && !/[^A-Za-z0-9]/.test(password)) errors.push("Password wajib berisi simbol.")
  if (weakPasswords.includes(password.toLowerCase())) errors.push("Password terlalu umum.")
  if (password !== confirmPassword) errors.push("Konfirmasi password belum sama.")

  return errors
}

function getManualPasswordScore(password: string) {
  return [
    password.length >= 12,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length
}

function generateSecurePassword(length = 16) {
  const groups = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%&*?"]
  const allCharacters = groups.join("")
  const randomValues = new Uint32Array(length)
  crypto.getRandomValues(randomValues)

  const requiredCharacters = groups.map((group, index) => group[randomValues[index] % group.length])
  const remainingCharacters = Array.from({ length: length - requiredCharacters.length }, (_, index) => {
    const value = randomValues[index + requiredCharacters.length]
    return allCharacters[value % allCharacters.length]
  })
  const password = [...requiredCharacters, ...remainingCharacters]

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomValues[index] % (index + 1)
    ;[password[index], password[swapIndex]] = [password[swapIndex], password[index]]
  }

  return password.join("")
}

function exportUserAccessCsv(rows: UserAccessRow[]) {
  const header = ["No", "Kode", "Nama", "Email", "Email Verified", "Role", "Divisi", "Karyawan Terkait", "Scope App", "Last Login", "Status"]
  const body = rows.map((row, index) => [
    index + 1,
    row.userCode,
    row.fullName,
    row.email,
    row.emailVerifiedAt ? "Verified" : "Belum verified",
    row.roleName,
    row.divisionName,
    row.employeeCode ? `${row.employeeCode} - ${row.employeeName}` : "",
    appScopeLabel[row.appScope],
    formatUserDateTime(row.lastLoginAt),
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

const employeeStatusLabel: Record<EmployeeStatus, string> = {
  active: "Aktif",
  review: "Review",
  inactive: "Nonaktif",
}

const employeeSalaryTypeLabel: Record<EmployeeSalaryType, string> = {
  daily: "Harian",
  monthly: "Bulanan",
}

const employeePayrollMethodLabel: Record<EmployeePayrollMethod, string> = {
  attendance_cycle: "Cycle 26 Hari",
  calendar_month: "Bulanan Kalender",
  custom: "Custom",
}

const maxEmployeeDailySalary = 5000000
const maxEmployeeMonthlySalary = 100000000
const maxEmployeePhotoSize = 2 * 1024 * 1024
const employeePhotoBucket = "employee-photos"
const attendanceFaceBucket = "attendance-faces"
const employeeFaceBucket = "employee-face-profiles"
const employeePhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"]
const employeeFaceStatusLabel: Record<EmployeeFaceProfileStatus, string> = {
  unenrolled: "Belum daftar",
  pending_review: "Menunggu review",
  approved: "Approved",
  rejected: "Rejected",
  disabled: "Nonaktif",
}

function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const tone: Record<EmployeeStatus, "valid" | "pending" | "failed"> = {
    active: "valid",
    review: "pending",
    inactive: "failed",
  }

  return <UiStatusBadge tone={tone[status]}>{employeeStatusLabel[status]}</UiStatusBadge>
}

function EmployeeFaceProfileBadge({ status }: { status: EmployeeFaceProfileStatus }) {
  const tone: Record<EmployeeFaceProfileStatus, "valid" | "pending" | "failed" | "missing"> = {
    approved: "valid",
    pending_review: "pending",
    rejected: "failed",
    unenrolled: "missing",
    disabled: "missing",
  }

  return <UiStatusBadge tone={tone[status]}>{employeeFaceStatusLabel[status]}</UiStatusBadge>
}

function formatEmployeeDate(value?: string | null) {
  if (!value) return "Belum diisi"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}

function generateNextEmployeeCode(rows: EmployeeDirectoryRow[]) {
  const maxNumber = rows.reduce((max, row) => {
    const number = Number(row.employeeCode.replace(/\D/g, ""))
    return Number.isFinite(number) ? Math.max(max, number) : max
  }, 0)

  return `EMP-${String(maxNumber + 1).padStart(3, "0")}`
}

async function getNextEmployeeCode(rows: EmployeeDirectoryRow[]) {
  const { data, error } = await supabase.rpc("get_next_employee_code")

  if (error || !data) return generateNextEmployeeCode(rows)
  return String(data)
}

function getEmployeeSalaryAmount(row: EmployeeDirectoryRow) {
  return row.salaryType === "monthly" ? row.monthlySalary : row.dailySalary
}

function getEmployeePhotoPublicUrl(path: string) {
  if (!path) return ""
  const { data } = supabase.storage.from(employeePhotoBucket).getPublicUrl(path)
  return data.publicUrl || ""
}

function getAttendanceFacePublicUrl(path: string) {
  if (!path) return ""
  const { data } = supabase.storage.from(attendanceFaceBucket).getPublicUrl(path)
  return data.publicUrl || ""
}

async function getEmployeeFaceSignedUrl(path: string) {
  if (!path) return ""
  const { data, error } = await supabase.storage.from(employeeFaceBucket).createSignedUrl(path, 60 * 60)

  if (error) return ""
  return data.signedUrl || ""
}

function buildAttendanceMapsUrl(row: AttendanceReviewRow) {
  if (!row.latitude || !row.longitude) return ""
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.latitude},${row.longitude}`)}`
}

function buildEmployeePhotoPath(employeeCode: string) {
  const safeCode = employeeCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-") || "EMPLOYEE"
  return `employees/${safeCode}/profile`
}

function createEmptyEmployeeForm(rows: EmployeeDirectoryRow[] = []): EmployeeFormValues {
  const employeeCode = generateNextEmployeeCode(rows)

  return {
    employeeCode,
    fullName: "",
    photoPath: "",
    photoUrl: "",
    photoFile: null,
    removePhoto: false,
    nik: "",
    phone: "",
    email: "",
    divisionId: "",
    positionId: "",
    workLocationId: "",
    shiftId: "",
    salaryType: "daily",
    dailySalary: "150000",
    monthlySalary: "0",
    payrollMethod: "attendance_cycle",
    prorateEnabled: true,
    qrToken: generateEmployeeQrToken(employeeCode),
    rfidUid: "",
    attendancePolicyId: "",
    kioskAccessEnabled: true,
    kioskSchemaReady: true,
    joinDate: new Date().toISOString().slice(0, 10),
    payrollCycleDays: "0",
    status: "active",
    notes: "",
  }
}

function generateEmployeeQrToken(employeeCode: string) {
  const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `DMS-${employeeCode.trim().toUpperCase() || "EMP"}-${randomPart}`
}

function buildLocationKioskOptions(locations: any[] | null | undefined, policies: any[] | null | undefined): AttendanceKioskOption[] {
  const activePolicies = (policies || []).filter((policy: any) => String(policy.status || "active") === "active")
  const defaultPolicy = activePolicies[0] || (policies || [])[0]
  const allowedMedia = Array.isArray(defaultPolicy?.allowed_media) ? defaultPolicy.allowed_media.map(String) : ["barcode", "rfid"]

  return (locations || []).map((location: any) => {
    const locationId = String(location.id || "")
    const locationName = String(location.name || "Lokasi kerja")

    return {
      id: `location:${locationId}`,
      kioskCode: `LOC-${locationId.slice(0, 8).toUpperCase()}`,
      name: locationName,
      source: "location",
      workLocationId: locationId,
      workLocationName: locationName,
      policyId: String(defaultPolicy?.id || ""),
      policyName: String(defaultPolicy?.name || "Barcode / RFID"),
      allowedMedia,
      requireFace: Boolean(defaultPolicy?.require_face),
      requireLocation: true,
      status: "active",
    }
  })
}

async function loadAttendanceKiosks(): Promise<AttendanceKioskOption[]> {
  const [{ data: kiosks, error: kioskError }, { data: locations, error: locationError }, { data: policies, error: policyError }] = await Promise.all([
    supabase
      .from("attendance_kiosks")
      .select("id,kiosk_code,name,work_location_id,policy_id,status")
      .order("name", { ascending: true }),
    supabase
      .from("work_locations")
      .select("id,name")
      .order("name", { ascending: true }),
    supabase
      .from("attendance_policies")
      .select("id,code,name,require_face,require_location,allowed_media,status")
      .order("name", { ascending: true }),
  ])

  if (locationError) throw locationError
  if (policyError && !isMissingKioskEmployeeSchema(policyError)) throw policyError
  const locationFallbackOptions = buildLocationKioskOptions(locations, policyError ? [] : policies)

  if (kioskError) {
    if (isMissingKioskEmployeeSchema(kioskError)) return locationFallbackOptions
    throw kioskError
  }

  const locationMap = new Map((locations || []).map((location: any) => [String(location.id), String(location.name || "Lokasi kerja")]))
  const policyMap = new Map((policies || []).map((policy: any) => [String(policy.id), policy]))

  const kioskOptions = (kiosks || []).map((kiosk: any) => {
    const policy = policyMap.get(String(kiosk.policy_id || ""))
    const allowedMedia = Array.isArray(policy?.allowed_media) ? policy.allowed_media.map(String) : ["barcode", "rfid"]

    return {
      id: String(kiosk.id || ""),
      kioskCode: String(kiosk.kiosk_code || ""),
      name: String(kiosk.name || kiosk.kiosk_code || "Kiosk Absensi"),
      source: "kiosk" as const,
      workLocationId: String(kiosk.work_location_id || ""),
      workLocationName: locationMap.get(String(kiosk.work_location_id || "")) || "Lokasi belum dipilih",
      policyId: String(kiosk.policy_id || ""),
      policyName: String(policy?.name || "Multi Method"),
      allowedMedia,
      requireFace: Boolean(policy?.require_face),
      requireLocation: Boolean(policy?.require_location),
      status: String(kiosk.status || "active"),
    }
  })

  return kioskOptions.length ? kioskOptions : locationFallbackOptions
}

const code128Patterns = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]

function getCode128Segments(value: string) {
  const safeValue = value.replace(/[^\x20-\x7E]/g, "").slice(0, 64)
  const codes = [104, ...safeValue.split("").map((character) => character.charCodeAt(0) - 32)]
  const checksum = codes.reduce((total, code, index) => total + (index === 0 ? code : code * index), 0) % 103
  const sequence = [...codes, checksum, 106]
  let x = 0
  const bars: Array<{ x: number; width: number }> = []

  sequence.forEach((code) => {
    const pattern = code128Patterns[code] || code128Patterns[0]
    pattern.split("").forEach((widthText, index) => {
      const width = Number(widthText)
      if (index % 2 === 0) bars.push({ x, width })
      x += width
    })
  })

  return { bars, width: x, value: safeValue }
}

function Code128Barcode({ value, className = "" }: { value: string; className?: string }) {
  const barcode = getCode128Segments(value || "DMS")
  return (
    <svg className={className} viewBox={`0 0 ${barcode.width} 48`} role="img" aria-label={`Barcode ${barcode.value}`} preserveAspectRatio="none">
      <rect width={barcode.width} height="48" fill="#ffffff" />
      {barcode.bars.map((bar, index) => (
        <rect key={`${bar.x}-${index}`} x={bar.x} y="0" width={bar.width} height="48" fill="#071332" />
      ))}
    </svg>
  )
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function normalizeIntegerInput(value: string, maxValue?: number) {
  const digits = value.replace(/\D/g, "")
  if (!digits) return ""
  const number = Number(digits)

  if (!Number.isFinite(number)) return ""
  return String(maxValue === undefined ? number : Math.min(number, maxValue))
}

function formatIntegerInput(value: string) {
  const digits = value.replace(/\D/g, "")
  if (!digits) return ""
  return new Intl.NumberFormat("id-ID").format(Number(digits))
}

function normalizeEmployeeDailySalary(value: string) {
  return normalizeIntegerInput(value, maxEmployeeDailySalary)
}

function normalizeEmployeeMonthlySalary(value: string) {
  return normalizeIntegerInput(value, maxEmployeeMonthlySalary)
}

function normalizeEmployeeCycle(value: string) {
  return normalizeIntegerInput(value, 26)
}

function mapEmployeeStatus(status: unknown): EmployeeStatus {
  if (status === "review" || status === "inactive") return status
  return "active"
}

function mapEmployeeFaceProfileStatus(status: unknown): EmployeeFaceProfileStatus {
  if (status === "approved" || status === "pending_review" || status === "rejected" || status === "disabled") return status
  if (status === "enrolled") return "approved"
  if (status === "review") return "pending_review"
  return "unenrolled"
}

function mapEmployeeSalaryType(value: unknown): EmployeeSalaryType {
  if (value === "monthly") return "monthly"
  return "daily"
}

function mapEmployeePayrollMethod(value: unknown): EmployeePayrollMethod {
  if (value === "calendar_month" || value === "custom") return value
  return "attendance_cycle"
}

function isMissingKioskEmployeeSchema(error: unknown) {
  const errorObject = error && typeof error === "object" ? error as { message?: unknown; details?: unknown; hint?: unknown } : null
  const message = `${String(errorObject?.message || "")} ${String(errorObject?.details || "")} ${String(errorObject?.hint || "")}`.toLowerCase()

  const optionalKioskSchemaHints = [
    "qr_token",
    "rfid_uid",
    "attendance_policy_id",
    "kiosk_access_enabled",
    "last_card_issued_at",
    "attendance_policies",
    "attendance_kiosks",
    "schema cache",
    "relationship",
  ]

  return optionalKioskSchemaHints.some((hint) => message.includes(hint))
}

function isMissingBiofingerSchema(error: unknown) {
  const errorObject = error && typeof error === "object" ? error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } : null
  const message = `${String(errorObject?.code || "")} ${String(errorObject?.message || "")} ${String(errorObject?.details || "")} ${String(errorObject?.hint || "")}`.toLowerCase()
  const schemaHints = [
    "attendance_devices",
    "employee_attendance_device_links",
    "biofinger_attendance_events",
    "biofinger_event_id",
    "attendance_device_id",
    "schema cache",
    "relation",
  ]

  return schemaHints.some((hint) => message.includes(hint))
}

function mapBiofingerLinkStatus(value: unknown): BiofingerLinkStatus {
  if (value === "active" || value === "ignored" || value === "inactive") return value
  return "pending"
}

function mapBiofingerImportStatus(value: unknown): BiofingerImportStatus {
  if (value === "mapped" || value === "converted" || value === "ignored" || value === "error") return value
  return "pending"
}

function mapBiofingerEventType(value: unknown): "check_in" | "check_out" | "unknown" {
  if (value === "check_in" || value === "check_out") return value
  return "unknown"
}

function formatBiofingerEventType(value: BiofingerEventRow["normalizedEventType"]) {
  if (value === "check_in") return "Masuk"
  if (value === "check_out") return "Pulang"
  return "Unknown"
}

function BiofingerEventText({ type }: { type: BiofingerEventRow["normalizedEventType"] }) {
  return <span className={clsx("biofingerEventText", type)}>{formatBiofingerEventType(type)}</span>
}

function BiofingerDeviceStatusText({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase()
  const tone = normalized === "active" ? "active" : normalized === "maintenance" ? "maintenance" : normalized === "inactive" ? "inactive" : "neutral"
  return <span className={clsx("biofingerDeviceStatusText", tone)}>{status || "unknown"}</span>
}

function BiofingerLinkStatusText({ status }: { status: BiofingerLinkStatus }) {
  return <span className={clsx("biofingerLinkStatusText", status)}>{status}</span>
}

function BiofingerEmployeeMappingChip({
  row,
  disabled,
  onClick,
}: {
  row: BiofingerUserLinkRow
  disabled: boolean
  onClick: () => void
}) {
  const mapped = Boolean(row.employeeId)

  return (
    <button className={clsx("biofingerMappingChip", mapped && "mapped")} type="button" disabled={disabled} data-row-action="true" onClick={onClick}>
      <span className="biofingerMappingChipIcon">{mapped ? <UserRoundCheck size={15} /> : <UserPlus size={15} />}</span>
      <span className="biofingerMappingChipCopy">
        <strong>{mapped ? row.employeeName || "Karyawan dipilih" : "Belum mapped"}</strong>
        <small>{mapped ? row.employeeCode || "Mapped manual" : `Klik untuk mapping User ID ${row.externalUserId}`}</small>
      </span>
    </button>
  )
}

async function loadBiofingerData(): Promise<BiofingerData> {
  const [devicesResult, linksResult, eventsResult, employeesResult, workLocationsResult] = await Promise.all([
    supabase
      .from("attendance_devices")
      .select("id, device_code, name, vendor, model, serial_number, mac_address, ip_address, port, work_location_id, status, last_seen_at, last_sync_at, sync_cursor_at, notes")
      .order("name", { ascending: true }),
    supabase
      .from("employee_attendance_device_links")
      .select("id, employee_id, attendance_device_id, external_user_id, external_uid, external_name, privilege, status, matched_by, last_seen_at, last_synced_at, notes")
      .order("external_user_id", { ascending: true }),
    supabase
      .from("biofinger_attendance_events")
      .select("id, attendance_device_id, external_user_id, employee_id, device_event_at, attendance_date, punch, status_code, normalized_event_type, import_status, source_hash", { count: "exact" })
      .order("device_event_at", { ascending: false })
      .limit(200),
    supabase
      .from("employees")
      .select("id, employee_code, full_name, status")
      .is("deleted_at", null)
      .order("employee_code", { ascending: true }),
    supabase
      .from("work_locations")
      .select("id, code, name, is_active")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ])

  const biofingerSchemaError = devicesResult.error || linksResult.error || eventsResult.error
  if (biofingerSchemaError) {
    if (isMissingBiofingerSchema(biofingerSchemaError)) {
      return { schemaReady: false, devices: [], links: [], events: [], eventCount: 0, employees: [], workLocations: [] }
    }
    throw biofingerSchemaError
  }
  if (employeesResult.error) throw employeesResult.error
  if (workLocationsResult.error) throw workLocationsResult.error

  const employees = (employeesResult.data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id || ""),
    employeeCode: String(row.employee_code || ""),
    fullName: String(row.full_name || ""),
    status: mapEmployeeStatus(row.status),
  }))
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]))
  const workLocations = (workLocationsResult.data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id || ""),
    code: String(row.code || ""),
    name: String(row.name || ""),
    isActive: row.is_active !== false,
  }))
  const workLocationMap = new Map(workLocations.map((location) => [location.id, location]))

  const devices = (devicesResult.data || []).map((row: Record<string, unknown>) => ({
    workLocationId: String(row.work_location_id || ""),
    workLocationName: workLocationMap.get(String(row.work_location_id || ""))?.name || "",
    id: String(row.id || ""),
    deviceCode: String(row.device_code || ""),
    name: String(row.name || row.device_code || "Biofinger"),
    vendor: String(row.vendor || "Biofinger"),
    model: String(row.model || ""),
    serialNumber: String(row.serial_number || ""),
    macAddress: String(row.mac_address || ""),
    ipAddress: String(row.ip_address || ""),
    port: Number(row.port || 4370),
    status: String(row.status || "active"),
    lastSeenAt: String(row.last_seen_at || ""),
    lastSyncAt: String(row.last_sync_at || ""),
    syncCursorAt: String(row.sync_cursor_at || ""),
    notes: String(row.notes || ""),
  }))

  const links = (linksResult.data || []).map((row: Record<string, unknown>) => {
    const employeeId = row.employee_id ? String(row.employee_id) : ""
    const employee = employeeMap.get(employeeId)

    return {
      id: String(row.id || ""),
      attendanceDeviceId: String(row.attendance_device_id || ""),
      employeeId,
      employeeCode: employee?.employeeCode || "",
      employeeName: employee?.fullName || "",
      externalUserId: String(row.external_user_id || ""),
      externalUid: row.external_uid === null || row.external_uid === undefined ? null : Number(row.external_uid),
      externalName: String(row.external_name || ""),
      privilege: row.privilege === null || row.privilege === undefined ? null : Number(row.privilege),
      status: mapBiofingerLinkStatus(row.status),
      matchedBy: String(row.matched_by || "manual"),
      lastSeenAt: String(row.last_seen_at || ""),
      lastSyncedAt: String(row.last_synced_at || ""),
      notes: String(row.notes || ""),
    }
  })

  const events = (eventsResult.data || []).map((row: Record<string, unknown>) => {
    const employeeId = row.employee_id ? String(row.employee_id) : ""
    const employee = employeeMap.get(employeeId)

    return {
      id: String(row.id || ""),
      attendanceDeviceId: String(row.attendance_device_id || ""),
      externalUserId: String(row.external_user_id || ""),
      employeeId,
      employeeCode: employee?.employeeCode || "",
      employeeName: employee?.fullName || "",
      deviceEventAt: String(row.device_event_at || ""),
      attendanceDate: String(row.attendance_date || ""),
      punch: row.punch === null || row.punch === undefined ? null : Number(row.punch),
      statusCode: row.status_code === null || row.status_code === undefined ? null : Number(row.status_code),
      normalizedEventType: mapBiofingerEventType(row.normalized_event_type),
      importStatus: mapBiofingerImportStatus(row.import_status),
      sourceHash: String(row.source_hash || ""),
    }
  })

  return { schemaReady: true, devices, links, events, eventCount: eventsResult.count ?? events.length, employees, workLocations }
}

async function updateBiofingerUserLink(row: BiofingerUserLinkRow, employeeId: string, status?: BiofingerLinkStatus) {
  const nextStatus = status || (employeeId ? "active" : "pending")
  if (nextStatus === "active" && !employeeId) {
    throw new Error("Pilih karyawan DMS sebelum mengaktifkan mapping Biofinger.")
  }

  const { error } = await supabase
    .from("employee_attendance_device_links")
    .update({
      employee_id: employeeId || null,
      status: nextStatus,
      matched_by: "manual",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  if (error) throw error

  const eventPayload = nextStatus === "active"
    ? { employee_id: employeeId, import_status: "mapped", updated_at: new Date().toISOString() }
    : { employee_id: null, import_status: nextStatus === "ignored" ? "ignored" : "pending", updated_at: new Date().toISOString() }

  const eventUpdate = await supabase
    .from("biofinger_attendance_events")
    .update(eventPayload)
    .eq("attendance_device_id", row.attendanceDeviceId)
    .eq("external_user_id", row.externalUserId)
    .in("import_status", ["pending", "mapped", "ignored"])

  if (eventUpdate.error) throw eventUpdate.error
}

async function updateBiofingerDeviceRegistry(deviceId: string, values: { name: string; workLocationId: string; status: string }) {
  const name = values.name.trim()
  if (!name) {
    throw new Error("Nama display device wajib diisi.")
  }

  const { error } = await supabase
    .from("attendance_devices")
    .update({
      name,
      work_location_id: values.workLocationId || null,
      status: values.status || "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", deviceId)

  if (error) throw error
}

function mapEmployeeRow(
  row: Record<string, unknown>,
  divisionMap: Map<string, EmployeeOption>,
  positionMap: Map<string, EmployeeOption>,
  locationMap: Map<string, EmployeeOption>,
  shiftMap: Map<string, EmployeeOption>,
  policyMap = new Map<string, AttendancePolicyOption>(),
  faceProfileMap = new Map<string, Record<string, unknown>>(),
  faceUrlMap = new Map<string, string>(),
): EmployeeDirectoryRow {
  const divisionId = row.division_id ? String(row.division_id) : ""
  const positionId = row.position_id ? String(row.position_id) : ""
  const workLocationId = row.work_location_id ? String(row.work_location_id) : ""
  const shiftId = row.shift_id ? String(row.shift_id) : ""
  const attendancePolicyId = row.attendance_policy_id ? String(row.attendance_policy_id) : ""
  const faceProfile = faceProfileMap.get(String(row.id))
  const referenceImagePath = String(faceProfile?.reference_image_path || "")

  return {
    id: String(row.id),
    employeeCode: String(row.employee_code || ""),
    fullName: String(row.full_name || ""),
    photoPath: String(row.photo_path || ""),
    photoUrl: getEmployeePhotoPublicUrl(String(row.photo_path || "")),
    nik: String(row.nik || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    divisionId,
    divisionName: divisionMap.get(divisionId)?.name || "Belum pilih divisi",
    positionId,
    positionName: positionMap.get(positionId)?.name || "Belum pilih jabatan",
    workLocationId,
    workLocationName: locationMap.get(workLocationId)?.name || "Belum pilih lokasi",
    shiftId,
    shiftName: shiftMap.get(shiftId)?.name || "Belum pilih shift",
    salaryType: mapEmployeeSalaryType(row.salary_type),
    dailySalary: Number(row.daily_salary || 0),
    monthlySalary: Number(row.monthly_salary || 0),
    payrollMethod: mapEmployeePayrollMethod(row.payroll_method),
    prorateEnabled: row.prorate_enabled !== false,
    qrToken: String(row.qr_token || ""),
    rfidUid: String(row.rfid_uid || ""),
    attendancePolicyId,
    attendancePolicyName: policyMap.get(attendancePolicyId)?.name || "Multi Method",
    kioskAccessEnabled: row.kiosk_access_enabled !== false,
    lastCardIssuedAt: row.last_card_issued_at ? String(row.last_card_issued_at) : "",
    joinDate: row.join_date ? String(row.join_date) : "",
    payrollCycleDays: Number(row.payroll_cycle_days || 0),
    status: mapEmployeeStatus(row.status),
    faceProfileId: String(faceProfile?.id || ""),
    faceProfileStatus: mapEmployeeFaceProfileStatus(faceProfile?.status),
    faceProfileThreshold: Number(faceProfile?.face_score_threshold || 85),
    faceProfileRequired: faceProfile?.verification_required !== false,
    faceReferenceImagePath: referenceImagePath,
    faceReferenceImageUrl: referenceImagePath ? faceUrlMap.get(referenceImagePath) || "" : "",
    faceProfileSubmittedAt: String(faceProfile?.submitted_at || ""),
    faceProfileReviewedAt: String(faceProfile?.reviewed_at || ""),
    faceProfileReviewNotes: String(faceProfile?.review_notes || ""),
    notes: String(row.notes || ""),
    deletedAt: row.deleted_at ? String(row.deleted_at) : "",
  }
}

async function loadEmployeeData() {
  const baseEmployeeSelect = "id, employee_code, full_name, photo_path, nik, phone, email, division_id, position_id, work_location_id, shift_id, salary_type, daily_salary, monthly_salary, payroll_method, prorate_enabled, join_date, payroll_cycle_days, status, notes, deleted_at, created_at"
  const kioskEmployeeSelect = `${baseEmployeeSelect}, qr_token, rfid_uid, attendance_policy_id, kiosk_access_enabled, last_card_issued_at`
  const employeeQuery = supabase.from("employees").select(kioskEmployeeSelect).order("employee_code", { ascending: true })
  const [initialEmployeesResult, divisions, positions, locations, shifts, faceProfiles, policies] = await Promise.all([
    employeeQuery,
    supabase.from("divisions").select("id, code, name, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("positions").select("id, code, name, division_id, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("work_locations").select("id, code, name, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("shifts").select("id, code, name, is_active, sort_order").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase.from("employee_face_profiles").select("id, employee_id, status, verification_required, face_score_threshold, reference_image_path, submitted_at, reviewed_at, review_notes"),
    supabase.from("attendance_policies").select("id, code, name, allowed_media, require_face, require_location, status").order("code", { ascending: true }),
  ])
  const kioskSchemaReady = !initialEmployeesResult.error || !isMissingKioskEmployeeSchema(initialEmployeesResult.error)
  const employeesResult = kioskSchemaReady
    ? initialEmployeesResult
    : await supabase.from("employees").select(baseEmployeeSelect).order("employee_code", { ascending: true })
  const error = employeesResult.error || divisions.error || positions.error || locations.error || shifts.error || faceProfiles.error

  if (error) throw error

  const divisionOptions = (divisions.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    isActive: row.is_active !== false,
  }))
  const positionOptions = (positions.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    divisionId: row.division_id ? String(row.division_id) : "",
    isActive: row.is_active !== false,
  }))
  const locationOptions = (locations.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    isActive: row.is_active !== false,
  }))
  const shiftOptions = (shifts.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    isActive: row.is_active !== false,
  }))
  const policyOptions = policies.error ? [] : (policies.data || []).map((row) => ({
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    allowedMedia: Array.isArray(row.allowed_media) ? row.allowed_media.map((item) => String(item)) : [],
    requireFace: row.require_face === true,
    requireLocation: row.require_location !== false,
    isActive: row.status !== "inactive",
  }))
  const divisionMap = new Map(divisionOptions.map((item) => [item.id, item]))
  const positionMap = new Map(positionOptions.map((item) => [item.id, item]))
  const locationMap = new Map(locationOptions.map((item) => [item.id, item]))
  const shiftMap = new Map(shiftOptions.map((item) => [item.id, item]))
  const policyMap = new Map(policyOptions.map((item) => [item.id, item]))
  const faceProfileMap = new Map(((faceProfiles.data || []) as Array<Record<string, unknown>>).map((row) => [String(row.employee_id || ""), row]))
  const faceReferencePaths = Array.from(new Set(((faceProfiles.data || []) as Array<Record<string, unknown>>).map((row) => String(row.reference_image_path || "")).filter(Boolean)))
  const faceUrlEntries = await Promise.all(faceReferencePaths.map(async (path) => [path, await getEmployeeFaceSignedUrl(path)] as const))
  const faceUrlMap = new Map(faceUrlEntries)

  return {
    rows: (employeesResult.data || []).map((row) => mapEmployeeRow(row, divisionMap, positionMap, locationMap, shiftMap, policyMap, faceProfileMap, faceUrlMap)),
    divisions: divisionOptions,
    positions: positionOptions,
    locations: locationOptions,
    shifts: shiftOptions,
    policies: policyOptions,
    kioskSchemaReady,
  }
}

function createEmployeePayload(values: EmployeeFormValues, photoPath = values.photoPath) {
  const payload: Record<string, unknown> = {
    employee_code: values.employeeCode.trim().toUpperCase(),
    full_name: values.fullName.trim(),
    photo_path: photoPath || null,
    nik: values.nik.trim() || null,
    phone: values.phone.trim() || null,
    email: values.email.trim().toLowerCase() || null,
    division_id: values.divisionId || null,
    position_id: values.positionId || null,
    work_location_id: values.workLocationId || null,
    shift_id: values.shiftId || null,
    salary_type: values.salaryType,
    daily_salary: Number(values.dailySalary || 0),
    monthly_salary: Number(values.monthlySalary || 0),
    payroll_method: values.payrollMethod,
    prorate_enabled: values.prorateEnabled,
    join_date: values.joinDate || null,
    payroll_cycle_days: Number(values.payrollCycleDays || 0),
    status: values.status,
    notes: values.notes.trim() || null,
  }

  if (values.kioskSchemaReady) {
    payload.qr_token = values.qrToken.trim().toUpperCase() || null
    payload.rfid_uid = values.rfidUid.trim() || null
    payload.attendance_policy_id = values.attendancePolicyId || null
    payload.kiosk_access_enabled = values.kioskAccessEnabled
  }

  return payload
}

function validateEmployeeForm(values: EmployeeFormValues) {
  const errors: string[] = []
  const dailySalary = Number(values.dailySalary)
  const monthlySalary = Number(values.monthlySalary)
  const payrollCycleDays = Number(values.payrollCycleDays)
  const emailValid = !values.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
  const photoFileValid = !values.photoFile || employeePhotoMimeTypes.includes(values.photoFile.type)
  const photoSizeValid = !values.photoFile || values.photoFile.size <= maxEmployeePhotoSize

  if (!values.fullName.trim()) errors.push("Nama karyawan wajib diisi.")
  if (!values.employeeCode.trim()) errors.push("Kode karyawan wajib tersedia otomatis.")
  if (!values.divisionId) errors.push("Divisi wajib dipilih dari Master Data.")
  if (!values.positionId) errors.push("Jabatan wajib dipilih dari Master Data.")
  if (!values.workLocationId) errors.push("Lokasi kerja wajib dipilih dari Master Data.")
  if (!values.shiftId) errors.push("Shift wajib dipilih dari Master Data.")
  if (!values.salaryType) errors.push("Tipe gaji wajib dipilih.")
  if (!values.payrollMethod) errors.push("Metode payroll wajib dipilih.")
  if (values.salaryType === "daily" && (!Number.isFinite(dailySalary) || dailySalary < 0)) errors.push("Gaji harian wajib angka 0 atau lebih.")
  if (values.salaryType === "daily" && Number.isFinite(dailySalary) && dailySalary > maxEmployeeDailySalary) errors.push(`Gaji harian maksimal ${formatCurrency(maxEmployeeDailySalary)}.`)
  if (values.salaryType === "monthly" && (!Number.isFinite(monthlySalary) || monthlySalary < 0)) errors.push("Gaji bulanan wajib angka 0 atau lebih.")
  if (values.salaryType === "monthly" && Number.isFinite(monthlySalary) && monthlySalary > maxEmployeeMonthlySalary) errors.push(`Gaji bulanan maksimal ${formatCurrency(maxEmployeeMonthlySalary)}.`)
  if (!Number.isFinite(payrollCycleDays) || payrollCycleDays < 0 || payrollCycleDays > 26) errors.push("Cycle payroll harus 0 sampai 26 hari.")
  if (!emailValid) errors.push("Email karyawan belum valid.")
  if (!photoFileValid) errors.push("Foto wajib JPG, PNG, atau WEBP.")
  if (!photoSizeValid) errors.push("Ukuran foto maksimal 2MB.")
  if (values.kioskSchemaReady && values.kioskAccessEnabled && !values.qrToken.trim() && !values.rfidUid.trim()) {
    errors.push("Akses kiosk aktif wajib punya token barcode/QR atau UID RFID.")
  }

  return errors
}

async function removeEmployeePhoto(path: string) {
  if (!path) return
  const { error } = await supabase.storage.from(employeePhotoBucket).remove([path])

  if (error) throw error
}

async function uploadEmployeePhoto(values: EmployeeFormValues) {
  if (!values.photoFile) return values.photoPath

  const path = buildEmployeePhotoPath(values.employeeCode)
  const { error } = await supabase.storage.from(employeePhotoBucket).upload(path, values.photoFile, {
    cacheControl: "3600",
    contentType: values.photoFile.type,
    upsert: true,
  })

  if (error) throw error
  return path
}

async function saveEmployee(values: EmployeeFormValues, editingRow?: EmployeeDirectoryRow | null) {
  const originalPhotoPath = editingRow?.photoPath || values.photoPath
  const nextPhotoPath = values.photoFile
    ? buildEmployeePhotoPath(values.employeeCode)
    : values.removePhoto
      ? ""
      : values.photoPath
  const payload = createEmployeePayload(values, nextPhotoPath)

  if (!editingRow) {
    let uploadedPath = ""

    try {
      if (values.photoFile) {
        uploadedPath = await uploadEmployeePhoto(values)
      }

      const { error } = await supabase.from("employees").insert(payload)

      if (error) throw error
    } catch (error) {
      if (uploadedPath) await removeEmployeePhoto(uploadedPath).catch(() => {})
      throw error
    }

    return
  }

  const { error } = await supabase.from("employees").update(payload).eq("id", editingRow.id)

  if (error) throw error

  try {
    if (values.photoFile) await uploadEmployeePhoto(values)
    if (values.removePhoto && originalPhotoPath) await removeEmployeePhoto(originalPhotoPath)
    if (values.photoFile && originalPhotoPath && originalPhotoPath !== nextPhotoPath) await removeEmployeePhoto(originalPhotoPath)
  } catch (photoError) {
    await supabase.from("employees").update({ photo_path: originalPhotoPath || null }).eq("id", editingRow.id)
    throw photoError
  }
}

async function updateEmployeeStatus(row: EmployeeDirectoryRow, status: EmployeeStatus) {
  const { error } = await supabase.from("employees").update({ status }).eq("id", row.id)

  if (error) throw error
}

async function deleteEmployee(row: EmployeeDirectoryRow) {
  const { error } = await supabase
    .from("employees")
    .update({
      status: "inactive",
      deleted_at: new Date().toISOString(),
      photo_path: null,
    })
    .eq("id", row.id)

  if (error) throw error

  if (row.photoPath) await removeEmployeePhoto(row.photoPath).catch(() => {})
}

async function restoreEmployee(row: EmployeeDirectoryRow) {
  const { error } = await supabase
    .from("employees")
    .update({
      status: "active",
      deleted_at: null,
    })
    .eq("id", row.id)

  if (error) throw error
}

function exportEmployeeCsv(rows: EmployeeDirectoryRow[]) {
  const header = ["No", "Kode", "Nama", "Foto Path", "NIK", "Phone", "Email", "Divisi", "Jabatan", "Lokasi", "Shift", "Tipe Gaji", "Gaji Harian", "Gaji Bulanan", "Metode Payroll", "Hitung Proporsional", "Tanggal Masuk", "Cycle", "Status", "Catatan"]
  const body = rows.map((row, index) => [
    index + 1,
    row.employeeCode,
    row.fullName,
    row.photoPath,
    row.nik,
    row.phone,
    row.email,
    row.divisionName,
    row.positionName,
    row.workLocationName,
    row.shiftName,
    employeeSalaryTypeLabel[row.salaryType],
    row.dailySalary,
    row.monthlySalary,
    employeePayrollMethodLabel[row.payrollMethod],
    row.prorateEnabled ? "Ya" : "Tidak",
    row.joinDate,
    row.payrollCycleDays,
    employeeStatusLabel[row.status],
    row.notes,
  ])
  const csv = [header, ...body]
    .map((columns) => columns.map((column) => `"${String(column).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `dms-karyawan-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function exportPayrollCsv(rows: AttendanceMonitorRow[]) {
  const header = ["No", "Kode", "Nama", "Divisi", "Lokasi", "Periode", "Cycle", "Tipe Gaji", "Gaji Pokok", "Lembur", "Total Payroll", "Status"]
  const body = rows.map((row, index) => [
    index + 1,
    row.employeeCode,
    row.fullName,
    row.divisionName,
    row.workLocationName,
    formatPayrollPeriod(row),
    `${row.cycleDays}/${row.targetDays}`,
    employeeSalaryTypeLabel[row.salaryType],
    row.basePayrollAmount,
    row.overtimeAmount,
    row.payrollAmount,
    payrollLabel[row.payrollStatus],
  ])
  const csv = [header, ...body]
    .map((columns) => columns.map((column) => `"${String(column).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `dms-payroll-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function shiftDateKey(value: string, offsetDays: number) {
  const base = value ? new Date(`${value}T00:00:00+07:00`) : new Date()
  base.setDate(base.getDate() + offsetDays)
  return getLocalDateKey(base)
}

function getAttendanceRecapRangeStart(value: string, range: AttendanceRecapRange) {
  if (range === "month") return shiftDateKey(value, -29)
  if (range === "week") return shiftDateKey(value, -6)
  return value
}

function getAttendanceDateRange(selectedDate: string, mode: AttendanceDateMode) {
  if (mode === "last7" || mode === "week") return { start: shiftDateKey(selectedDate, -6), end: selectedDate }
  if (mode === "last30" || mode === "month") return { start: shiftDateKey(selectedDate, -29), end: selectedDate }
  if (mode === "year") return { start: `${selectedDate.slice(0, 4)}-01-01`, end: selectedDate }
  if (mode === "all") return { start: "", end: selectedDate }
  return { start: selectedDate, end: selectedDate }
}

function getAttendanceDateFilterLabel(selectedDate: string, mode: AttendanceDateMode) {
  if (mode === "today") return "Hari ini"
  if (mode === "yesterday") return "Kemarin"
  if (mode === "last7") return "7 hari sebelumnya"
  if (mode === "last30") return "30 hari sebelumnya"
  if (mode === "day") return `Per hari · ${formatWorkDate(selectedDate)}`
  if (mode === "week") return `Per minggu · ${formatWorkDate(selectedDate)}`
  if (mode === "month") return `Per bulan · ${formatWorkDate(selectedDate)}`
  if (mode === "year") return `Tahun ${selectedDate.slice(0, 4)}`
  return "Semua waktu"
}

function getCalendarMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDate = new Date(year, month, 1)
  const startOffset = (firstDate.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - startOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return {
      date,
      key: getLocalDateKey(date),
      muted: date.getMonth() !== month,
    }
  })
}

function formatAttendanceTime(value?: string | null) {
  if (!value) return "Belum absen"
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value))
}

function formatAttendanceTimeInput(value?: string | null, fallback = "17:00") {
  if (!value) return fallback
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return fallback

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).format(date)
}

function addMinutesToIsoTimeInput(value: string, minutes: number, fallback = "17:00") {
  if (!value) return fallback
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return fallback
  date.setMinutes(date.getMinutes() + minutes)
  return formatAttendanceTimeInput(date.toISOString(), fallback)
}

function formatWorkDate(value?: string | null) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`))
}

function formatMinutesDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safeMinutes / 60)
  const restMinutes = safeMinutes % 60

  if (hours === 0) return `${restMinutes}m`
  if (restMinutes === 0) return `${hours}j`
  return `${hours}j ${restMinutes}m`
}

function getAttendanceDurationMinutes(checkInAt?: string | null, checkOutAt?: string | null) {
  if (!checkInAt) return null
  const startMs = new Date(checkInAt).getTime()
  const endMs = checkOutAt ? new Date(checkOutAt).getTime() : Date.now()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null
  return Math.round((endMs - startMs) / 60000)
}

const OPEN_SHIFT_LIMIT_MINUTES = 16 * 60

function isPastAttendanceDate(attendanceDate?: string | null) {
  return Boolean(attendanceDate && attendanceDate < getLocalDateKey())
}

function isMissingCheckoutShift(checkInAt?: string | null, checkOutAt?: string | null, attendanceDate?: string | null) {
  if (!checkInAt || checkOutAt) return false
  const minutes = getAttendanceDurationMinutes(checkInAt, null)
  if (minutes === null) return false
  return isPastAttendanceDate(attendanceDate) || minutes > OPEN_SHIFT_LIMIT_MINUTES
}

function formatAttendanceWorkDuration(checkInAt?: string | null, checkOutAt?: string | null, attendanceDate?: string | null) {
  const minutes = getAttendanceDurationMinutes(checkInAt, checkOutAt)
  if (minutes === null) return "Belum mulai"
  if (!checkOutAt && isMissingCheckoutShift(checkInAt, checkOutAt, attendanceDate)) return "Belum checkout"
  return checkOutAt ? formatMinutesDuration(minutes) : `Berjalan ${formatMinutesDuration(minutes)}`
}

function mapPayrollCycleStatus(status: unknown): PayrollStatus {
  if (status === "ready" || status === "locked" || status === "paid" || status === "void") return status
  return "active"
}

function getAttendanceMonitorStatus(row?: Record<string, unknown>): AttendanceStatus {
  if (!row) return "missing"
  if (row.status === "valid") return "valid"
  if (row.status === "rejected" || row.face_status === "failed") return "failed"
  return "pending"
}

function getDailyAttendanceMonitorStatus(checkIn?: Record<string, unknown>, checkOut?: Record<string, unknown>): AttendanceStatus {
  if (!checkIn) return "missing"
  if (checkIn.status === "rejected" || checkOut?.status === "rejected" || checkIn.face_status === "failed" || checkOut?.face_status === "failed") return "failed"
  if (checkIn.status === "review" || checkOut?.status === "review" || checkIn.gps_status === "out_of_radius" || checkOut?.gps_status === "out_of_radius" || checkIn.face_status === "review" || checkOut?.face_status === "review") return "pending"
  if (!checkOut) return "pending"
  return "valid"
}

function getAttendanceReviewIssue(row: Record<string, unknown>) {
  if (row.status === "rejected") return "Ditolak HR"
  if (row.gps_status === "out_of_radius") return "Di luar radius"
  if (row.gps_status === "missing") return "GPS kosong"
  if (row.face_status === "failed") return "Face failed"
  if (row.face_status === "review") return "Face review"
  if (row.status === "review") return "Review manual"
  return "Valid"
}

async function loadOperationsFoundationData(targetDate = getLocalDateKey()): Promise<OperationsFoundationData> {
  await supabase.rpc("refresh_all_employee_payroll_cycles")
  await supabase.rpc("detect_all_overtime_requests")
  await supabase.rpc("refresh_all_employee_payroll_cycles")

  const selectedDate = targetDate || getLocalDateKey()
  const [employeeResult, divisionResult, locationResult, attendanceResult, payrollResult, overtimeResult, payrollComponentResult] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_code, full_name, photo_path, division_id, work_location_id, salary_type, daily_salary, monthly_salary, payroll_cycle_days, status, deleted_at")
      .is("deleted_at", null)
      .order("employee_code", { ascending: true }),
    supabase.from("divisions").select("id, name"),
    supabase.from("work_locations").select("id, code, name, address, latitude, longitude, radius_m, is_active").order("sort_order", { ascending: true }).order("code", { ascending: true }),
    supabase
      .from("attendance_logs")
      .select("id, employee_id, work_location_id, attendance_date, event_type, event_at, latitude, longitude, distance_m, radius_m, gps_status, face_status, face_score, face_snapshot_path, status, workday_counted, notes")
      .order("event_at", { ascending: false })
      .limit(1000),
    supabase
      .from("payroll_cycles")
      .select("id, employee_id, cycle_number, period_started_at, period_closed_at, work_days_count, target_work_days, gross_amount, overtime_amount, net_amount, salary_type, status, ready_at, locked_at, paid_at")
      .order("cycle_number", { ascending: false }),
    supabase
      .from("overtime_requests")
      .select("id, employee_id, attendance_log_id, payroll_cycle_id, payroll_component_id, overtime_date, shift_start_time, shift_end_time, actual_check_out_at, overtime_minutes, approved_minutes, rate_amount, total_amount, day_type, status, notes, created_at")
      .order("overtime_date", { ascending: false })
      .limit(200),
    supabase
      .from("payroll_components")
      .select("id, name, code, calculation_unit, rate_amount, day_type, auto_detect_overtime"),
  ])
  const error = employeeResult.error || divisionResult.error || locationResult.error || attendanceResult.error || payrollResult.error || overtimeResult.error || payrollComponentResult.error

  if (error) throw error

  const divisionMap = new Map((divisionResult.data || []).map((row) => [String(row.id), String(row.name || "")]))
  const locationRows = (locationResult.data || []) as Array<Record<string, unknown>>
  const locationMap = new Map(locationRows.map((row) => [String(row.id), row]))
  const logs = (attendanceResult.data || []) as Array<Record<string, unknown>>
  const payrollRows = (payrollResult.data || []) as Array<Record<string, unknown>>
  const overtimeRows = (overtimeResult.data || []) as Array<Record<string, unknown>>
  const payrollComponentMap = new Map(((payrollComponentResult.data || []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]))
  const payrollByEmployee = new Map<string, Record<string, unknown>>()

  payrollRows.forEach((row) => {
    const employeeId = String(row.employee_id || "")
    if (employeeId && !payrollByEmployee.has(employeeId)) payrollByEmployee.set(employeeId, row)
  })

  const selectedLogsByEmployee = new Map<string, { checkIn?: Record<string, unknown>; checkOut?: Record<string, unknown> }>()
  const logsByEmployeeDate = new Map<string, { checkIn?: Record<string, unknown>; checkOut?: Record<string, unknown> }>()
  logs.forEach((row) => {
    const employeeId = String(row.employee_id || "")
    if (!employeeId) return

    const attendanceDate = String(row.attendance_date || "")
    if (attendanceDate) {
      const key = `${employeeId}:${attendanceDate}`
      const dateEntry = logsByEmployeeDate.get(key) || {}
      if (row.event_type === "check_in" && !dateEntry.checkIn) dateEntry.checkIn = row
      if (row.event_type === "check_out" && !dateEntry.checkOut) dateEntry.checkOut = row
      logsByEmployeeDate.set(key, dateEntry)
    }

    if (row.attendance_date !== selectedDate) return

    const entry = selectedLogsByEmployee.get(employeeId) || {}
    if (row.event_type === "check_in" && !entry.checkIn) entry.checkIn = row
    if (row.event_type === "check_out" && !entry.checkOut) entry.checkOut = row
    selectedLogsByEmployee.set(employeeId, entry)
  })

  const buildAttendanceMonitorRow = (
    employee: Record<string, unknown>,
    dateKey: string,
    selectedAttendance?: { checkIn?: Record<string, unknown>; checkOut?: Record<string, unknown> },
  ): AttendanceMonitorRow => {
    const employeeId = String(employee.id)
    const location = locationMap.get(String(employee.work_location_id || ""))
    const attendance = selectedAttendance?.checkIn
    const checkOut = selectedAttendance?.checkOut
    const payroll = payrollByEmployee.get(employeeId)
    const cycleDays = Number(payroll?.work_days_count ?? employee.payroll_cycle_days ?? 0)
    const targetDays = Number(payroll?.target_work_days ?? 26)
    const salaryType = mapEmployeeSalaryType(payroll?.salary_type || employee.salary_type)
    const basePayrollAmount = Number(payroll?.gross_amount || 0)
    const overtimeAmount = Number(payroll?.overtime_amount || 0)
    const payrollAmount = Number(payroll?.net_amount || 0) || basePayrollAmount + overtimeAmount
    const attendanceStatus = getDailyAttendanceMonitorStatus(attendance, checkOut)

    return {
      id: attendance ? String(attendance.id) : `missing-${employeeId}-${dateKey}`,
      employeeId,
      employeeCode: String(employee.employee_code || ""),
      fullName: String(employee.full_name || ""),
      employeePhotoPath: String(employee.photo_path || ""),
      employeePhotoUrl: getEmployeePhotoPublicUrl(String(employee.photo_path || "")),
      divisionName: divisionMap.get(String(employee.division_id || "")) || "Belum pilih divisi",
      workLocationName: String(location?.name || "Belum pilih lokasi"),
      attendanceDate: attendance ? String(attendance.attendance_date || "") : dateKey,
      eventAt: attendance ? String(attendance.event_at || "") : "",
      checkInId: attendance ? String(attendance.id || "") : "",
      checkInAt: attendance ? String(attendance.event_at || "") : "",
      checkInStatus: attendance ? (attendance.status === "valid" || attendance.status === "rejected" ? attendance.status : "review") : "missing",
      checkInGpsStatus: attendance ? (attendance.gps_status === "valid" || attendance.gps_status === "out_of_radius" ? attendance.gps_status : "missing") : "missing",
      checkInFaceStatus: attendance ? (attendance.face_status === "verified" || attendance.face_status === "failed" || attendance.face_status === "review" ? attendance.face_status : "not_required") : "not_required",
      checkInFaceScore: attendance?.face_score === null || attendance?.face_score === undefined ? null : Number(attendance.face_score),
      checkInDistanceM: attendance?.distance_m === null || attendance?.distance_m === undefined ? null : Number(attendance.distance_m),
      checkInNotes: String(attendance?.notes || ""),
      checkOutId: checkOut ? String(checkOut.id || "") : "",
      checkOutAt: checkOut ? String(checkOut.event_at || "") : "",
      checkOutStatus: checkOut ? (checkOut.status === "valid" || checkOut.status === "rejected" ? checkOut.status : "review") : "missing",
      checkOutGpsStatus: checkOut ? (checkOut.gps_status === "valid" || checkOut.gps_status === "out_of_radius" ? checkOut.gps_status : "missing") : "missing",
      checkOutFaceStatus: checkOut ? (checkOut.face_status === "verified" || checkOut.face_status === "failed" || checkOut.face_status === "review" ? checkOut.face_status : "not_required") : "not_required",
      checkOutFaceScore: checkOut?.face_score === null || checkOut?.face_score === undefined ? null : Number(checkOut.face_score),
      checkOutDistanceM: checkOut?.distance_m === null || checkOut?.distance_m === undefined ? null : Number(checkOut.distance_m),
      checkOutNotes: String(checkOut?.notes || ""),
      attendanceStatus,
      logStatus: attendance ? (attendance.status === "valid" || attendance.status === "rejected" ? attendance.status : "review") : "missing",
      gpsStatus: attendance ? (attendance.gps_status === "valid" || attendance.gps_status === "out_of_radius" ? attendance.gps_status : "missing") : "missing",
      faceStatus: attendance ? (attendance.face_status === "verified" || attendance.face_status === "failed" || attendance.face_status === "review" ? attendance.face_status : "not_required") : "not_required",
      faceScore: attendance?.face_score === null || attendance?.face_score === undefined ? null : Number(attendance.face_score),
      distanceM: attendance?.distance_m === null || attendance?.distance_m === undefined ? null : Number(attendance.distance_m),
      radiusM: Number(attendance?.radius_m || location?.radius_m || 0) || null,
      cycleDays,
      targetDays,
      payrollCycleId: String(payroll?.id || ""),
      payrollCycleNumber: Number(payroll?.cycle_number || 0),
      periodStartedAt: String(payroll?.period_started_at || ""),
      periodClosedAt: String(payroll?.period_closed_at || ""),
      payrollReadyAt: String(payroll?.ready_at || ""),
      payrollLockedAt: String(payroll?.locked_at || ""),
      payrollPaidAt: String(payroll?.paid_at || ""),
      payrollStatus: mapPayrollCycleStatus(payroll?.status),
      payrollAmount,
      basePayrollAmount,
      overtimeAmount,
      salaryType,
      workDurationLabel: attendance ? formatAttendanceWorkDuration(String(attendance.event_at || ""), checkOut ? String(checkOut.event_at || "") : null, dateKey) : "Belum mulai",
      notes: String(attendance?.notes || ""),
    }
  }

  const activeEmployees = ((employeeResult.data || []) as Array<Record<string, unknown>>).filter((employee) => employee.status !== "inactive")

  const rows: AttendanceMonitorRow[] = activeEmployees
    .map((employee) => {
      const employeeId = String(employee.id)
      return buildAttendanceMonitorRow(employee, selectedDate, selectedLogsByEmployee.get(employeeId))
    })

  const allRows: AttendanceMonitorRow[] = []
  logsByEmployeeDate.forEach((entry, key) => {
    const [employeeId, attendanceDate] = key.split(":")
    const employee = activeEmployees.find((item) => String(item.id) === employeeId)
    if (!employee || !attendanceDate) return
    allRows.push(buildAttendanceMonitorRow(employee, attendanceDate, entry))
  })
  allRows.sort((a, b) => {
    const dateCompare = b.attendanceDate.localeCompare(a.attendanceDate)
    if (dateCompare !== 0) return dateCompare
    return a.employeeCode.localeCompare(b.employeeCode)
  })

  const employeesById = new Map(activeEmployees.map((employee) => [String(employee.id), employee]))
  const reviewRows: AttendanceReviewRow[] = logs
    .filter((log) => log.status === "review")
    .slice(0, 50)
    .map((log) => {
      const employee = employeesById.get(String(log.employee_id || ""))
      const location = locationMap.get(String(log.work_location_id || employee?.work_location_id || ""))
      const pairedLogs = logsByEmployeeDate.get(`${String(log.employee_id || "")}:${String(log.attendance_date || "")}`)
      const checkInLog = log.event_type === "check_in" ? log : pairedLogs?.checkIn
      const checkOutLog = log.event_type === "check_out" ? log : pairedLogs?.checkOut

      return {
        id: String(log.id),
        employeeId: String(log.employee_id || ""),
        employeeCode: String(employee?.employee_code || ""),
        fullName: String(employee?.full_name || "Karyawan tidak ditemukan"),
        employeePhotoPath: String(employee?.photo_path || ""),
        employeePhotoUrl: getEmployeePhotoPublicUrl(String(employee?.photo_path || "")),
        divisionName: divisionMap.get(String(employee?.division_id || "")) || "Belum pilih divisi",
        workLocationName: String(location?.name || "Belum pilih lokasi"),
        attendanceDate: String(log.attendance_date || ""),
        eventType: log.event_type === "check_out" ? "check_out" : "check_in",
        eventAt: String(log.event_at || ""),
        latitude: log.latitude === null || log.latitude === undefined ? "" : String(log.latitude),
        longitude: log.longitude === null || log.longitude === undefined ? "" : String(log.longitude),
        status: log.status === "valid" || log.status === "rejected" ? log.status : "review",
        gpsStatus: log.gps_status === "valid" || log.gps_status === "out_of_radius" ? log.gps_status : "missing",
        faceStatus: log.face_status === "verified" || log.face_status === "failed" || log.face_status === "review" ? log.face_status : "not_required",
        faceScore: log.face_score === null || log.face_score === undefined ? null : Number(log.face_score),
        faceSnapshotPath: String(log.face_snapshot_path || ""),
        faceSnapshotUrl: getAttendanceFacePublicUrl(String(log.face_snapshot_path || "")),
        distanceM: log.distance_m === null || log.distance_m === undefined ? null : Number(log.distance_m),
        radiusM: Number(log.radius_m || location?.radius_m || 0) || null,
        workLocationLatitude: location?.latitude === null || location?.latitude === undefined ? "" : String(location?.latitude || ""),
        workLocationLongitude: location?.longitude === null || location?.longitude === undefined ? "" : String(location?.longitude || ""),
        workdayCounted: log.workday_counted === true,
        workDurationLabel: checkInLog ? formatAttendanceWorkDuration(String(checkInLog.event_at || ""), checkOutLog ? String(checkOutLog.event_at || "") : null, String(log.attendance_date || "")) : "Belum mulai",
        pairedCheckInAt: String(checkInLog?.event_at || ""),
        pairedCheckInStatus: checkInLog?.status === "valid" || checkInLog?.status === "rejected" ? checkInLog.status : checkInLog ? "review" : "missing",
        pairedCheckOutAt: String(checkOutLog?.event_at || ""),
        pairedCheckOutStatus: checkOutLog?.status === "valid" || checkOutLog?.status === "rejected" ? checkOutLog.status : checkOutLog ? "review" : "missing",
        issueLabel: getAttendanceReviewIssue(log),
        notes: String(log.notes || ""),
      }
    })

  const overtimeReviewRows: OvertimeReviewRow[] = overtimeRows.map((overtime) => {
    const employee = employeesById.get(String(overtime.employee_id || ""))
    const component = payrollComponentMap.get(String(overtime.payroll_component_id || ""))
    const overtimeStatus = String(overtime.status || "pending") as OvertimeStatus
    const dayType = String(overtime.day_type || "weekday")

    return {
      id: String(overtime.id),
      employeeId: String(overtime.employee_id || ""),
      employeeCode: String(employee?.employee_code || ""),
      fullName: String(employee?.full_name || "Karyawan tidak ditemukan"),
      employeePhotoPath: String(employee?.photo_path || ""),
      employeePhotoUrl: getEmployeePhotoPublicUrl(String(employee?.photo_path || "")),
      divisionName: divisionMap.get(String(employee?.division_id || "")) || "Belum pilih divisi",
      overtimeDate: String(overtime.overtime_date || ""),
      shiftStartTime: String(overtime.shift_start_time || "").slice(0, 5),
      shiftEndTime: String(overtime.shift_end_time || "").slice(0, 5),
      actualCheckOutAt: String(overtime.actual_check_out_at || ""),
      overtimeMinutes: Number(overtime.overtime_minutes || 0),
      approvedMinutes: Number(overtime.approved_minutes || 0),
      rateAmount: Number(overtime.rate_amount || component?.rate_amount || 0),
      totalAmount: Number(overtime.total_amount || 0),
      dayType: dayType === "sunday" || dayType === "holiday" ? dayType : "weekday",
      status: overtimeStatus === "approved" || overtimeStatus === "rejected" || overtimeStatus === "draft" ? overtimeStatus : "pending",
      componentName: String(component?.name || "Komponen lembur"),
      notes: String(overtime.notes || ""),
    }
  })

  const locations: FieldLocationSummary[] = locationRows.map((location) => {
    const locationId = String(location.id)
    const employeeCount = rows.filter((row) => row.workLocationName === String(location.name || "")).length
    const locationTodayLogs = logs.filter((log) => log.attendance_date === selectedDate && String(log.work_location_id || "") === locationId)

    return {
      id: locationId,
      code: String(location.code || ""),
      name: String(location.name || ""),
      address: String(location.address || ""),
      latitude: location.latitude === null || location.latitude === undefined ? "" : String(location.latitude),
      longitude: location.longitude === null || location.longitude === undefined ? "" : String(location.longitude),
      radiusM: Number(location.radius_m || 0),
      isReady: Boolean(location.latitude && location.longitude && location.radius_m && location.is_active !== false),
      employeeCount,
      validToday: locationTodayLogs.filter((log) => log.status === "valid").length,
      reviewToday: locationTodayLogs.filter((log) => log.status === "review" || log.gps_status === "out_of_radius").length,
    }
  })

  return { rows, allRows, locations, reviews: reviewRows, overtime: overtimeReviewRows }
}

function getBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Browser belum mendukung GPS."))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    })
  })
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function captureVideoFrame(video: HTMLVideoElement, contentType = "image/jpeg") {
  const width = video.videoWidth || 720
  const height = video.videoHeight || 960
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")

  if (!context) throw new Error("Kamera belum bisa diproses browser.")
  context.drawImage(video, 0, 0, width, height)
  return canvas.toDataURL(contentType, 0.88)
}

const faceEmbeddingModel = "@vladmandic/face-api:tiny-face-detector+68tiny+recognition@1.7.15"
const faceEmbeddingModelPath = "/face-models"
let faceEmbeddingEnginePromise: Promise<any> | null = null

async function loadFaceEmbeddingEngine() {
  if (!faceEmbeddingEnginePromise) {
    faceEmbeddingEnginePromise = import("@vladmandic/face-api").then(async (faceapi) => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(faceEmbeddingModelPath),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(faceEmbeddingModelPath),
        faceapi.nets.faceRecognitionNet.loadFromUri(faceEmbeddingModelPath),
      ])
      return faceapi
    })
  }

  return faceEmbeddingEnginePromise
}

function normalizeFaceEmbedding(value: ArrayLike<number>) {
  const vector = Array.from(value, (item) => Number(item))
  if (vector.length !== 128 || vector.some((item) => !Number.isFinite(item))) {
    throw new Error("Embedding wajah tidak valid.")
  }
  return vector.map((item) => Number(item.toFixed(8)))
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Snapshot wajah belum bisa dibaca."))
    image.src = dataUrl
  })
}

async function extractFaceEmbeddingFromMedia(source: HTMLVideoElement | HTMLImageElement) {
  const faceapi = await loadFaceEmbeddingEngine()
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 })
  const result = await faceapi
    .detectSingleFace(source, options)
    .withFaceLandmarks(true)
    .withFaceDescriptor()

  if (!result?.descriptor) throw new Error("Wajah belum terbaca oleh embedding engine.")
  return normalizeFaceEmbedding(result.descriptor)
}

async function extractFaceEmbeddingFromDataUrl(dataUrl: string) {
  const image = await loadImageFromDataUrl(dataUrl)
  return extractFaceEmbeddingFromMedia(image)
}

async function extractEnrollmentFaceEmbeddings(snapshotsBase64: string[]) {
  const embeddings: number[][] = []

  for (const snapshot of snapshotsBase64.slice(0, 3)) {
    embeddings.push(await extractFaceEmbeddingFromDataUrl(snapshot))
  }

  return embeddings
}

function calculateFrameQualityScore(video: HTMLVideoElement) {
  const width = 96
  const height = 128
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) return 0

  context.drawImage(video, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  let luminanceTotal = 0
  let luminanceSquaredTotal = 0

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
    luminanceTotal += luminance
    luminanceSquaredTotal += luminance * luminance
  }

  const pixelCount = width * height
  const mean = luminanceTotal / pixelCount
  const variance = Math.max(0, luminanceSquaredTotal / pixelCount - mean * mean)
  const brightnessScore = Math.max(0, 1 - Math.abs(mean - 132) / 132)
  const contrastScore = Math.min(1, Math.sqrt(variance) / 58)

  return Math.round((brightnessScore * 0.64 + contrastScore * 0.36) * 100)
}

type FaceBox = { x: number; y: number; width: number; height: number }

function readFaceBox(detection: unknown): FaceBox | null {
  const candidate = detection as {
    boundingBox?: Partial<FaceBox>
    box?: Partial<FaceBox>
    detection?: { box?: Partial<FaceBox> }
  }
  const box = candidate.boundingBox || candidate.box || candidate.detection?.box
  if (!box) return null

  const x = Number(box.x)
  const y = Number(box.y)
  const width = Number(box.width)
  const height = Number(box.height)

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

async function detectFaceBoxes(video: HTMLVideoElement) {
  const FaceDetectorConstructor = (window as unknown as {
    FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
      detect: (source: HTMLVideoElement) => Promise<Array<{ boundingBox: DOMRectReadOnly | FaceBox }>>
    }
  }).FaceDetector

  if (FaceDetectorConstructor) {
    const detector = new FaceDetectorConstructor({ fastMode: true, maxDetectedFaces: 2 })
    const nativeFaces = await detector.detect(video)
    return nativeFaces.map(readFaceBox).filter((box): box is FaceBox => Boolean(box))
  }

  const faceapi = await loadFaceEmbeddingEngine()
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.42 })
  const modelFaces = await faceapi.detectAllFaces(video, options) as unknown[]
  return modelFaces.map(readFaceBox).filter((box): box is FaceBox => Boolean(box))
}

function analyzeFaceBox(
  face: FaceBox,
  video: HTMLVideoElement,
  qualityScore: number,
  options: {
    centerToleranceX: number
    centerToleranceY: number
    idealHeightRatio: number
    heightTolerance: number
    minHeightRatio: number
    maxHeightRatio: number
    maxWidthRatio?: number
    readyScore: number
    centerMessage: string
    readyMessage: string
    holdMessage: string
    closeMessage: string
    farMessage: string
    centerWeight: number
    sizeWeight: number
    qualityWeight: number
  },
) {
  const width = video.videoWidth
  const height = video.videoHeight
  const centerX = face.x + face.width / 2
  const centerY = face.y + face.height / 2
  const offsetX = Math.abs(centerX - width / 2) / width
  const offsetY = Math.abs(centerY - height / 2) / height
  const faceWidthRatio = face.width / width
  const faceHeightRatio = face.height / height
  const centerScore = Math.max(0, 1 - (offsetX / options.centerToleranceX + offsetY / options.centerToleranceY) / 2)
  const sizeScore = Math.max(0, 1 - Math.abs(faceHeightRatio - options.idealHeightRatio) / options.heightTolerance)
  const score = Math.round((centerScore * options.centerWeight + sizeScore * options.sizeWeight + (qualityScore / 100) * options.qualityWeight) * 100)

  if (faceHeightRatio < options.minHeightRatio) return { supported: true, ready: false, score, message: options.farMessage }
  if (faceHeightRatio > options.maxHeightRatio || (options.maxWidthRatio && faceWidthRatio > options.maxWidthRatio)) {
    return { supported: true, ready: false, score, message: options.closeMessage }
  }
  if (offsetX > options.centerToleranceX || offsetY > options.centerToleranceY) {
    return { supported: true, ready: false, score, message: options.centerMessage }
  }

  return {
    supported: true,
    ready: score >= options.readyScore,
    score,
    message: score >= options.readyScore ? options.readyMessage : options.holdMessage,
  }
}

async function analyzeFaceEnrollmentFrame(video: HTMLVideoElement | null) {
  if (!video || !video.videoWidth || !video.videoHeight) {
    return { supported: true, ready: false, score: 0, message: "Preview kamera belum siap." }
  }

  const qualityScore = calculateFrameQualityScore(video)
  const faces = await detectFaceBoxes(video)

  if (faces.length === 0) return { supported: true, ready: false, score: qualityScore, message: "Posisikan wajah di tengah oval." }
  if (faces.length > 1) return { supported: true, ready: false, score: 0, message: "Pastikan hanya satu wajah di kamera." }

  return analyzeFaceBox(faces[0], video, qualityScore, {
    centerToleranceX: 0.24,
    centerToleranceY: 0.28,
    idealHeightRatio: 0.6,
    heightTolerance: 0.42,
    minHeightRatio: 0.28,
    maxHeightRatio: 0.96,
    maxWidthRatio: 0.92,
    readyScore: 62,
    centerMessage: "Geser wajah ke tengah oval.",
    readyMessage: "Wajah terbaca. Tahan sebentar.",
    holdMessage: "Wajah hampir pas. Tahan posisi.",
    closeMessage: "Wajah terlalu dekat. Mundur sedikit.",
    farMessage: "Dekatkan wajah ke kamera.",
    centerWeight: 0.44,
    sizeWeight: 0.28,
    qualityWeight: 0.28,
  })
}

async function analyzeAttendanceFaceFrame(video: HTMLVideoElement | null) {
  if (!video || !video.videoWidth || !video.videoHeight) {
    return { supported: true, ready: false, score: 0, message: "Preview kamera belum siap." }
  }

  const qualityScore = calculateFrameQualityScore(video)
  const faces = await detectFaceBoxes(video)

  if (faces.length === 0) return { supported: true, ready: false, score: qualityScore, message: "Wajah belum terbaca." }
  if (faces.length > 1) return { supported: true, ready: false, score: qualityScore, message: "Pastikan hanya satu wajah di kamera." }

  return analyzeFaceBox(faces[0], video, qualityScore, {
    centerToleranceX: 0.22,
    centerToleranceY: 0.26,
    idealHeightRatio: 0.56,
    heightTolerance: 0.36,
    minHeightRatio: 0.3,
    maxHeightRatio: 0.92,
    readyScore: 76,
    centerMessage: "Geser wajah ke tengah frame.",
    readyMessage: "Wajah terbaca. Menyimpan snapshot...",
    holdMessage: "Tahan wajah tetap sejajar.",
    closeMessage: "Wajah terlalu dekat. Mundur sedikit.",
    farMessage: "Dekatkan wajah sedikit.",
    centerWeight: 0.48,
    sizeWeight: 0.32,
    qualityWeight: 0.2,
  })
}

async function startUserCamera(video: HTMLVideoElement | null) {
  if (!video) throw new Error("Preview kamera belum siap.")
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Browser belum mendukung kamera. Gunakan Chrome/Safari terbaru dengan HTTPS.")

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 720 },
      height: { ideal: 960 },
    },
    audio: false,
  })
  video.srcObject = stream
  await video.play()

  return stream
}

async function submitFieldAttendance(payload: FieldAttendanceSubmitPayload): Promise<FieldAttendanceResult> {
  const { data, error } = await supabase.functions.invoke("field-attendance", {
    body: payload,
  })

  if (error) throw new Error(await getFunctionInvokeError(error, "Absensi lapangan belum bisa disimpan."))
  if (data?.error) throw new Error(String(data.error))

  return data as FieldAttendanceResult
}

async function loadEmployeePortalData(): Promise<EmployeePortalData> {
  const { data, error } = await supabase.functions.invoke("employee-portal", {
    body: { action: "dashboard" },
  })

  if (error) throw new Error(await getFunctionInvokeError(error, "Data app karyawan belum bisa dibaca."))
  if (data?.error) throw new Error(String(data.error))

  const employee = data.employee || {}
  const faceProfile = data.faceProfile || {}
  const payrollCycle = data.payrollCycle || null

  return {
    employee: {
      id: String(employee.id || ""),
      code: String(employee.code || ""),
      name: String(employee.name || ""),
      photoPath: String(employee.photoPath || ""),
      photoUrl: getEmployeePhotoPublicUrl(String(employee.photoPath || "")),
      divisionName: String(employee.divisionName || "Belum pilih divisi"),
      positionName: String(employee.positionName || "Belum pilih jabatan"),
      workLocationName: String(employee.workLocationName || "Belum pilih lokasi"),
      workLocationAddress: String(employee.workLocationAddress || ""),
      workLocationLatitude: String(employee.workLocationLatitude || ""),
      workLocationLongitude: String(employee.workLocationLongitude || ""),
      radiusM: Number(employee.radiusM || 0),
      shiftName: String(employee.shiftName || "Belum pilih shift"),
      salaryType: mapEmployeeSalaryType(employee.salaryType),
      dailySalary: Number(employee.dailySalary || 0),
      monthlySalary: Number(employee.monthlySalary || 0),
      payrollMethod: mapEmployeePayrollMethod(employee.payrollMethod),
      joinDate: String(employee.joinDate || ""),
      status: employee.status === "review" || employee.status === "inactive" ? employee.status : "active",
    },
    faceProfile: {
      status: mapEmployeeFaceProfileStatus(faceProfile.status),
      threshold: Number(faceProfile.threshold || 85),
      verificationRequired: faceProfile.verificationRequired !== false,
      submittedAt: String(faceProfile.submittedAt || ""),
      reviewedAt: String(faceProfile.reviewedAt || ""),
      reviewNotes: String(faceProfile.reviewNotes || ""),
    },
    payrollCycle: payrollCycle ? {
      id: String(payrollCycle.id || ""),
      cycleNumber: Number(payrollCycle.cycleNumber || 0),
      workDaysCount: Number(payrollCycle.workDaysCount || 0),
      targetWorkDays: Number(payrollCycle.targetWorkDays || 26),
      grossAmount: Number(payrollCycle.grossAmount || 0),
      overtimeAmount: Number(payrollCycle.overtimeAmount || 0),
      netAmount: Number(payrollCycle.netAmount || 0),
      status: mapPayrollCycleStatus(payrollCycle.status),
      periodStartedAt: String(payrollCycle.periodStartedAt || ""),
      periodClosedAt: String(payrollCycle.periodClosedAt || ""),
      readyAt: String(payrollCycle.readyAt || ""),
    } : null,
    todayLogs: ((data.todayLogs || []) as Array<Record<string, unknown>>).map(mapEmployeePortalLog),
    recentLogs: ((data.recentLogs || []) as Array<Record<string, unknown>>).map(mapEmployeePortalLog),
  }
}

function mapEmployeePortalLog(row: Record<string, unknown>): EmployeePortalAttendanceLog {
  return {
    id: String(row.id || ""),
    attendanceDate: String(row.attendanceDate || ""),
    eventType: row.eventType === "check_out" ? "check_out" : "check_in",
    eventAt: String(row.eventAt || ""),
    status: row.status === "valid" || row.status === "rejected" ? row.status : "review",
    gpsStatus: row.gpsStatus === "valid" || row.gpsStatus === "out_of_radius" ? row.gpsStatus : "missing",
    faceStatus: row.faceStatus === "verified" || row.faceStatus === "review" || row.faceStatus === "failed" ? row.faceStatus : "not_required",
    faceScore: row.faceScore === null || row.faceScore === undefined ? null : Number(row.faceScore),
    distanceM: row.distanceM === null || row.distanceM === undefined ? null : Number(row.distanceM),
    radiusM: row.radiusM === null || row.radiusM === undefined ? null : Number(row.radiusM),
    workdayCounted: row.workdayCounted === true,
    notes: String(row.notes || ""),
  }
}

async function getFunctionInvokeError(error: unknown, fallback: string) {
  if (!error) return fallback
  const context = typeof error === "object" && error !== null && "context" in error ? (error as { context?: unknown }).context : null

  if (context instanceof Response) {
    const text = await context.clone().text()
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
        return String(parsed.error || parsed.message || text)
      } catch {
        return text
      }
    }
  }

  return error instanceof Error ? error.message || fallback : fallback
}

async function submitEmployeeFaceEnrollment(
  snapshotsBase64: string[],
  snapshotContentType = "image/jpeg",
  notes = "",
  employeeId = "",
  faceEmbeddings: number[][] = [],
  model = faceEmbeddingModel,
) {
  const { data, error } = await supabase.functions.invoke("employee-face-profiles", {
    body: {
      action: employeeId ? "submit_for_employee" : "submit_self",
      payload: {
        employeeId: employeeId || undefined,
        snapshotBase64: snapshotsBase64[0] || "",
        snapshotsBase64,
        snapshotContentType,
        faceEmbedding: faceEmbeddings[0] || [],
        faceEmbeddings,
        faceEmbeddingModel: model,
        notes,
        threshold: 85,
      },
    },
  })

  if (error) throw new Error(await getFunctionInvokeError(error, "Registrasi wajah gagal diproses."))
  if (data?.error) throw new Error(String(data.error))

  return data
}

async function processEmployeeFaceProfile(employeeId: string, action: "approve" | "reject" | "reset" | "disable", notes = "") {
  const { data, error } = await supabase.functions.invoke("employee-face-profiles", {
    body: {
      action,
      payload: {
        employeeId,
        notes,
        threshold: 85,
      },
    },
  })

  if (error) throw new Error(await getFunctionInvokeError(error, "Face profile gagal diproses."))
  if (data?.error) throw new Error(String(data.error))

  return data
}

async function reviewAttendanceLog(id: string, decision: "approve" | "reject", notes: string) {
  const { data, error } = await supabase.functions.invoke("attendance-review", {
    body: { action: decision, payload: { id, notes } },
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

async function resetAttendanceDay(employeeId: string, attendanceDate: string, notes: string) {
  const { data, error } = await supabase.functions.invoke("attendance-review", {
    body: {
      action: "reset_day",
      payload: {
        employeeId,
        attendanceDate,
        notes,
      },
    },
  })

  if (error) throw new Error(await getFunctionInvokeError(error, "Reset absensi belum bisa diproses."))
  if (data?.error) throw new Error(String(data.error))

  return data
}

async function correctMissingCheckout(employeeId: string, attendanceDate: string, checkOutTime: string, notes: string) {
  const { data, error } = await supabase.functions.invoke("attendance-review", {
    body: {
      action: "correct_checkout",
      payload: {
        employeeId,
        attendanceDate,
        checkOutTime,
        notes,
      },
    },
  })

  if (error) throw new Error(await getFunctionInvokeError(error, "Koreksi checkout belum bisa diproses."))
  if (data?.error) throw new Error(String(data.error))

  return data
}

async function reviewOvertimeRequest(id: string, decision: "approve" | "reject", approvedMinutes: number, notes: string) {
  const { data, error } = await supabase.functions.invoke("overtime-review", {
    body: { action: decision, payload: { id, approvedMinutes, notes } },
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

async function processPayrollCycle(cycleId: string, action: PayrollProcessAction, notes: string) {
  const { data, error } = await supabase.functions.invoke("payroll-processing", {
    body: { action, payload: { cycleId, notes } },
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

const userStatusLabel: Record<UserStatus, string> = {
  active: "Aktif",
  invited: "Invite",
  locked: "Locked",
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

function EmployeesPage({ activeView, profile }: { activeView: ViewId; profile: AppAccessProfile }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<EmployeeDirectoryRow | null>(null)
  const [detailRow, setDetailRow] = useState<EmployeeDirectoryRow | null>(null)
  const [statusRow, setStatusRow] = useState<EmployeeDirectoryRow | null>(null)
  const [pendingStatus, setPendingStatus] = useState<EmployeeStatus>("active")
  const [deleteRow, setDeleteRow] = useState<EmployeeDirectoryRow | null>(null)
  const [restoreRow, setRestoreRow] = useState<EmployeeDirectoryRow | null>(null)
  const [nametagRow, setNametagRow] = useState<EmployeeDirectoryRow | null>(null)
  const [faceEnrollmentRow, setFaceEnrollmentRow] = useState<EmployeeDirectoryRow | null>(null)
  const [faceEnrollmentSubmitting, setFaceEnrollmentSubmitting] = useState(false)
  const [dialogInitialValues, setDialogInitialValues] = useState<EmployeeFormValues>(() => createEmptyEmployeeForm())
  const [rows, setRows] = useState<EmployeeDirectoryRow[]>([])
  const [divisions, setDivisions] = useState<EmployeeOption[]>([])
  const [positions, setPositions] = useState<EmployeeOption[]>([])
  const [locations, setLocations] = useState<EmployeeOption[]>([])
  const [shifts, setShifts] = useState<EmployeeOption[]>([])
  const [policies, setPolicies] = useState<AttendancePolicyOption[]>([])
  const [kioskSchemaReady, setKioskSchemaReady] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState<EmployeeDirectoryTab>("all")
  const [divisionFilter, setDivisionFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const canManage = hasPermission(profile, "employees.manage")

  const fetchRows = async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      const data = await loadEmployeeData()
      setRows(data.rows)
      setDivisions(data.divisions)
      setPositions(data.positions)
      setLocations(data.locations)
      setShifts(data.shifts)
      setPolicies(data.policies)
      setKioskSchemaReady(data.kioskSchemaReady)
      return data
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Gagal mengambil data karyawan."))
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchRows()
  }, [])

  const liveRows = rows.filter((row) => !row.deletedAt)
  const archivedRows = rows.filter((row) => row.deletedAt)
  const visibleRows = activeTab === "archived"
    ? archivedRows
    : liveRows.filter((row) => activeTab === "all" || row.status === activeTab)
  const filteredRows = visibleRows.filter((row) => {
    const normalizedTerm = searchTerm.trim().toLowerCase()
    const matchesSearch = normalizedTerm
      ? [row.employeeCode, row.fullName, row.nik, row.phone, row.email, row.divisionName, row.positionName, row.workLocationName, row.shiftName, row.notes, row.deletedAt].join(" ").toLowerCase().includes(normalizedTerm)
      : true
    const matchesDivision = divisionFilter === "all" || row.divisionId === divisionFilter
    const matchesStatus = statusFilter === "all" || row.status === statusFilter

    return matchesSearch && matchesDivision && matchesStatus
  })
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / Math.min(pageSize, 50)))
  const currentPage = Math.min(page, pageCount)
  const paginatedRows = filteredRows.slice((currentPage - 1) * Math.min(pageSize, 50), currentPage * Math.min(pageSize, 50))
  const activeRows = liveRows.filter((row) => row.status === "active").length
  const reviewRows = liveRows.filter((row) => row.status === "review").length
  const averageSalary = activeRows
    ? Math.round(liveRows.filter((row) => row.status === "active").reduce((sum, row) => sum + getEmployeeSalaryAmount(row), 0) / activeRows)
    : 0
  const employeeDirectoryTabs: Array<{ id: EmployeeDirectoryTab; label: string; icon: LucideIcon; count: number }> = [
    { id: "all", label: "Semua", icon: UsersRound, count: liveRows.length },
    { id: "active", label: "Aktif", icon: UserRoundCheck, count: activeRows },
    { id: "review", label: "Review", icon: AlertTriangle, count: reviewRows },
    { id: "inactive", label: "Nonaktif", icon: Lock, count: liveRows.filter((row) => row.status === "inactive").length },
    { id: "archived", label: "Arsip", icon: Archive, count: archivedRows.length },
  ]

  useEffect(() => {
    setPage(1)
  }, [searchTerm, activeTab, divisionFilter, statusFilter, pageSize])

  const showToast = (message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() })
  }

  const openCreateDialog = () => {
    setEditingRow(null)
    const fallbackValues = createEmptyEmployeeForm(rows)
    fallbackValues.kioskSchemaReady = kioskSchemaReady
    setDialogInitialValues(fallbackValues)
    setDialogOpen(true)
    void getNextEmployeeCode(rows).then((employeeCode) => {
      setDialogInitialValues((current) => ({
        ...current,
            employeeCode: current.employeeCode === fallbackValues.employeeCode ? employeeCode : current.employeeCode,
            qrToken: current.employeeCode === fallbackValues.employeeCode ? generateEmployeeQrToken(employeeCode) : current.qrToken,
            kioskSchemaReady,
      }))
    }).catch(() => {})
  }

  const openEditDialog = (row: EmployeeDirectoryRow) => {
    setDetailRow(null)
    setEditingRow(row)
    setDialogInitialValues({
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      photoPath: row.photoPath,
      photoUrl: row.photoUrl,
      photoFile: null,
      removePhoto: false,
      nik: row.nik,
      phone: row.phone,
      email: row.email,
      divisionId: row.divisionId,
      positionId: row.positionId,
      workLocationId: row.workLocationId,
      shiftId: row.shiftId,
      salaryType: row.salaryType,
      dailySalary: String(row.dailySalary),
      monthlySalary: String(row.monthlySalary),
      payrollMethod: row.payrollMethod,
      prorateEnabled: row.prorateEnabled,
      qrToken: row.qrToken || generateEmployeeQrToken(row.employeeCode),
      rfidUid: row.rfidUid,
      attendancePolicyId: row.attendancePolicyId,
      kioskAccessEnabled: row.kioskAccessEnabled,
      kioskSchemaReady,
      joinDate: row.joinDate,
      payrollCycleDays: String(row.payrollCycleDays),
      status: row.status,
      notes: row.notes,
    })
    setDialogOpen(true)
  }

  const openStatusDialog = (row: EmployeeDirectoryRow, status: EmployeeStatus) => {
    setStatusRow(row)
    setPendingStatus(status)
  }

  const handleSubmitEmployee = async (values: EmployeeFormValues) => {
    setSaving(true)
    setErrorMessage("")

    try {
      await saveEmployee(values, editingRow)
      await writeAuditLog(editingRow ? "Update employee" : "Create employee", "employees", editingRow?.id || values.employeeCode, {
        employee_code: values.employeeCode,
        full_name: values.fullName,
      }).catch(() => {})
      setDialogOpen(false)
      setEditingRow(null)
      await fetchRows()
      showToast({
        tone: "success",
        title: editingRow ? "Karyawan diupdate" : "Karyawan ditambahkan",
        description: `${values.fullName} sudah tersimpan di direktori karyawan.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal menyimpan karyawan.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal menyimpan", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChangeEmployee = async (status: EmployeeStatus) => {
    if (!statusRow) return
    setSaving(true)
    setErrorMessage("")

    try {
      await updateEmployeeStatus(statusRow, status)
      await writeAuditLog("Update employee status", "employees", statusRow.id, {
        employee_code: statusRow.employeeCode,
        status,
      }).catch(() => {})
      setStatusRow(null)
      await fetchRows()
      showToast({
        tone: "success",
        title: "Status diperbarui",
        description: `${statusRow.fullName} sekarang ${employeeStatusLabel[status]}.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal mengubah status karyawan.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal mengubah status", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEmployee = async () => {
    if (!deleteRow) return
    setSaving(true)
    setErrorMessage("")

    try {
      await deleteEmployee(deleteRow)
      await writeAuditLog("Archive employee", "employees", deleteRow.id, {
        employee_code: deleteRow.employeeCode,
        full_name: deleteRow.fullName,
      }).catch(() => {})
      setDeleteRow(null)
      await fetchRows()
      showToast({ tone: "success", title: "Karyawan diarsipkan", description: `${deleteRow.fullName} disembunyikan dari direktori aktif.` })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal mengarsipkan karyawan.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal mengarsipkan", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleRestoreEmployee = async () => {
    if (!restoreRow) return
    setSaving(true)
    setErrorMessage("")

    try {
      await restoreEmployee(restoreRow)
      await writeAuditLog("Restore employee", "employees", restoreRow.id, {
        employee_code: restoreRow.employeeCode,
        full_name: restoreRow.fullName,
      }).catch(() => {})
      setRestoreRow(null)
      const data = await fetchRows()
      const nextRow = data?.rows.find((row) => row.id === restoreRow.id) || null
      if (nextRow) setDetailRow(nextRow)
      showToast({ tone: "success", title: "Karyawan dipulihkan", description: `${restoreRow.fullName} kembali ke direktori aktif.` })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal memulihkan karyawan.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal memulihkan", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleFaceProfileAction = async (row: EmployeeDirectoryRow, action: "approve" | "reject" | "reset" | "disable") => {
    setSaving(true)
    setErrorMessage("")

    try {
      await processEmployeeFaceProfile(row.id, action)
      const data = await fetchRows()
      const nextRow = data?.rows.find((item) => item.id === row.id) || null
      if (nextRow) setDetailRow(nextRow)
      showToast({
        tone: "success",
        title: action === "approve" ? "Face approved" : action === "reject" ? "Face rejected" : action === "reset" ? "Face direset" : "Face dimatikan",
        description: `${row.fullName} • ${action === "reset" ? "karyawan perlu daftar ulang" : "status face profile diperbarui"}.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal memproses face profile.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal proses face", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleEmployeeFaceEnrollmentSubmit = async (payload: FaceEnrollmentSubmitPayload) => {
    if (!faceEnrollmentRow) return

    setFaceEnrollmentSubmitting(true)
    setErrorMessage("")

    try {
      await submitEmployeeFaceEnrollment(
        payload.snapshotsBase64,
        "image/jpeg",
        `Registrasi wajah ${faceEnrollmentRow.employeeCode} dari management app.`,
        faceEnrollmentRow.id,
        payload.faceEmbeddings,
        payload.faceEmbeddingModel,
      )
      await writeAuditLog("Submit employee face profile by management", "employee_face_profiles", faceEnrollmentRow.id, {
        employee_code: faceEnrollmentRow.employeeCode,
        full_name: faceEnrollmentRow.fullName,
        samples: payload.snapshotsBase64.length,
        embeddings: payload.faceEmbeddings.length,
      }).catch(() => {})
      const data = await fetchRows()
      const nextRow = data?.rows.find((item) => item.id === faceEnrollmentRow.id) || null
      if (nextRow) setDetailRow(nextRow)
      setFaceEnrollmentRow(null)
      showToast({
        tone: "success",
        title: "Wajah masuk review HR",
        description: `${faceEnrollmentRow.fullName} punya 3 sampel baru dan menunggu approval.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal mengirim registrasi wajah.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal registrasi wajah", description: message })
    } finally {
      setFaceEnrollmentSubmitting(false)
    }
  }

  const resetFilters = () => {
    setSearchTerm("")
    setDivisionFilter("all")
    setStatusFilter("all")
  }

  return (
        <OperationalPageShell className="kioskPageShell">
      <PageHeader
        activeView={activeView}
        subtitle="Direktori karyawan yang terhubung ke divisi, jabatan, shift, lokasi kerja, dan cycle payroll 26 hari."
        meta={
          <InlinePageStats
            items={[
              `${filteredRows.length} dari ${visibleRows.length} karyawan`,
              `${activeRows} aktif`,
              `${reviewRows} review`,
              `${archivedRows.length} arsip`,
              `Gaji aktif rata-rata ${formatCurrency(averageSalary)}`,
            ]}
          />
        }
        actions={
          <>
            <button className="secondaryButton" type="button" onClick={() => exportEmployeeCsv(filteredRows)} disabled={filteredRows.length === 0}>
              <FileBarChart size={17} />
              Export Karyawan
            </button>
            <button className="primaryButton" type="button" onClick={openCreateDialog} disabled={!canManage}>
              <UserPlus size={17} />
              Tambah Karyawan
            </button>
          </>
        }
      />

      <section className="moduleGrid">
        {errorMessage && <div className="inlineAlert">{errorMessage}</div>}

        <CategoryTabs
          activeId={activeTab}
          ariaLabel="Filter direktori karyawan"
          items={employeeDirectoryTabs}
          onChange={(id) => {
            setActiveTab(id)
            setStatusFilter("all")
          }}
        />

        <OperationalFilterPanel className="employeeFilterPanel">
          <div className="filterField">
            <label>Search</label>
            <div className="uiInput inputWithIcon compact">
              <Search size={16} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari nama, kode, NIK, divisi, lokasi..." />
            </div>
          </div>
          <div className="filterField">
            <label>Divisi</label>
            <select className="uiSelectTrigger" value={divisionFilter} onChange={(event) => setDivisionFilter(event.target.value)}>
              <option value="all">Semua Divisi</option>
              {divisions.map((division) => (
                <option value={division.id} key={division.id}>{division.name}</option>
              ))}
            </select>
          </div>
          <div className="filterField">
            <label>Status</label>
            <select className="uiSelectTrigger" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="review">Review</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
          <button className="secondaryButton" type="button" onClick={resetFilters}>Reset Filter</button>
        </OperationalFilterPanel>

        <OperationalTableCard>
          <div className="tableHeader">
            <div>
              <h2>Employee Directory</h2>
              <p>Klik baris untuk melihat detail karyawan. Aksi cepat tersedia di titik tiga.</p>
            </div>
          </div>
          <div className="tableScroller uiDataTableScroller uiDataTableHasColumns employeeTableScroller">
            <table>
              <colgroup>
                <col className="tableNumberColumn" />
                <col style={{ width: "19%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "9%" }} />
                <col className="tableActionColumn" />
              </colgroup>
              <thead>
                <tr>
                  <th className="tableNumberHeader">No</th>
                  <th>Karyawan</th>
                  <th>Divisi</th>
                  <th>Jabatan</th>
                  <th>Lokasi / Shift</th>
                  <th>Gaji</th>
                  <th>Cycle</th>
                  <th>Status</th>
                  <th className="tableActionHeader">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="tableStateCell" colSpan={9}>
                      <TableState title="Memuat karyawan" description="Mengambil direktori karyawan dari Supabase." icon={UsersRound} />
                    </td>
                  </tr>
                )}
                {!loading && errorMessage && rows.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={9}>
                      <TableState title="Gagal memuat data" description={errorMessage} icon={AlertTriangle} tone="danger" />
                    </td>
                  </tr>
                )}
                {!loading && !errorMessage && filteredRows.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={9}>
                      <TableState
                        title={activeTab === "archived" ? "Arsip karyawan kosong" : "Karyawan tidak ditemukan"}
                        description={activeTab === "archived" ? "Karyawan yang diarsipkan akan muncul di tab ini dan bisa dipulihkan." : "Ubah filter atau tambah karyawan baru."}
                        icon={activeTab === "archived" ? Archive : Search}
                      />
                    </td>
                  </tr>
                )}
                {!loading && paginatedRows.map((row, index) => (
                  <ClickableTableRow key={row.id} label={`Lihat detail ${row.fullName}`} onOpen={() => setDetailRow(row)}>
                    <td className="tableNumberCell"><TableNumberCell value={(currentPage - 1) * Math.min(pageSize, 50) + index + 1} /></td>
                    <td>
                      <EmployeeIdentityCell fullName={row.fullName} code={row.employeeCode} photoUrl={row.photoUrl} />
                    </td>
                    <td><TableText primary={row.divisionName} secondary={row.nik || "NIK belum diisi"} /></td>
                    <td><TableText primary={row.positionName} secondary={row.phone || "No HP belum diisi"} /></td>
                    <td><TableText primary={row.workLocationName} secondary={row.shiftName} /></td>
                    <td><TableText primary={formatCurrency(getEmployeeSalaryAmount(row))} secondary={`${employeeSalaryTypeLabel[row.salaryType]} · Masuk ${formatEmployeeDate(row.joinDate)}`} /></td>
                    <td>
                      <span className="cycleCell">
                        <ProgressRing value={row.payrollCycleDays} />
                        <span>{row.payrollCycleDays}/26</span>
                      </span>
                    </td>
                    <td><EmployeeStatusBadge status={row.status} /></td>
                    <td className="tableActionCell">
                      <div className="rowActions">
                        <RowActionMenu label={`Aksi ${row.fullName}`}>
                          {row.deletedAt ? (
                            <RowActionMenuItem disabled={!canManage || saving} onClick={() => setRestoreRow(row)}>
                              <RotateCcw size={14} />
                              Pulihkan
                            </RowActionMenuItem>
                          ) : (
                            <>
                              <RowActionMenuItem disabled={!canManage || saving} onClick={() => openEditDialog(row)}>
                                <Pencil size={14} />
                                Edit
                              </RowActionMenuItem>
                              <RowActionMenuItem disabled={saving} onClick={() => setNametagRow(row)}>
                                <CreditCard size={14} />
                                Cetak Nametag
                              </RowActionMenuItem>
                              <RowActionMenuItem disabled={!canManage || saving || row.status === "active"} onClick={() => openStatusDialog(row, "active")}>
                                <FileCheck2 size={14} />
                                Aktifkan
                              </RowActionMenuItem>
                              <RowActionMenuItem disabled={!canManage || saving || row.status === "review"} onClick={() => openStatusDialog(row, "review")}>
                                <AlertTriangle size={14} />
                                Tandai Review
                              </RowActionMenuItem>
                              <RowActionMenuItem danger disabled={!canManage || saving || row.status === "inactive"} onClick={() => openStatusDialog(row, "inactive")}>
                                <Trash2 size={14} />
                                Nonaktifkan
                              </RowActionMenuItem>
                              <RowActionMenuItem danger disabled={!canManage || saving} onClick={() => setDeleteRow(row)}>
                                <Archive size={14} />
                                Arsipkan Data
                              </RowActionMenuItem>
                            </>
                          )}
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

      <EmployeeDialog
        open={dialogOpen}
        mode={editingRow ? "edit" : "create"}
        initialValues={dialogInitialValues}
        divisions={divisions}
        positions={positions}
        locations={locations}
        shifts={shifts}
        policies={policies}
        saving={saving}
        onClose={() => {
          setDialogOpen(false)
          setEditingRow(null)
        }}
        onSubmit={handleSubmitEmployee}
      />
      <EmployeeDetailDialog
        row={detailRow}
        onClose={() => setDetailRow(null)}
        onEdit={(row) => openEditDialog(row)}
        onRestore={(row) => setRestoreRow(row)}
        onNametag={(row) => setNametagRow(row)}
        onFaceEnroll={(row) => setFaceEnrollmentRow(row)}
        onFaceAction={handleFaceProfileAction}
        canManage={canManage}
        saving={saving}
      />
      <EmployeeNametagDialog row={nametagRow} onClose={() => setNametagRow(null)} />
      <FaceEnrollmentDialog
        open={Boolean(faceEnrollmentRow)}
        saving={faceEnrollmentSubmitting}
        targetEmployee={faceEnrollmentRow ? {
          id: faceEnrollmentRow.id,
          employeeCode: faceEnrollmentRow.employeeCode,
          fullName: faceEnrollmentRow.fullName,
          divisionName: faceEnrollmentRow.divisionName,
          positionName: faceEnrollmentRow.positionName,
          photoUrl: faceEnrollmentRow.photoUrl,
        } : undefined}
        onClose={() => {
          if (!faceEnrollmentSubmitting) setFaceEnrollmentRow(null)
        }}
        onSubmit={handleEmployeeFaceEnrollmentSubmit}
      />
      <ConfirmDialog
        open={Boolean(statusRow)}
        tone="warning"
        eyebrow="Ubah Status Karyawan"
        title={statusRow ? `Jadikan ${statusRow.fullName} ${employeeStatusLabel[pendingStatus]}?` : "Ubah status karyawan?"}
        description="Status memengaruhi apakah karyawan aktif dipakai modul absensi, payroll, dan app lapangan."
        confirmLabel="Simpan Status"
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setStatusRow(null)
        }}
        onConfirm={() => {
          void handleStatusChangeEmployee(pendingStatus)
        }}
      >
        {statusRow && (
          <>
            <div className="confirmDialogPreview">
              <span>{statusRow.employeeCode}</span>
              <strong>{statusRow.fullName}</strong>
              <small>{statusRow.divisionName} / {statusRow.positionName}</small>
            </div>
            <div className="confirmRelationList">
              <button className={clsx("statusChoiceButton", pendingStatus === "active" && "active")} type="button" disabled={saving} onClick={() => setPendingStatus("active")}>Aktif</button>
              <button className={clsx("statusChoiceButton", pendingStatus === "review" && "active")} type="button" disabled={saving} onClick={() => setPendingStatus("review")}>Review</button>
              <button className={clsx("statusChoiceButton danger", pendingStatus === "inactive" && "active")} type="button" disabled={saving} onClick={() => setPendingStatus("inactive")}>Nonaktif</button>
            </div>
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(deleteRow)}
        tone="danger"
        eyebrow="Arsipkan Karyawan"
        title={deleteRow ? `Arsipkan ${deleteRow.fullName}?` : "Arsipkan karyawan?"}
        description="Data akan disembunyikan dari direktori aktif, status menjadi Nonaktif, dan foto di Storage dibersihkan bila ada."
        confirmLabel="Arsipkan Data"
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setDeleteRow(null)
        }}
        onConfirm={() => void handleDeleteEmployee()}
      >
        {deleteRow && (
          <div className="confirmDialogPreview">
            <span>{deleteRow.employeeCode}</span>
            <strong>{deleteRow.fullName}</strong>
            <small>{deleteRow.divisionName} / {deleteRow.positionName}</small>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(restoreRow)}
        icon={RotateCcw}
        eyebrow="Pulihkan Karyawan"
        title={restoreRow ? `Pulihkan ${restoreRow.fullName}?` : "Pulihkan karyawan?"}
        description="Data akan kembali muncul di direktori aktif dengan status Aktif. Foto dapat diupload ulang dari form karyawan bila sebelumnya dibersihkan saat arsip."
        confirmLabel="Pulihkan Data"
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setRestoreRow(null)
        }}
        onConfirm={() => void handleRestoreEmployee()}
      >
        {restoreRow && (
          <div className="confirmDialogPreview">
            <span>{restoreRow.employeeCode}</span>
            <strong>{restoreRow.fullName}</strong>
            <small>Diarsipkan {formatUserDateTime(restoreRow.deletedAt, "-")}</small>
          </div>
        )}
      </ConfirmDialog>
      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </OperationalPageShell>
  )
}

function KioskModePage({ activeView }: { activeView: ViewId }) {
  const [kiosks, setKiosks] = useState<AttendanceKioskOption[]>([])
  const [selectedKioskId, setSelectedKioskId] = useState("")
  const [credentialType, setCredentialType] = useState<"barcode" | "rfid">("barcode")
  const [credentialValue, setCredentialValue] = useState("")
  const [faceScore, setFaceScore] = useState("92")
  const [notes, setNotes] = useState("")
  const [result, setResult] = useState<FieldAttendanceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const scanInputRef = useRef<HTMLInputElement | null>(null)
  const scanDebounceRef = useRef<number | null>(null)
  const lastScanKeyRef = useRef("")

  const selectedKiosk = kiosks.find((kiosk) => kiosk.id === selectedKioskId)
  const mediaAllowed = selectedKiosk?.allowedMedia.includes(credentialType) ?? true
  const activeKiosks = kiosks.filter((kiosk) => kiosk.status === "active")

  const showToast = (message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() })
  }

  const fetchKiosks = async () => {
    setLoading(true)
    setErrorMessage("")
    try {
      const data = await loadAttendanceKiosks()
      setKiosks(data)
      setSelectedKioskId((current) => current || data.find((kiosk) => kiosk.status === "active")?.id || data[0]?.id || "")
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Gagal memuat data kiosk absensi."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchKiosks()
  }, [])

  useEffect(() => {
    scanInputRef.current?.focus()
  }, [selectedKioskId, credentialType])

  useEffect(() => {
    return () => {
      if (scanDebounceRef.current) window.clearTimeout(scanDebounceRef.current)
    }
  }, [])

  const focusScanField = () => {
    window.setTimeout(() => scanInputRef.current?.focus(), 80)
  }

  const processKioskScan = async (rawCredential = credentialValue) => {
    if (scanDebounceRef.current) {
      window.clearTimeout(scanDebounceRef.current)
      scanDebounceRef.current = null
    }

    const normalizedCredential = rawCredential.trim()

    if (saving || loading) return
    if (!selectedKiosk) {
      showToast({ tone: "error", title: "Pilih lokasi kerja", description: "Lokasi kerja atau pintu absensi wajib dipilih dulu." })
      focusScanField()
      return
    }
    if (!mediaAllowed) {
      showToast({ tone: "error", title: "Media tidak aktif", description: `${credentialType.toUpperCase()} tidak aktif di policy absensi ini.` })
      focusScanField()
      return
    }
    if (normalizedCredential.length < 3) {
      showToast({ tone: "error", title: "Scan belum terbaca", description: "Tempel kartu atau scan barcode sampai kode masuk ke field." })
      focusScanField()
      return
    }

    const scanKey = `${selectedKiosk.id}:${credentialType}:${normalizedCredential}`
    if (scanKey === lastScanKeyRef.current) return
    lastScanKeyRef.current = scanKey
    window.setTimeout(() => {
      if (lastScanKeyRef.current === scanKey) lastScanKeyRef.current = ""
    }, 1200)

    focusScanField()
    if (navigator.vibrate) navigator.vibrate(25)

    if (normalizedCredential.length < 6) {
      showToast({ tone: "error", title: "Kode terlalu pendek", description: "Kode barcode/RFID belum terbaca penuh." })
      lastScanKeyRef.current = ""
      focusScanField()
      return
    }

    setCredentialValue(normalizedCredential)
    setSaving(true)
    setResult(null)
    try {
      const data = await submitFieldAttendance({
        mode: "kiosk",
        eventType: "auto",
        kioskId: selectedKiosk.source === "kiosk" ? selectedKiosk.id : null,
        credentialType,
        credentialValue: normalizedCredential,
        faceScore: selectedKiosk.requireFace ? Number(faceScore) || null : null,
        notes,
      })
      setResult(data)
      setCredentialValue("")
      showToast({
        tone: data.log.status === "valid" ? "success" : "error",
        title: data.log.event_type === "check_in" ? "Check-in diproses" : "Check-out diproses",
        description: `${data.employee.code} - ${data.employee.name} di ${selectedKiosk.name}.`,
      })
      focusScanField()
    } catch (error) {
      lastScanKeyRef.current = ""
      showToast({ tone: "error", title: "Scan gagal", description: getFriendlySupabaseError(error, "Absensi kiosk belum bisa diproses.") })
      focusScanField()
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault()
    void processKioskScan()
  }

  const handleCredentialChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    setCredentialValue(nextValue)

    if (scanDebounceRef.current) {
      window.clearTimeout(scanDebounceRef.current)
      scanDebounceRef.current = null
    }

    const normalizedCredential = nextValue.trim()
    if (normalizedCredential.length < 6 || saving || loading) return

    scanDebounceRef.current = window.setTimeout(() => {
      void processKioskScan(normalizedCredential)
    }, 420)
  }

  const handleScanKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    if (saving || loading) return
    void processKioskScan()
  }

  return (
    <OperationalPageShell>
      <OperationalPageHeader
        eyebrow="Management App"
        title="Kiosk Mode"
        subtitle="Scan pertama otomatis check-in, scan berikutnya otomatis check-out di hari yang sama."
        icon={ScanLine}
        actions={(
          <button className="secondaryButton" type="button" onClick={() => void fetchKiosks()} disabled={loading}>
            <RefreshCcw size={16} />
            Refresh Kiosk
          </button>
        )}
      />

      <InlinePageStats
        items={[
          `${activeKiosks.length} lokasi aktif`,
          `${kiosks.length} pilihan pintu`,
          selectedKiosk?.policyName || "Policy belum dipilih",
          activeView === "kiosk-mode" ? "Auto check-in/out" : "Kiosk",
        ]}
      />

      <section className="kioskModeLayout">
        <form className="surfacePanel kioskTerminalPanel" onSubmit={handleSubmit}>
          <div className="kioskTerminalHeader">
            <span><ScanLine size={22} /></span>
            <div>
              <strong>Terminal Scan</strong>
              <small>{selectedKiosk?.workLocationName || "Pilih lokasi kerja"} · {selectedKiosk?.source === "kiosk" ? selectedKiosk.name : "Pintu utama"}</small>
            </div>
          </div>

          {errorMessage && <div className="formAlert error">{errorMessage}</div>}

          <div className="kioskTerminalGrid">
            <SelectFormField
              label="Lokasi Kerja / Pintu"
              value={selectedKioskId}
              onChange={(event) => {
                setSelectedKioskId(event.target.value)
                setResult(null)
                setCredentialValue("")
                focusScanField()
              }}
            >
              <option value="">Pilih lokasi kerja</option>
              {kiosks.map((kiosk) => (
                <option value={kiosk.id} key={kiosk.id}>
                  {kiosk.source === "kiosk" ? `${kiosk.workLocationName} - ${kiosk.name}` : kiosk.workLocationName}
                </option>
              ))}
            </SelectFormField>
            <SelectFormField
              label="Media Scan"
              value={credentialType}
              onChange={(event) => {
                setCredentialType(event.target.value as "barcode" | "rfid")
                setResult(null)
                setCredentialValue("")
                focusScanField()
              }}
            >
              <option value="barcode">Barcode / QR</option>
              <option value="rfid">RFID</option>
            </SelectFormField>
          </div>

          <label className="kioskScanField">
            <span>{credentialType === "barcode" ? "Scan Barcode / Nametag" : "Tap Kartu RFID"}</span>
            <input
              ref={scanInputRef}
              value={credentialValue}
              onChange={handleCredentialChange}
              onKeyDown={handleScanKeyDown}
              placeholder={credentialType === "barcode" ? "DMS-EMP-001-XXXX" : "UID kartu RFID"}
              autoComplete="off"
              autoFocus
              enterKeyHint="done"
            />
            <small className="kioskScanHint">Scanner USB/RFID diproses otomatis saat kode terbaca atau Enter terkirim. Tombol manual hanya fallback.</small>
          </label>

          <div className="kioskPolicyPreview">
            <span className={clsx("kioskPolicyPill", mediaAllowed ? "success" : "danger")}>{mediaAllowed ? "Media aktif" : "Media diblokir"}</span>
            <span><ScanFace size={14} /> {selectedKiosk?.requireFace ? "Face wajib" : "Face opsional"}</span>
            <span><MapPin size={14} /> {selectedKiosk?.requireLocation ? "Lokasi kerja aktif" : "Tanpa lokasi"}</span>
          </div>

          <div className={clsx("kioskAuxGrid", !selectedKiosk?.requireFace && "single")}>
            {selectedKiosk?.requireFace && (
              <TextFormField
                label="Face Score Kiosk"
                value={faceScore}
                onChange={(event) => setFaceScore(normalizeIntegerInput(event.target.value, 100))}
                placeholder="92"
                inputMode="numeric"
              />
            )}

            <TextFormField label="Catatan Operator" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opsional, misal scanner pintu utama" />
          </div>

          <div className="kioskTerminalActions">
            <button className="secondaryButton" type="button" onClick={() => { setCredentialValue(""); setResult(null); scanInputRef.current?.focus() }}>
              <RotateCcw size={16} />
              Reset
            </button>
            <button className="primaryButton" type="submit" disabled={saving || loading}>
              <ScanLine size={16} />
                    {saving ? "Memproses..." : "Proses Scan"}
            </button>
          </div>
        </form>

        <aside className="surfacePanel kioskResultPanel" aria-live="polite">
          <div className="kioskResultHeader">
            <span><FileCheck2 size={20} /></span>
            <div>
              <strong>Hasil Scan Terakhir</strong>
              <small>{result ? "Data berhasil dikembalikan dari Supabase." : "Belum ada scan di sesi ini."}</small>
            </div>
          </div>
          {result ? (
            <div className={clsx("kioskResultCard", result.log.status)}>
              <span className="kioskResultEvent">{result.log.event_type === "check_in" ? "Check-in" : "Check-out"}</span>
              <h3>{result.employee.name}</h3>
              <p>{result.employee.code} - {result.location.name}</p>
              <div className="kioskResultMetrics">
                <span>Status <strong>{getAttendanceLogStatusLabel(result.log.status)}</strong></span>
                <span>GPS <strong>{result.log.distance_m}m / {result.log.radius_m}m</strong></span>
                <span>Face <strong>{result.log.face_score ?? "-"}%</strong></span>
              </div>
            </div>
          ) : (
            <div className="kioskEmptyState">
              <span><ScanLine size={34} /></span>
              <div className="kioskEmptyCopy">
                <strong>Siap menerima scan</strong>
                <p>Field scan sudah fokus otomatis. Tempel kartu RFID atau scan barcode nametag, lalu sistem memproses absensi tanpa klik tombol.</p>
              </div>
              <div className="kioskEmptySteps">
                <small><b>1</b> Pilih pintu</small>
                <small><b>2</b> Pilih media</small>
                <small><b>3</b> Scan kartu</small>
              </div>
            </div>
          )}
        </aside>
      </section>

      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </OperationalPageShell>
  )
}

function BiofingerPage({ activeView, profile }: { activeView: ViewId; profile: AppAccessProfile }) {
  const [data, setData] = useState<BiofingerData>(() => biofingerDataCache ?? createEmptyBiofingerData())
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => biofingerSelectedDeviceCache || (biofingerDataCache ? biofingerDataCache.devices.length === 1 ? biofingerDataCache.devices[0].id : BIOFINGER_ALL_DEVICES : ""))
  const [activeBiofingerTab, setActiveBiofingerTab] = useState<BiofingerWorkspaceTab>(() => biofingerActiveTabCache)
  const [statusFilter, setStatusFilter] = useState<"all" | BiofingerLinkStatus>(() => biofingerStatusFilterCache)
  const [searchTerm, setSearchTerm] = useState(() => biofingerSearchTermCache)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => biofingerPageSizeCache)
  const [editingDeviceId, setEditingDeviceId] = useState("")
  const [mappingDetailId, setMappingDetailId] = useState("")
  const [mappingDraftEmployeeId, setMappingDraftEmployeeId] = useState("")
  const [deviceFormValues, setDeviceFormValues] = useState({ name: "", workLocationId: "", status: "active" })
  const [loading, setLoading] = useState(() => !biofingerDataCache)
  const [savingId, setSavingId] = useState("")
  const [savingDeviceId, setSavingDeviceId] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const canManage = hasPermission(profile, "biofinger.manage") || hasPermission(profile, "attendance.review") || hasPermission(profile, "employees.manage")

  const showToast = (message: Omit<ToastMessage, "id">) => {
    setToast({ id: Date.now(), ...message })
  }

  const commitBiofingerData = useCallback((next: BiofingerDataUpdater) => {
    setData((current) => {
      const resolved = typeof next === "function" ? (next as (current: BiofingerData) => BiofingerData)(current) : next
      biofingerDataCache = resolved
      return resolved
    })
  }, [])

  const refreshData = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      const nextData = await loadBiofingerData()
      commitBiofingerData(nextData)
      setSelectedDeviceId((current) => {
        if (current === BIOFINGER_ALL_DEVICES) return current
        if (current && nextData.devices.some((device) => device.id === current)) return current
        return nextData.devices.length === 1 ? nextData.devices[0].id : BIOFINGER_ALL_DEVICES
      })
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Data Biofinger belum bisa dimuat."))
    } finally {
      setLoading(false)
    }
  }, [commitBiofingerData])

  useEffect(() => {
    if (biofingerDataCache) return
    void refreshData()
  }, [refreshData])

  useEffect(() => {
    biofingerSelectedDeviceCache = selectedDeviceId
  }, [selectedDeviceId])

  useEffect(() => {
    biofingerActiveTabCache = activeBiofingerTab
  }, [activeBiofingerTab])

  useEffect(() => {
    biofingerStatusFilterCache = statusFilter
  }, [statusFilter])

  useEffect(() => {
    biofingerSearchTermCache = searchTerm
  }, [searchTerm])

  useEffect(() => {
    biofingerPageSizeCache = pageSize
  }, [pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedDeviceId, statusFilter, pageSize])

  const biofingerDataLoading = loading && !biofingerDataCache
  const biofingerDataValue = (value: ReactNode, className?: string) => biofingerDataLoading ? <FoundationSkeleton className={className} /> : value
  const biofingerInlineLoadingStats = (count: number) => Array.from({ length: count }).map((_, index) => <FoundationSkeleton className={clsx("inline", index === 0 && "wide")} key={index} />)
  const normalizedTerm = searchTerm.trim().toLowerCase()
  const isAllDeviceSelected = !selectedDeviceId || selectedDeviceId === BIOFINGER_ALL_DEVICES
  const selectedDevice = data.devices.find((device) => device.id === selectedDeviceId)
  const editingDevice = data.devices.find((device) => device.id === editingDeviceId) || null
  const mappingDetailRow = data.links.find((row) => row.id === mappingDetailId) || null
  const mappingDetailDevice = mappingDetailRow ? data.devices.find((device) => device.id === mappingDetailRow.attendanceDeviceId) || null : null
  const mappingDraftEmployee = data.employees.find((employee) => employee.id === mappingDraftEmployeeId) || null
  const mappingEmployeeConflict = mappingDetailRow && mappingDraftEmployeeId
    ? data.links.find((row) => row.id !== mappingDetailRow.id && row.employeeId === mappingDraftEmployeeId && row.status === "active") || null
    : null
  const deviceLinks = !isAllDeviceSelected ? data.links.filter((row) => row.attendanceDeviceId === selectedDeviceId) : data.links
  const filteredLinks = deviceLinks.filter((row) => {
    const matchesStatus = statusFilter === "all" || row.status === statusFilter
    const searchableText = [
      row.externalUserId,
      row.externalName,
      row.employeeCode,
      row.employeeName,
      row.status,
    ].join(" ").toLowerCase()

    return matchesStatus && (!normalizedTerm || searchableText.includes(normalizedTerm))
  })
  const safePageSize = Math.min(50, Math.max(1, pageSize))
  const pageCount = Math.max(1, Math.ceil(filteredLinks.length / safePageSize))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), pageCount)
  const paginatedLinks = filteredLinks.slice((safeCurrentPage - 1) * safePageSize, safeCurrentPage * safePageSize)
  const deviceEvents = !isAllDeviceSelected ? data.events.filter((event) => event.attendanceDeviceId === selectedDeviceId) : data.events
  const mappingDetailEvents = mappingDetailRow
    ? data.events.filter((event) => event.attendanceDeviceId === mappingDetailRow.attendanceDeviceId && event.externalUserId === mappingDetailRow.externalUserId).slice(0, 6)
    : []
  const activeLinks = data.links.filter((row) => row.status === "active" && row.employeeId).length
  const pendingLinks = data.links.filter((row) => row.status === "pending").length
  const ignoredLinks = data.links.filter((row) => row.status === "ignored").length
  const scopedActiveLinks = deviceLinks.filter((row) => row.status === "active" && row.employeeId).length
  const scopedPendingLinks = deviceLinks.filter((row) => row.status === "pending").length
  const mappedEvents = data.events.filter((event) => event.employeeId).length
  const totalRawEvents = data.eventCount || data.events.length
  const syncSteps = [
    {
      label: "Baca Mesin",
      value: biofingerDataValue(isAllDeviceSelected ? `${formatNumber(data.devices.length)} device ready` : selectedDevice ? `${selectedDevice.ipAddress}:${selectedDevice.port}` : "Belum pilih", "stepValue"),
      description: "Local agent AT-301",
      icon: Fingerprint,
      complete: !biofingerDataLoading && data.devices.length > 0,
    },
    {
      label: "Import User",
      value: biofingerDataValue(`${formatNumber(deviceLinks.length)} ID synced`, "stepValue"),
      description: biofingerDataValue(`${formatNumber(scopedPendingLinks)} menunggu mapping`, "caption"),
      icon: Download,
      complete: !biofingerDataLoading && deviceLinks.length > 0,
    },
    {
      label: "Mapping DMS",
      value: biofingerDataValue(`${formatNumber(scopedActiveLinks)} mapped`, "stepValue"),
      description: "User ID ke karyawan",
      icon: UserRoundCheck,
      complete: !biofingerDataLoading && scopedActiveLinks > 0,
    },
    {
      label: "Staging Event",
      value: biofingerDataValue(`${formatNumber(isAllDeviceSelected ? totalRawEvents : deviceEvents.length)} log`, "stepValue"),
      description: "Siap proses absensi",
      icon: Database,
      complete: !biofingerDataLoading && (isAllDeviceSelected ? totalRawEvents : deviceEvents.length) > 0,
    },
  ]
  const deviceOptions = biofingerDataLoading
    ? [{ value: "", label: <FoundationSkeleton className="selectValue" />, searchLabel: "memuat device", disabled: true }]
    : [
      { value: BIOFINGER_ALL_DEVICES, label: "Semua device", searchLabel: "semua device", description: `${formatNumber(data.devices.length)} device registry` },
      ...data.devices.map((device) => ({
        value: device.id,
        label: device.name,
        searchLabel: `${device.name} ${device.workLocationName} ${device.serialNumber} ${device.deviceCode} ${device.ipAddress}`,
        description: `${device.workLocationName || "Belum pilih lokasi"} / ${device.serialNumber || device.deviceCode}`,
      })),
    ]
  const workLocationOptions = [
    { value: "", label: "Belum pilih lokasi", searchLabel: "belum pilih lokasi" },
    ...data.workLocations.map((location) => ({
      value: location.id,
      label: location.name,
      searchLabel: `${location.code} ${location.name}`,
      description: `${location.code || "LOC"} / ${location.isActive ? "Aktif" : "Nonaktif"}`,
    })),
  ]
  const deviceStatusOptions = [
    { value: "active", label: "Active", searchLabel: "active aktif" },
    { value: "maintenance", label: "Maintenance", searchLabel: "maintenance perawatan" },
    { value: "inactive", label: "Inactive", searchLabel: "inactive nonaktif" },
  ]
  const statusOptions: Array<{ value: "all" | BiofingerLinkStatus; label: string; searchLabel: string }> = [
    { value: "all", label: "Semua Status", searchLabel: "semua status" },
    { value: "pending", label: "Pending", searchLabel: "pending belum mapped" },
    { value: "active", label: "Active", searchLabel: "active mapped" },
    { value: "ignored", label: "Ignored", searchLabel: "ignored diabaikan" },
    { value: "inactive", label: "Inactive", searchLabel: "inactive nonaktif" },
  ]
  const employeeOptions = [
    { value: "", label: "Pilih karyawan DMS", searchLabel: "pilih karyawan dms" },
    ...data.employees.map((employee) => ({
      value: employee.id,
      label: (
        <span className="biofingerEmployeeOptionLabel">
          <span className="biofingerEmployeeOptionHeader">
            <span className="biofingerEmployeeOptionName">{employee.fullName}</span>
            <span className={clsx("biofingerEmployeeOptionStatus", employee.status === "active" && "active")} title={employee.status === "active" ? "Aktif" : employee.status} aria-label={employee.status === "active" ? "Aktif" : employee.status} />
          </span>
          <small>{employee.employeeCode}</small>
        </span>
      ),
      searchLabel: `${employee.employeeCode} ${employee.fullName} ${employee.status}`,
    })),
  ]
  const biofingerTabs: Array<{ id: BiofingerWorkspaceTab; label: string; icon: LucideIcon; count?: ReactNode }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, count: biofingerDataLoading ? <FoundationSkeleton className="tabCount" /> : data.devices.length },
    { id: "devices", label: "Device", icon: Fingerprint, count: biofingerDataLoading ? <FoundationSkeleton className="tabCount" /> : data.devices.length },
    { id: "mapping", label: "Mapping User", icon: UserRoundCheck, count: biofingerDataLoading ? <FoundationSkeleton className="tabCount" /> : deviceLinks.length },
    { id: "events", label: "Raw Event", icon: Database, count: biofingerDataLoading ? <FoundationSkeleton className="tabCount" /> : isAllDeviceSelected ? totalRawEvents : deviceEvents.length },
  ]
  const selectedDeviceTitle = biofingerDataLoading ? "Memuat data device" : selectedDevice ? selectedDevice.name : "Semua device Biofinger"
  const selectedDeviceSubtitle = biofingerDataLoading
    ? "Device registry dari Supabase"
    : selectedDevice
    ? `${selectedDevice.workLocationName || "Belum pilih lokasi"} / ${selectedDevice.ipAddress}:${selectedDevice.port} / ${selectedDevice.status}`
    : `${formatNumber(data.devices.length)} device registry / ${formatNumber(data.workLocations.length)} lokasi kerja`

  const resetFilters = () => {
    setSearchTerm("")
    setStatusFilter("all")
    setSelectedDeviceId(BIOFINGER_ALL_DEVICES)
  }

  const openDeviceDialog = (device: BiofingerDeviceRow) => {
    setEditingDeviceId(device.id)
    setDeviceFormValues({
      name: device.name,
      workLocationId: device.workLocationId,
      status: device.status,
    })
  }

  const closeDeviceDialog = () => {
    if (savingDeviceId) return
    setEditingDeviceId("")
  }

  const openMappingDrawer = (row: BiofingerUserLinkRow) => {
    setMappingDetailId(row.id)
    setMappingDraftEmployeeId(row.employeeId)
  }

  const closeMappingDrawer = () => {
    if (savingId) return
    setMappingDetailId("")
    setMappingDraftEmployeeId("")
  }

  const handleDeviceSave = async () => {
    if (!editingDevice) return
    setSavingDeviceId(editingDevice.id)
    try {
      await updateBiofingerDeviceRegistry(editingDevice.id, deviceFormValues)
      const nextName = deviceFormValues.name.trim()
      const workLocation = data.workLocations.find((location) => location.id === deviceFormValues.workLocationId)
      commitBiofingerData((current) => ({
        ...current,
        devices: current.devices.map((device) => device.id === editingDevice.id
          ? {
            ...device,
            name: nextName,
            workLocationId: deviceFormValues.workLocationId,
            workLocationName: workLocation?.name || "",
            status: deviceFormValues.status || "active",
          }
          : device),
      }))
      showToast({
        tone: "success",
        title: "Device diperbarui",
        description: `${nextName} sudah tersimpan di registry Biofinger.`,
      })
      setEditingDeviceId("")
    } catch (error) {
      showToast({ tone: "error", title: "Gagal update device", description: getFriendlySupabaseError(error, "Device registry belum bisa disimpan.") })
    } finally {
      setSavingDeviceId("")
    }
  }

  const handleEmployeeChange = async (row: BiofingerUserLinkRow, employeeId: string) => {
    setSavingId(row.id)
    try {
      await updateBiofingerUserLink(row, employeeId, employeeId ? "active" : "pending")
      const employee = data.employees.find((item) => item.id === employeeId)
      const nextStatus: BiofingerLinkStatus = employeeId ? "active" : "pending"
      const syncedAt = new Date().toISOString()
      commitBiofingerData((current) => ({
        ...current,
        links: current.links.map((link) => link.id === row.id
          ? {
            ...link,
            employeeId,
            employeeCode: employee?.employeeCode || "",
            employeeName: employee?.fullName || "",
            status: nextStatus,
            matchedBy: "manual",
            lastSyncedAt: syncedAt,
          }
          : link),
        events: current.events.map((event) => event.attendanceDeviceId === row.attendanceDeviceId && event.externalUserId === row.externalUserId
          ? {
            ...event,
            employeeId,
            employeeCode: employee?.employeeCode || "",
            employeeName: employee?.fullName || "",
            importStatus: employeeId ? "mapped" : "pending",
          }
          : event),
      }))
      showToast({
        tone: "success",
        title: employeeId ? "Mapping aktif" : "Mapping dikosongkan",
        description: employeeId ? `${row.externalUserId} sudah terhubung ke karyawan DMS.` : `${row.externalUserId} kembali ke pending.`,
      })
      return true
    } catch (error) {
      showToast({ tone: "error", title: "Gagal mapping Biofinger", description: getFriendlySupabaseError(error, "Mapping belum bisa disimpan.") })
      return false
    } finally {
      setSavingId("")
    }
  }

  const handleMappingDrawerSubmit = async () => {
    if (!mappingDetailRow) return
    if (mappingEmployeeConflict) {
      showToast({
        tone: "error",
        title: "Karyawan sudah terpakai",
        description: `${mappingDraftEmployee?.fullName || "Karyawan ini"} sudah aktif di User ID ${mappingEmployeeConflict.externalUserId}.`,
      })
      return
    }

    const saved = await handleEmployeeChange(mappingDetailRow, mappingDraftEmployeeId)
    if (saved) closeMappingDrawer()
  }

  const handleStatusChange = async (row: BiofingerUserLinkRow, status: BiofingerLinkStatus) => {
    setSavingId(row.id)
    try {
      const employeeId = status === "active" ? row.employeeId : ""
      await updateBiofingerUserLink(row, employeeId, status)
      const nextImportStatus: BiofingerImportStatus = status === "ignored" ? "ignored" : employeeId ? "mapped" : "pending"
      const syncedAt = new Date().toISOString()
      commitBiofingerData((current) => ({
        ...current,
        links: current.links.map((link) => link.id === row.id
          ? {
            ...link,
            employeeId,
            employeeCode: status === "active" ? link.employeeCode : "",
            employeeName: status === "active" ? link.employeeName : "",
            status,
            matchedBy: "manual",
            lastSyncedAt: syncedAt,
          }
          : link),
        events: current.events.map((event) => event.attendanceDeviceId === row.attendanceDeviceId && event.externalUserId === row.externalUserId
          ? {
            ...event,
            employeeId,
            employeeCode: status === "active" ? event.employeeCode : "",
            employeeName: status === "active" ? event.employeeName : "",
            importStatus: nextImportStatus,
          }
          : event),
      }))
      showToast({
        tone: "success",
        title: status === "ignored" ? "User diabaikan" : "Status mapping diperbarui",
        description: `${row.externalUserId} sekarang ${status}.`,
      })
    } catch (error) {
      showToast({ tone: "error", title: "Gagal ubah status", description: getFriendlySupabaseError(error, "Status mapping belum bisa disimpan.") })
    } finally {
      setSavingId("")
    }
  }

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Mapping user fingerprint AT-301 ke master karyawan DMS sebelum raw event dikonversi ke absensi payroll."
        actions={
          <button className="secondaryButton" type="button" onClick={() => void refreshData()} disabled={loading}>
            <RefreshCcw size={17} />
            Refresh Data
          </button>
        }
        meta={
          <InlinePageStats
            items={biofingerDataLoading
              ? biofingerInlineLoadingStats(4)
              : [
                `${formatNumber(data.links.length)} ID mesin`,
                `${formatNumber(activeLinks)} mapped`,
                `${formatNumber(pendingLinks)} pending`,
                `${formatNumber(totalRawEvents)} raw event`,
              ]}
          />
        }
      />

      {!data.schemaReady ? (
        <OperationalTableCard>
          <TableState
            title="Migration Biofinger belum diterapkan"
            description="Apply migration 20260824000100_biofinger_attendance_foundation.sql sebelum mapping device bisa dipakai di Supabase."
            icon={Fingerprint}
            tone="danger"
          />
        </OperationalTableCard>
      ) : (
        <>
          <OperationalKpiGrid>
            <OperationalKpiCard label="Total Device" value={biofingerDataValue(data.devices.length, "metricValue")} detail="Registry mesin AT-301" icon={Fingerprint} tone="blue" />
            <OperationalKpiCard label="User Mapped" value={biofingerDataValue(activeLinks, "metricValue")} detail="Siap jadi absensi" icon={UserRoundCheck} tone="green" />
            <OperationalKpiCard label="Belum Mapping" value={biofingerDataValue(pendingLinks, "metricValue")} detail="Perlu pilih karyawan" icon={AlertTriangle} tone="amber" />
            <OperationalKpiCard label="Event Staging" value={biofingerDataValue(formatNumber(totalRawEvents), "metricValue wide")} detail={!biofingerDataLoading && ignoredLinks ? `${ignoredLinks} user ignored` : "Raw log mesin"} icon={FileBarChart} tone="violet" />
          </OperationalKpiGrid>

          <section className="surfacePanel biofingerScopePanel">
            <div className="biofingerScopeIntro">
              <span className="biofingerPanelLabel">Filter Aktif</span>
              <div className="biofingerScopePicker">
                <div className="biofingerDeviceIdentity">
                  <span><Fingerprint size={17} /></span>
                  <div>
                    <strong>{selectedDeviceTitle}</strong>
                    <small>{selectedDeviceSubtitle}</small>
                  </div>
                </div>
                <FoundationSelect
                  label="Filter device Biofinger"
                  value={selectedDeviceId}
                  options={deviceOptions}
                  disabled={biofingerDataLoading}
                  onChange={setSelectedDeviceId}
                />
              </div>
            </div>
            <div className="biofingerScopeStats">
              <div>
                <span>Lokasi Kerja</span>
                <strong>{biofingerDataValue(selectedDevice ? selectedDevice.workLocationName || "Belum pilih lokasi" : `${formatNumber(data.workLocations.length)} lokasi`, "scopeValue")}</strong>
              </div>
              <div>
                <span>Mapping Scope</span>
                <strong>{biofingerDataValue(`${formatNumber(scopedActiveLinks)} / ${formatNumber(deviceLinks.length)} active`, "scopeValue")}</strong>
              </div>
              <div>
                <span>Pending</span>
                <strong>{biofingerDataValue(`${formatNumber(scopedPendingLinks)} user`, "scopeValue short")}</strong>
              </div>
              <div>
                <span>Raw Event</span>
                <strong>{biofingerDataValue(`${formatNumber(isAllDeviceSelected ? totalRawEvents : deviceEvents.length)} log`, "scopeValue short")}</strong>
              </div>
            </div>
            {selectedDevice && (
              <button className="secondaryButton" type="button" disabled={!canManage} onClick={() => openDeviceDialog(selectedDevice)}>
                <Settings size={16} />
                Setting Device
              </button>
            )}
          </section>

          <div className="biofingerWorkspaceTabs">
            <CategoryTabs
              items={biofingerTabs}
              activeId={activeBiofingerTab}
              ariaLabel="Area kerja Biofinger"
              onChange={setActiveBiofingerTab}
            />
          </div>

          {activeBiofingerTab === "overview" && (
            <section className="surfacePanel biofingerSyncPanel">
              <div className="biofingerSyncHeader">
                <div>
                  <h2>Sync Pipeline</h2>
                  <p>{biofingerDataLoading ? "Menunggu data sinkronisasi dari Supabase." : selectedDevice ? `${selectedDevice.name} / ${selectedDevice.ipAddress}:${selectedDevice.port} / last sync ${formatUserDateTime(selectedDevice.lastSyncAt, "Belum sync")}` : `${formatNumber(data.devices.length)} device / sample terakhir / last sync mengikuti masing-masing device.`}</p>
                </div>
                <InlinePageStats items={biofingerDataLoading ? biofingerInlineLoadingStats(2) : [`${formatNumber(mappedEvents)} sample mapped`, `${formatNumber(data.events.length)} sample tampil`]} />
              </div>
              <div className="biofingerSyncSteps">
                {syncSteps.map((step) => {
                  const Icon = step.icon
                  return (
                    <div className={clsx("biofingerSyncStep", step.complete && "complete")} key={step.label}>
                      <span><Icon size={17} /></span>
                      <div>
                        <small>{step.label}</small>
                        <strong>{step.value}</strong>
                        <em>{step.description}</em>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {activeBiofingerTab === "devices" && (
            <section className="surfacePanel biofingerDeviceRegistryPanel">
              <div className="biofingerSyncHeader">
                <div>
                  <h2>Device Registry</h2>
                  <p>Nama display, lokasi kerja, koneksi, dan status mesin Biofinger.</p>
                </div>
                <InlinePageStats items={biofingerDataLoading ? biofingerInlineLoadingStats(2) : [`${data.devices.length} device`, `${data.workLocations.length} lokasi kerja`]} />
              </div>
              <div className="biofingerDeviceRegistryList">
                {biofingerDataLoading && (
                  Array.from({ length: 2 }).map((_, index) => (
                    <div className="biofingerDeviceRegistryRow biofingerDeviceRegistrySkeletonRow" key={index} aria-hidden="true">
                      <div className="biofingerDeviceIdentity">
                        <FoundationSkeleton className="avatar" />
                        <div className="biofingerDeviceSkeletonCopy">
                          <FoundationSkeleton className="text wide" />
                          <FoundationSkeleton className="text medium" />
                        </div>
                      </div>
                      <FoundationSkeleton className="text medium" />
                      <FoundationSkeleton className="text medium" />
                      <FoundationSkeleton className="status" />
                      <FoundationSkeleton className="button" />
                    </div>
                  ))
                )}
                {!biofingerDataLoading && data.devices.length === 0 && (
                  <div className="biofingerDeviceRegistryRow biofingerDataLoadingRow">
                    <div className="biofingerDeviceIdentity">
                      <span><Search size={17} /></span>
                      <div>
                        <strong>Belum ada device</strong>
                        <small>Tambahkan registry Biofinger AT-301 sebelum mapping user.</small>
                      </div>
                    </div>
                  </div>
                )}
                {!biofingerDataLoading && data.devices.map((device) => (
                  <div className="biofingerDeviceRegistryRow" key={device.id}>
                    <div className="biofingerDeviceIdentity">
                      <span><Fingerprint size={17} /></span>
                      <div>
                        <strong>{device.name}</strong>
                        <small>{device.deviceCode} / {device.model || "AT-301"} / {device.serialNumber || "Serial belum ada"}</small>
                      </div>
                    </div>
                    <div className="biofingerRegistryMeta">
                      <span>Lokasi Kerja</span>
                      <strong>{device.workLocationName || "Belum pilih lokasi"}</strong>
                    </div>
                    <div className="biofingerRegistryMeta">
                      <span>Koneksi</span>
                      <strong>{device.ipAddress}:{device.port}</strong>
                    </div>
                    <div className="biofingerRegistryMeta">
                      <span>Status</span>
                      <BiofingerDeviceStatusText status={device.status} />
                    </div>
                    <button className="secondaryButton" type="button" disabled={!canManage} onClick={() => openDeviceDialog(device)}>
                      <Pencil size={16} />
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeBiofingerTab === "mapping" && (
            <>
              <OperationalFilterPanel className="biofingerFilterPanel">
                <div className="filterField">
                  <label>Search</label>
                  <div className="uiInput inputWithIcon compact">
                    <Search size={16} />
                    <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari User ID, nama mesin, atau karyawan..." />
                  </div>
                </div>
                <div className="filterField">
                  <label>Status</label>
                  <FoundationSelect
                    label="Status mapping Biofinger"
                    value={statusFilter}
                    options={statusOptions}
                    searchable={false}
                    onChange={(nextValue) => setStatusFilter(nextValue as typeof statusFilter)}
                  />
                </div>
                <button className="secondaryButton" type="button" onClick={resetFilters}>Reset Filter</button>
              </OperationalFilterPanel>

              <OperationalTableCard>
                <div className="tableHeader">
                  <div>
                    <h2>Mapping User Biofinger</h2>
                    <p>{biofingerDataLoading ? "Mengambil user mesin dan mapping karyawan dari Supabase." : selectedDevice ? `${selectedDevice.ipAddress}:${selectedDevice.port} / ${selectedDevice.status} / sync ${formatUserDateTime(selectedDevice.lastSyncAt, "Belum sync")}` : "Semua device / mapping user mesin ke karyawan DMS."}</p>
                  </div>
                  <InlinePageStats items={biofingerDataLoading ? biofingerInlineLoadingStats(3) : [`${filteredLinks.length} user`, `${scopedActiveLinks} active`, `${scopedPendingLinks} pending`]} />
                </div>
                <div className="tableScroller uiDataTableScroller uiDataTableHasColumns biofingerMappingTableScroller">
                  <table>
                    <colgroup>
                      <col className="tableNumberColumn" />
                      <col style={{ width: "170px" }} />
                      <col style={{ width: "260px" }} />
                      <col style={{ width: "320px" }} />
                      <col style={{ width: "130px" }} />
                      <col style={{ width: "160px" }} />
                      <col className="tableActionColumn" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="tableNumberHeader">No</th>
                        <th>User ID Mesin</th>
                        <th>Nama di Mesin</th>
                        <th>Karyawan DMS</th>
                        <th>Status</th>
                        <th>Sync</th>
                        <th className="tableActionHeader">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {biofingerDataLoading && <FoundationTableSkeletonRows colSpan={7} columns={7} />}
                      {!biofingerDataLoading && errorMessage && (
                        <tr>
                          <td className="tableStateCell" colSpan={7}>
                            <TableState title="Gagal memuat Biofinger" description={errorMessage} icon={AlertTriangle} tone="danger" />
                          </td>
                        </tr>
                      )}
                      {!biofingerDataLoading && !errorMessage && filteredLinks.length === 0 && (
                        <tr>
                          <td className="tableStateCell" colSpan={7}>
                            <TableState title="Belum ada user Biofinger" description="Import user AT-301 ke staging sebelum mapping ke karyawan DMS." icon={Search} />
                          </td>
                        </tr>
                      )}
                      {!biofingerDataLoading && !errorMessage && paginatedLinks.map((row, index) => (
                        <ClickableTableRow key={row.id} label={`Mapping Biofinger ${row.externalUserId}`} onOpen={() => openMappingDrawer(row)}>
                          <td className="tableNumberCell"><TableNumberCell value={(safeCurrentPage - 1) * safePageSize + index + 1} /></td>
                          <td><TableText primary={row.externalUserId} secondary={row.externalUid === null ? "UID -" : `UID ${row.externalUid}`} /></td>
                          <td><TableText primary={row.externalName || "Tanpa nama"} secondary={row.privilege === 14 ? "Admin device" : `Privilege ${row.privilege ?? "-"}`} /></td>
                          <td>
                            <BiofingerEmployeeMappingChip row={row} disabled={!canManage || savingId === row.id} onClick={() => openMappingDrawer(row)} />
                          </td>
                          <td><BiofingerLinkStatusText status={row.status} /></td>
                          <td><TableText primary={formatUserDateTime(row.lastSyncedAt, "-")} secondary={row.matchedBy} /></td>
                          <td className="tableActionCell">
                            <div className="rowActions">
                              <RowActionMenu label={`Aksi mapping ${row.externalUserId}`}>
                                <RowActionMenuItem disabled={!canManage || savingId === row.id} onClick={() => openMappingDrawer(row)}>
                                  <Pencil size={15} />
                                  Edit Mapping
                                </RowActionMenuItem>
                              </RowActionMenu>
                            </div>
                          </td>
                        </ClickableTableRow>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!biofingerDataLoading && (
                  <DataTablePagination page={safeCurrentPage} pageSize={safePageSize} totalRows={filteredLinks.length} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
                )}
              </OperationalTableCard>
            </>
          )}

          {activeBiofingerTab === "events" && (
            <OperationalTableCard>
              <div className="tableHeader">
                <div>
                  <h2>Raw Event Terakhir</h2>
                  <p>{biofingerDataLoading ? "Mengambil sample event fingerprint dari Supabase." : selectedDevice ? `${selectedDevice.name} / event sample dari mesin ini.` : "Semua device / 200 sample terakhir dari staging Biofinger."}</p>
                </div>
                <InlinePageStats items={biofingerDataLoading ? biofingerInlineLoadingStats(2) : [`${deviceEvents.length} event sample`, selectedDevice?.deviceCode || "Semua device"]} />
              </div>
              <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
                <table>
                  <colgroup>
                    <col className="tableNumberColumn" />
                    <col style={{ width: "150px" }} />
                    <col style={{ width: "190px" }} />
                    <col style={{ width: "240px" }} />
                    <col style={{ width: "150px" }} />
                    <col style={{ width: "140px" }} />
                    <col style={{ width: "150px" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="tableNumberHeader">No</th>
                      <th>User ID</th>
                      <th>Waktu Mesin</th>
                      <th>Karyawan</th>
                      <th>Event</th>
                      <th>Status Import</th>
                      <th>Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {biofingerDataLoading && <FoundationTableSkeletonRows colSpan={7} columns={7} />}
                    {!biofingerDataLoading && errorMessage && (
                      <tr>
                        <td className="tableStateCell" colSpan={7}>
                          <TableState title="Gagal memuat raw event" description={errorMessage} icon={AlertTriangle} tone="danger" />
                        </td>
                      </tr>
                    )}
                    {!biofingerDataLoading && !errorMessage && deviceEvents.length === 0 && (
                      <tr>
                        <td className="tableStateCell" colSpan={7}>
                          <TableState title="Belum ada raw event" description="Import JSONL AT-301 ke staging untuk melihat event fingerprint." icon={Fingerprint} />
                        </td>
                      </tr>
                    )}
                    {!biofingerDataLoading && !errorMessage && deviceEvents.map((event, index) => (
                      <tr key={event.id}>
                        <td className="tableNumberCell"><TableNumberCell value={index + 1} /></td>
                        <td><TableText primary={event.externalUserId} secondary={`Punch ${event.punch ?? "-"}`} /></td>
                        <td><TableText primary={formatUserDateTime(event.deviceEventAt, "-")} secondary={event.attendanceDate} /></td>
                        <td><TableText primary={event.employeeName || "Belum mapped"} secondary={event.employeeCode || "Pending"} /></td>
                        <td><TableText primary={<BiofingerEventText type={event.normalizedEventType} />} secondary={`Status ${event.statusCode ?? "-"}`} /></td>
                        <td><ModuleStatusBadge value={event.importStatus} /></td>
                        <td><TableText primary={formatShortId(event.sourceHash, "HASH")} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </OperationalTableCard>
          )}
        </>
      )}

      <BiofingerDeviceDialog
        device={editingDevice}
        values={deviceFormValues}
        workLocationOptions={workLocationOptions}
        statusOptions={deviceStatusOptions}
        saving={Boolean(savingDeviceId)}
        canManage={canManage}
        onChange={(values) => setDeviceFormValues((current) => ({ ...current, ...values }))}
        onClose={closeDeviceDialog}
        onSubmit={() => void handleDeviceSave()}
      />

      <BiofingerMappingDrawer
        row={mappingDetailRow}
        device={mappingDetailDevice}
        events={mappingDetailEvents}
        employeeOptions={employeeOptions}
        selectedEmployeeId={mappingDraftEmployeeId}
        selectedEmployee={mappingDraftEmployee}
        conflictRow={mappingEmployeeConflict}
        saving={Boolean(mappingDetailRow && savingId === mappingDetailRow.id)}
        canManage={canManage}
        onChangeEmployee={setMappingDraftEmployeeId}
        onClose={closeMappingDrawer}
        onSubmit={() => void handleMappingDrawerSubmit()}
        onIgnore={(row) => {
          setMappingDraftEmployeeId("")
          void handleStatusChange(row, "ignored")
        }}
        onPending={(row) => {
          setMappingDraftEmployeeId("")
          void handleStatusChange(row, "pending")
        }}
      />

      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </OperationalPageShell>
  )
}

function BiofingerMappingDrawer({
  row,
  device,
  events,
  employeeOptions,
  selectedEmployeeId,
  selectedEmployee,
  conflictRow,
  saving,
  canManage,
  onChangeEmployee,
  onClose,
  onSubmit,
  onIgnore,
  onPending,
}: {
  row: BiofingerUserLinkRow | null
  device: BiofingerDeviceRow | null
  events: BiofingerEventRow[]
  employeeOptions: Array<{ value: string; label: ReactNode; searchLabel: string }>
  selectedEmployeeId: string
  selectedEmployee: BiofingerEmployeeOption | null
  conflictRow: BiofingerUserLinkRow | null
  saving: boolean
  canManage: boolean
  onChangeEmployee: (employeeId: string) => void
  onClose: () => void
  onSubmit: () => void
  onIgnore: (row: BiofingerUserLinkRow) => void
  onPending: (row: BiofingerUserLinkRow) => void
}) {
  if (!row) return null

  const nextStatus: BiofingerLinkStatus = selectedEmployeeId ? "active" : "pending"
  const hasMappingChange = selectedEmployeeId !== row.employeeId || row.status !== nextStatus
  const replaceWarning = Boolean(row.employeeId && selectedEmployeeId && selectedEmployeeId !== row.employeeId)
  const saveDisabled = !canManage || saving || Boolean(conflictRow) || !hasMappingChange || (!selectedEmployeeId && !row.employeeId)

  return createPortal(
    <div className="dialogBackdrop biofingerDrawerBackdrop" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <aside
        className="dialogPanel biofingerMappingDrawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="biofinger-mapping-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="iconButton dialogClose" type="button" aria-label="Tutup detail mapping" disabled={saving} onClick={onClose}>
          <X size={18} />
        </button>

        <div className="biofingerDrawerHeader">
          <span className="dialogEyebrow"><UserRoundCheck size={15} /> Mapping Control</span>
          <h2 id="biofinger-mapping-title">User ID {row.externalUserId}</h2>
          <p>{row.externalName || "Tanpa nama di mesin"} / {device?.name || "Device belum terdaftar"}</p>
        </div>

        <div className="biofingerDrawerBody">
          <section className="biofingerDrawerSection">
            <h3>Identitas Mesin</h3>
            <div className="biofingerDrawerFacts">
              <div>
                <span>User ID</span>
                <strong>{row.externalUserId}</strong>
              </div>
              <div>
                <span>UID</span>
                <strong>{row.externalUid ?? "-"}</strong>
              </div>
              <div>
                <span>Privilege</span>
                <strong>{row.privilege === 14 ? "Admin device" : row.privilege ?? "-"}</strong>
              </div>
              <div>
                <span>Status</span>
                <BiofingerLinkStatusText status={row.status} />
              </div>
            </div>
          </section>

          <section className="biofingerDrawerSection">
            <h3>Device</h3>
            <div className="biofingerDrawerDevice">
              <span><Fingerprint size={16} /></span>
              <div>
                <strong>{device?.name || "Device tidak ditemukan"}</strong>
                <small>{device ? `${device.ipAddress}:${device.port} / ${device.workLocationName || "Belum pilih lokasi"}` : row.attendanceDeviceId}</small>
              </div>
            </div>
          </section>

          <section className="biofingerDrawerSection">
            <h3>Mapping DMS</h3>
            <div className={clsx("biofingerDrawerCurrentMapping", row.employeeId && "mapped")}>
              <span>{row.employeeId ? <UserRoundCheck size={17} /> : <UserPlus size={17} />}</span>
              <div>
                <strong>{row.employeeId ? row.employeeName || "Karyawan dipilih" : "Belum terhubung ke karyawan"}</strong>
                <small>{row.employeeId ? row.employeeCode || "Mapped manual" : "Pilih karyawan lalu simpan untuk mengaktifkan mapping."}</small>
              </div>
            </div>

            <label className="formField biofingerDrawerSelectField">
              <span>Karyawan DMS</span>
              <FoundationSelect
                label={`Pilih karyawan untuk User ID ${row.externalUserId}`}
                value={selectedEmployeeId}
                options={employeeOptions}
                disabled={!canManage || saving}
                onChange={onChangeEmployee}
              />
            </label>

            {selectedEmployee && (
              <div className="biofingerDrawerSelectedEmployee">
                <span className="biofingerEmployeeOptionStatus active" />
                <strong>{selectedEmployee.fullName}</strong>
                <small>{selectedEmployee.employeeCode}</small>
              </div>
            )}

            {replaceWarning && (
              <div className="biofingerDrawerNotice warning">
                <AlertTriangle size={16} />
                <span>Mapping akan diganti dari {row.employeeName || row.employeeCode} ke {selectedEmployee?.fullName || "karyawan baru"}.</span>
              </div>
            )}

            {conflictRow && (
              <div className="biofingerDrawerNotice danger">
                <AlertCircle size={16} />
                <span>Karyawan ini sudah aktif di User ID {conflictRow.externalUserId}. Pilih karyawan lain atau kosongkan mapping lama dulu.</span>
              </div>
            )}
          </section>

          <section className="biofingerDrawerSection">
            <h3>Event Terakhir</h3>
            <div className="biofingerDrawerEvents">
              {events.length === 0 && <span className="biofingerDrawerEmpty">Belum ada sample event untuk User ID ini.</span>}
              {events.map((event) => (
                <div className="biofingerDrawerEvent" key={event.id}>
                  <BiofingerEventText type={event.normalizedEventType} />
                  <strong>{formatUserDateTime(event.deviceEventAt, "-")}</strong>
                  <small>Raw {event.importStatus}</small>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="biofingerDrawerActions">
          <button className="secondaryButton" type="button" disabled={saving} onClick={onClose}>Batal</button>
          <button className="secondaryButton" type="button" disabled={!canManage || saving || row.status === "pending"} onClick={() => onPending(row)}>
            <RotateCcw size={16} />
            Pending
          </button>
          <button className="secondaryButton dangerSoftButton" type="button" disabled={!canManage || saving || row.status === "ignored"} onClick={() => onIgnore(row)}>
            <Archive size={16} />
            Ignore
          </button>
          <button className="primaryButton" type="button" disabled={saveDisabled} onClick={onSubmit}>
            <FileCheck2 size={17} />
            {saving ? "Menyimpan..." : selectedEmployeeId ? "Simpan Mapping" : "Kosongkan Mapping"}
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function BiofingerDeviceDialog({
  device,
  values,
  workLocationOptions,
  statusOptions,
  saving,
  canManage,
  onChange,
  onClose,
  onSubmit,
}: {
  device: BiofingerDeviceRow | null
  values: { name: string; workLocationId: string; status: string }
  workLocationOptions: Array<{ value: string; label: string; searchLabel: string; description?: string }>
  statusOptions: Array<{ value: string; label: string; searchLabel: string }>
  saving: boolean
  canManage: boolean
  onChange: (values: Partial<{ name: string; workLocationId: string; status: string }>) => void
  onClose: () => void
  onSubmit: () => void
}) {
  if (!device) return null

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <section
        className="dialogPanel biofingerDeviceDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="biofinger-device-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="iconButton dialogClose" type="button" aria-label="Tutup setting device" disabled={saving} onClick={onClose}>
          <X size={18} />
        </button>

        <div className="dialogCompactHeader">
          <span className="dialogEyebrow"><Fingerprint size={15} /> Device Registry</span>
          <h2 id="biofinger-device-dialog-title">Edit Device Biofinger</h2>
          <p>{device.deviceCode} / {device.serialNumber || "Serial belum ada"} / {device.ipAddress}:{device.port}</p>
        </div>

        <div className="biofingerDeviceDialogBody">
          <label className="formField">
            <span>Nama Display</span>
            <input className="uiInput" value={values.name} disabled={!canManage || saving} onChange={(event) => onChange({ name: event.target.value })} placeholder="Gudang A - AT-301" />
          </label>

          <label className="formField">
            <span>Lokasi Kerja</span>
            <FoundationSelect
              label={`Lokasi kerja untuk ${device.deviceCode}`}
              value={values.workLocationId}
              options={workLocationOptions}
              disabled={!canManage || saving}
              onChange={(nextValue) => onChange({ workLocationId: nextValue })}
            />
          </label>

          <label className="formField">
            <span>Status Device</span>
            <FoundationSelect
              label={`Status device ${device.deviceCode}`}
              value={values.status}
              options={statusOptions}
              searchable={false}
              disabled={!canManage || saving}
              onChange={(nextValue) => onChange({ status: nextValue })}
            />
          </label>

          <div className="biofingerDeviceFacts">
            <div>
              <span>Model</span>
              <strong>{device.model || "AT-301"}</strong>
            </div>
            <div>
              <span>MAC</span>
              <strong>{device.macAddress || "-"}</strong>
            </div>
            <div>
              <span>Last Sync</span>
              <strong>{formatUserDateTime(device.lastSyncAt, "Belum sync")}</strong>
            </div>
          </div>
        </div>

        <div className="dialogActions biofingerDeviceDialogActions">
          <button className="secondaryButton" type="button" disabled={saving} onClick={onClose}>Batal</button>
          <button className="primaryButton" type="button" disabled={!canManage || saving || !values.name.trim()} onClick={onSubmit}>
            <FileCheck2 size={17} />
            {saving ? "Menyimpan..." : "Simpan Device"}
          </button>
        </div>
      </section>
    </div>
  )
}

function EmployeeDialog({
  open,
  mode,
  initialValues,
  divisions,
  positions,
  locations,
  shifts,
  policies,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: "create" | "edit"
  initialValues: EmployeeFormValues
  divisions: EmployeeOption[]
  positions: EmployeeOption[]
  locations: EmployeeOption[]
  shifts: EmployeeOption[]
  policies: AttendancePolicyOption[]
  saving: boolean
  onClose: () => void
  onSubmit: (values: EmployeeFormValues) => Promise<void>
}) {
  const [values, setValues] = useState(initialValues)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const formBodyRef = useRef<HTMLDivElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [localPhotoPreview, setLocalPhotoPreview] = useState("")

  useEffect(() => {
    setValues(initialValues)
    setFormErrors([])
    setLocalPhotoPreview("")
  }, [initialValues])

  useEffect(() => {
    if (!values.photoFile) {
      setLocalPhotoPreview("")
      return undefined
    }

    const url = URL.createObjectURL(values.photoFile)
    setLocalPhotoPreview(url)

    return () => URL.revokeObjectURL(url)
  }, [values.photoFile])

  useEffect(() => {
    if (!open) return

    window.requestAnimationFrame(() => {
      formBodyRef.current?.scrollTo({ top: 0 })
    })
  }, [initialValues.employeeCode, mode, open])

  if (!open) return null

  const activeDivisions = divisions.filter((division) => division.isActive || division.id === values.divisionId)
  const activePositions = positions.filter((position) => (
    (position.isActive || position.id === values.positionId)
    && (!values.divisionId || !position.divisionId || position.divisionId === values.divisionId)
  ))
  const activeLocations = locations.filter((location) => location.isActive || location.id === values.workLocationId)
  const activeShifts = shifts.filter((shift) => shift.isActive || shift.id === values.shiftId)
  const activePolicies = policies.filter((policy) => policy.isActive || policy.id === values.attendancePolicyId)
  const selectedPolicy = activePolicies.find((policy) => policy.id === values.attendancePolicyId)
  const photoPreview = values.removePhoto ? "" : localPhotoPreview || values.photoUrl

  return createPortal(
    <div className="dialogBackdrop employeeDialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel employeeDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-dialog-title"
        aria-describedby="employee-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader">
          <div>
            <h2 id="employee-dialog-title">{mode === "edit" ? "Edit Karyawan" : "Tambah Karyawan"}</h2>
            <p id="employee-dialog-description">Data karyawan ini akan dipakai modul absensi, app lapangan, dan payroll cycle.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form
          key={`${mode}-${initialValues.employeeCode}`}
          className="employeeDialogForm"
          onSubmit={(event) => {
            event.preventDefault()
            const nextErrors = validateEmployeeForm(values)

            if (nextErrors.length > 0) {
              setFormErrors(nextErrors)
              return
            }

            setFormErrors([])
            void onSubmit(values)
          }}
        >
          <div ref={formBodyRef} className="dialogForm employeeFormGrid">
            {formErrors.length > 0 && (
              <div className="formValidationPanel">
                <AlertTriangle size={18} />
                <div>
                  <strong>Periksa data karyawan</strong>
                  {formErrors.map((error) => (
                    <span key={error}>{error}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="employeePhotoField">
              <button
                className="employeePhotoPreview"
                type="button"
                aria-label={photoPreview ? "Ganti foto karyawan" : "Upload foto karyawan"}
                onClick={() => photoInputRef.current?.click()}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="" />
                ) : (
                  <span className="employeePhotoEmptyIcon">
                    <Camera size={26} />
                  </span>
                )}
                <span className="employeePhotoOverlay">{photoPreview ? "Ganti" : "Upload"}</span>
              </button>
              {photoPreview && (
                <button
                  className="employeePhotoRemove"
                  type="button"
                  aria-label="Hapus foto karyawan"
                  onClick={() => {
                    if (photoInputRef.current) photoInputRef.current.value = ""
                    setValues((current) => ({
                      ...current,
                      photoFile: null,
                      photoUrl: "",
                      removePhoto: Boolean(current.photoPath),
                    }))
                  }}
                >
                  <X size={14} />
                </button>
              )}
              <div className="employeePhotoControl">
                <span>Foto Karyawan</span>
                <strong>{values.photoFile?.name || (values.photoPath && !values.removePhoto ? "Foto tersimpan di Storage" : "Belum ada foto")}</strong>
                <small>Klik gambar atau tombol upload. JPG, PNG, WEBP maksimal 2MB dan file lama dioverwrite.</small>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null
                    setValues((current) => ({
                      ...current,
                      photoFile: file,
                      removePhoto: false,
                    }))
                  }}
                />
              </div>
              <div className="employeePhotoActions">
                <button className="secondaryButton compactButton" type="button" onClick={() => photoInputRef.current?.click()}>
                  <Upload size={14} />
                  {photoPreview ? "Ganti Foto" : "Upload Foto"}
                </button>
              </div>
            </div>
            <TextFormField label="Kode Otomatis" value={values.employeeCode} disabled readOnly required />
            <TextFormField label="Nama Lengkap" value={values.fullName} onChange={(event) => setValues((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nama karyawan" required />
            <TextFormField label="NIK" value={values.nik} onChange={(event) => setValues((current) => ({ ...current, nik: event.target.value }))} placeholder="Nomor identitas karyawan" />
            <TextFormField label="No HP" value={values.phone} onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))} placeholder="08xxxxxxxxxx" />
            <TextFormField label="Email" type="email" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} placeholder="nama@dms.local" />
            <div className="employeeKioskAccessPanel employeeFormFull">
              <div className="employeeKioskAccessHeader">
                <span className="employeeKioskIcon">
                  <ScanLine size={20} />
                </span>
                <div>
                  <strong>Akses Kiosk / Pintu Absensi</strong>
                  <small>
                    {values.kioskSchemaReady
                      ? "Barcode, RFID, face, dan lokasi bisa diatur per karyawan lewat policy."
                      : "Migration kiosk belum aktif di database. Data QR/RFID akan aktif setelah migration diterapkan."}
                  </small>
                </div>
              </div>
              <div className="employeeKioskGrid">
                <TextFormField
                  label="Token Barcode / QR"
                  value={values.qrToken}
                  disabled={!values.kioskSchemaReady}
                  onChange={(event) => setValues((current) => ({ ...current, qrToken: event.target.value.toUpperCase() }))}
                  placeholder="DMS-EMP-001-XXXX"
                />
                <TextFormField
                  label="UID RFID"
                  value={values.rfidUid}
                  disabled={!values.kioskSchemaReady}
                  onChange={(event) => setValues((current) => ({ ...current, rfidUid: event.target.value.trim() }))}
                  placeholder="Tap kartu RFID di reader"
                />
                <SelectFormField label="Policy Absensi" value={values.attendancePolicyId} disabled={!values.kioskSchemaReady} onChange={(event) => setValues((current) => ({ ...current, attendancePolicyId: event.target.value }))}>
                  <option value="">Default multi method</option>
                  {activePolicies.map((policy) => (
                    <option value={policy.id} key={policy.id}>{policy.name}</option>
                  ))}
                </SelectFormField>
                <SwitchFormField
                  label="Akses Kiosk"
                  checked={values.kioskAccessEnabled}
                  onChange={(kioskAccessEnabled) => setValues((current) => ({ ...current, kioskAccessEnabled }))}
                  onLabel="Aktif"
                  offLabel="Nonaktif"
                  onDescription="Karyawan bisa absen dari kiosk lokasi kerja."
                  offDescription="Karyawan tidak bisa dipanggil dari scan kartu/barcode."
                  disabled={!values.kioskSchemaReady}
                />
              </div>
              <div className="employeeKioskPolicyPreview">
                <span>{selectedPolicy?.code || "POLICY-DEFAULT"}</span>
                <strong>{selectedPolicy?.name || "Multi Method"}</strong>
                <small>
                  Media: {(selectedPolicy?.allowedMedia.length ? selectedPolicy.allowedMedia : ["barcode", "rfid"]).join(" + ")}
                  {" · "}
                  Face {selectedPolicy?.requireFace ? "wajib" : "opsional"}
                  {" · "}
                  Lokasi {selectedPolicy?.requireLocation !== false ? "wajib" : "opsional"}
                </small>
                <button
                  className="secondaryButton compactButton"
                  type="button"
                  disabled={!values.kioskSchemaReady}
                  onClick={() => setValues((current) => ({ ...current, qrToken: generateEmployeeQrToken(current.employeeCode) }))}
                >
                  <RefreshCcw size={14} />
                  Generate QR
                </button>
              </div>
            </div>
            <SelectFormField label="Divisi" value={values.divisionId} onChange={(event) => setValues((current) => ({ ...current, divisionId: event.target.value, positionId: "" }))} required>
              <option value="">Pilih divisi</option>
              {activeDivisions.map((division) => (
                <option value={division.id} key={division.id}>{division.name}</option>
              ))}
            </SelectFormField>
            <SelectFormField label="Jabatan" value={values.positionId} onChange={(event) => setValues((current) => ({ ...current, positionId: event.target.value }))} required>
              <option value="">Pilih jabatan</option>
              {activePositions.map((position) => (
                <option value={position.id} key={position.id}>{position.name}</option>
              ))}
            </SelectFormField>
            <SelectFormField label="Lokasi Kerja" value={values.workLocationId} onChange={(event) => setValues((current) => ({ ...current, workLocationId: event.target.value }))} required>
              <option value="">Pilih lokasi</option>
              {activeLocations.map((location) => (
                <option value={location.id} key={location.id}>{location.name}</option>
              ))}
            </SelectFormField>
            <SelectFormField label="Shift" value={values.shiftId} onChange={(event) => setValues((current) => ({ ...current, shiftId: event.target.value }))} required>
              <option value="">Pilih shift</option>
              {activeShifts.map((shift) => (
                <option value={shift.id} key={shift.id}>{shift.name}</option>
              ))}
            </SelectFormField>
            <div className="employeeFormFull">
              <SegmentedFormField<EmployeeSalaryType>
                label="Tipe Gaji"
                value={values.salaryType}
                columns={2}
                required
                onChange={(salaryType) => setValues((current) => ({
                  ...current,
                  salaryType,
                  payrollMethod: salaryType === "monthly" && current.payrollMethod === "attendance_cycle" ? "calendar_month" : current.payrollMethod,
                }))}
                options={[
                  { value: "daily", label: "Harian", description: "Nominal per hari kerja." },
                  { value: "monthly", label: "Bulanan", description: "Nominal tetap per bulan." },
                ]}
              />
            </div>
            <TextFormField
              label={values.salaryType === "monthly" ? "Gaji Bulanan" : "Gaji Harian"}
              type="text"
              inputMode="numeric"
              value={formatIntegerInput(values.salaryType === "monthly" ? values.monthlySalary : values.dailySalary)}
              onChange={(event) => {
                const value = values.salaryType === "monthly"
                  ? normalizeEmployeeMonthlySalary(event.target.value)
                  : normalizeEmployeeDailySalary(event.target.value)
                setValues((current) => ({
                  ...current,
                  [current.salaryType === "monthly" ? "monthlySalary" : "dailySalary"]: value,
                }))
              }}
              placeholder={values.salaryType === "monthly" ? "4.500.000" : "150.000"}
              required
            />
            <SelectFormField label="Metode Payroll" value={values.payrollMethod} onChange={(event) => setValues((current) => ({ ...current, payrollMethod: event.target.value as EmployeePayrollMethod }))} required>
              <option value="attendance_cycle">Cycle 26 Hari</option>
              <option value="calendar_month">Bulanan Kalender</option>
              <option value="custom">Custom</option>
            </SelectFormField>
            <DateFormField label="Tanggal Masuk" value={values.joinDate} onChange={(joinDate) => setValues((current) => ({ ...current, joinDate }))} required />
            <TextFormField
              label="Cycle Payroll"
              type="text"
              inputMode="numeric"
              value={values.payrollCycleDays}
              onChange={(event) => setValues((current) => ({ ...current, payrollCycleDays: normalizeEmployeeCycle(event.target.value) }))}
              placeholder="0 - 26"
              required
            />
            <SwitchFormField
              label="Hitung Proporsional"
              checked={values.prorateEnabled}
              onChange={(prorateEnabled) => setValues((current) => ({ ...current, prorateEnabled }))}
              onLabel="Aktif"
              offLabel="Nonaktif"
              onDescription="Gaji bulanan mengikuti jumlah hari kerja valid."
              offDescription="Gaji bulanan dibayar penuh sesuai nominal setting."
            />
            <div className="employeeStatusField">
              <SegmentedFormField<EmployeeStatus>
                label="Status"
                value={values.status}
                onChange={(status) => setValues((current) => ({ ...current, status }))}
                options={[
                  { value: "active", label: "Aktif", description: "Dipakai absensi & payroll." },
                  { value: "review", label: "Review", description: "Perlu pengecekan HR." },
                  { value: "inactive", label: "Nonaktif", description: "Disimpan sebagai arsip." },
                ]}
                required
              />
            </div>
            <div className="employeeNoteField">
              <TextFormField label="Catatan" value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} placeholder="Catatan HR atau payroll" />
            </div>
          </div>
          <div className="dialogActions employeeDialogActions">
            <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>Batal</button>
            <button className="primaryButton" type="submit" disabled={saving}>
              <FileCheck2 size={17} />
              {saving ? "Menyimpan..." : "Simpan Karyawan"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}

function EmployeeDetailDialog({
  row,
  canManage,
  saving,
  onClose,
  onEdit,
  onRestore,
  onNametag,
  onFaceEnroll,
  onFaceAction,
}: {
  row: EmployeeDirectoryRow | null
  canManage: boolean
  saving: boolean
  onClose: () => void
  onEdit: (row: EmployeeDirectoryRow) => void
  onRestore: (row: EmployeeDirectoryRow) => void
  onNametag: (row: EmployeeDirectoryRow) => void
  onFaceEnroll: (row: EmployeeDirectoryRow) => void
  onFaceAction: (row: EmployeeDirectoryRow, action: "approve" | "reject" | "reset" | "disable") => Promise<void>
}) {
  if (!row) return null

  const identityRows: Array<{ label: string; value: ReactNode }> = [
    { label: "Kode", value: row.employeeCode },
    { label: "Status", value: <EmployeeStatusBadge status={row.status} /> },
    { label: "NIK", value: row.nik || "Belum diisi" },
    { label: "No HP", value: row.phone || "Belum diisi" },
    { label: "Email", value: row.email || "Belum diisi" },
  ]
  const structureRows = [
    { label: "Divisi", value: row.divisionName },
    { label: "Jabatan", value: row.positionName },
    { label: "Lokasi kerja", value: row.workLocationName },
    { label: "Shift", value: row.shiftName },
  ]
  const payrollRows = [
    { label: "Tipe gaji", value: employeeSalaryTypeLabel[row.salaryType] },
    { label: "Nominal gaji", value: formatCurrency(getEmployeeSalaryAmount(row)) },
    { label: "Metode payroll", value: employeePayrollMethodLabel[row.payrollMethod] },
    { label: "Prorata", value: row.prorateEnabled ? "Aktif" : "Nonaktif" },
    { label: "Tanggal masuk", value: formatEmployeeDate(row.joinDate) },
    { label: "Cycle payroll", value: `${row.payrollCycleDays}/26 hari` },
  ]
  const kioskRows = [
    { label: "Akses kiosk", value: row.kioskAccessEnabled ? "Aktif" : "Nonaktif" },
    { label: "Policy absensi", value: row.attendancePolicyName || "Multi Method" },
    { label: "QR / barcode", value: row.qrToken || "Belum dibuat" },
    { label: "RFID", value: row.rfidUid || "Belum terdaftar" },
  ]

  return createPortal(
    <div className="dialogBackdrop employeeDialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog employeeDetailDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="masterDetailTitle">
            <span className="masterDetailIcon employeeDetailAvatar">
              {row.photoUrl ? <img src={row.photoUrl} alt="" /> : <span className="employeeDetailInitials">{getProfileInitials(row.fullName || row.employeeCode)}</span>}
            </span>
            <div>
              <span>Karyawan</span>
              <h2 id="employee-detail-title">{row.fullName}</h2>
              <p>Detail data karyawan yang dipakai modul absensi, app lapangan, dan payroll.</p>
              {row.deletedAt && <em className="masterDetailArchivedFlag">Diarsipkan {formatUserDateTime(row.deletedAt, "-")}</em>}
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="masterDetailBody">
          <section className="employeeProfileBrief">
            <p>
              <strong>{row.fullName}</strong> adalah karyawan {row.positionName} di divisi {row.divisionName},
              ditempatkan di {row.workLocationName} untuk shift {row.shiftName}. Data ini menjadi acuan absensi
              lapangan, radius GPS, face verification, dan perhitungan payroll.
            </p>
          </section>

          <div className="employeeDetailSections">
            <section className="employeeDetailSection">
              <h3>Identitas</h3>
              <div className="employeeDetailList">
                {identityRows.map((field) => (
                  <div className="employeeDetailLine" key={field.label}>
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="employeeDetailSection">
              <h3>Struktur & Lokasi</h3>
              <div className="employeeDetailList">
                {structureRows.map((field) => (
                  <div className="employeeDetailLine" key={field.label}>
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="employeeDetailSection wide">
              <h3>Payroll</h3>
              <div className="employeeDetailList compact">
                {payrollRows.map((field) => (
                  <div className="employeeDetailLine" key={field.label}>
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="employeeDetailSection wide">
              <h3>Akses Kiosk</h3>
              <div className="employeeDetailList compact employeeKioskDetailList">
                {kioskRows.map((field) => (
                  <div className="employeeDetailLine" key={field.label}>
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="employeeFaceProfilePanel">
            <div className="employeeFacePreview">
              {row.faceReferenceImageUrl ? <img src={row.faceReferenceImageUrl} alt="" /> : <ScanFace size={28} />}
            </div>
            <div className="employeeFaceCopy">
              <span>Face Profile</span>
              <strong>{employeeFaceStatusLabel[row.faceProfileStatus]}</strong>
              <small>
                {row.faceProfileStatus === "approved"
                  ? `Referensi wajah aktif. Threshold ${row.faceProfileThreshold}%.`
                  : row.faceProfileStatus === "pending_review"
                    ? "Karyawan sudah daftar wajah dan menunggu approval HR."
                    : row.faceProfileStatus === "rejected"
                      ? "Registrasi wajah ditolak. Karyawan perlu daftar ulang."
                      : row.faceProfileStatus === "disabled"
                        ? "Verifikasi wajah dimatikan untuk karyawan ini."
                        : "Belum ada data referensi wajah dari app karyawan."}
              </small>
              <div className="employeeFaceMeta">
                <EmployeeFaceProfileBadge status={row.faceProfileStatus} />
                <span>{row.faceProfileSubmittedAt ? `Submit ${formatUserDateTime(row.faceProfileSubmittedAt, "-")}` : "Belum submit"}</span>
                {row.faceProfileReviewedAt && <span>Review {formatUserDateTime(row.faceProfileReviewedAt, "-")}</span>}
              </div>
              {row.faceProfileReviewNotes && <p>{row.faceProfileReviewNotes}</p>}
            </div>
            <div className="employeeFaceActions">
              <button className="primaryButton compactButton" type="button" disabled={!canManage || saving || Boolean(row.deletedAt)} onClick={() => onFaceEnroll(row)}>
                <ScanFace size={15} />
                {row.faceProfileStatus === "unenrolled" ? "Daftar Wajah" : "Scan Ulang"}
              </button>
              <button className="secondaryButton compactButton" type="button" disabled={!canManage || saving || Boolean(row.deletedAt) || row.faceProfileStatus !== "pending_review"} onClick={() => void onFaceAction(row, "approve")}>
                <ShieldCheck size={15} />
                Approve
              </button>
              <button className="secondaryButton compactButton" type="button" disabled={!canManage || saving || Boolean(row.deletedAt) || row.faceProfileStatus === "unenrolled"} onClick={() => void onFaceAction(row, "reset")}>
                <ScanFace size={15} />
                Reset
              </button>
              <button className="secondaryButton compactButton dangerSoftButton" type="button" disabled={!canManage || saving || Boolean(row.deletedAt) || row.faceProfileStatus !== "pending_review"} onClick={() => void onFaceAction(row, "reject")}>
                <X size={15} />
                Reject
              </button>
            </div>
          </section>

          {row.notes && (
            <div className="masterDetailRelation">
              <small>Catatan</small>
              <div>
                <span>
                  <em>HR Note</em>
                  <strong>{row.notes}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="masterDetailActions">
          <button className="secondaryButton" type="button" onClick={onClose}>Tutup</button>
          <button className="secondaryButton" type="button" onClick={() => onNametag(row)}>
            <Printer size={16} />
            Nametag
          </button>
          {row.deletedAt ? (
            <button className="primaryButton" type="button" disabled={!canManage || saving} onClick={() => onRestore(row)}>
              <RotateCcw size={16} />
              Pulihkan Karyawan
            </button>
          ) : (
            <button className="primaryButton" type="button" disabled={!canManage} onClick={() => onEdit(row)}>
              <Pencil size={16} />
              Edit Karyawan
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function EmployeeNametagDialog({ row, onClose }: { row: EmployeeDirectoryRow | null; onClose: () => void }) {
  if (!row) return null

  const barcodeValue = row.qrToken || generateEmployeeQrToken(row.employeeCode)
  const safeFileName = `${row.employeeCode || "employee"}-nametag`.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
  const barcode = getCode128Segments(barcodeValue)
  const barSvg = barcode.bars.map((bar) => `<rect x="${bar.x}" y="0" width="${bar.width}" height="52" fill="#071332"/>`).join("")
  const nametagSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="980" viewBox="0 0 640 980">
  <rect width="640" height="980" rx="44" fill="#ffffff"/>
  <rect x="36" y="36" width="568" height="908" rx="36" fill="#f8fbff" stroke="#d7e7f0" stroke-width="2"/>
  <text x="320" y="98" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#0085a0">DMS KARYAWAN</text>
  <text x="320" y="152" text-anchor="middle" font-family="Arial" font-size="44" font-weight="800" fill="#071332">${row.fullName}</text>
  <text x="320" y="194" text-anchor="middle" font-family="Arial" font-size="24" fill="#697891">${row.employeeCode} - ${row.divisionName}</text>
  <circle cx="320" cy="330" r="118" fill="#eafaff" stroke="#bcecf5" stroke-width="3"/>
  <text x="320" y="352" text-anchor="middle" font-family="Arial" font-size="62" font-weight="800" fill="#071332">${getProfileInitials(row.fullName || row.employeeCode)}</text>
  <text x="320" y="508" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700" fill="#071332">${row.positionName}</text>
  <text x="320" y="546" text-anchor="middle" font-family="Arial" font-size="24" fill="#697891">${row.workLocationName} - ${row.shiftName}</text>
  <svg x="90" y="625" width="460" height="120" viewBox="0 0 ${barcode.width} 52" preserveAspectRatio="none">
    <rect width="${barcode.width}" height="52" fill="#ffffff"/>
    ${barSvg}
  </svg>
  <text x="320" y="790" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" letter-spacing="2" fill="#071332">${barcodeValue}</text>
  <text x="320" y="835" text-anchor="middle" font-family="Arial" font-size="20" fill="#697891">RFID: ${row.rfidUid || "Belum terdaftar"}</text>
  <text x="320" y="884" text-anchor="middle" font-family="Arial" font-size="18" fill="#0085a0">${row.attendancePolicyName || "Multi Method"}</text>
</svg>`.trim()

  return createPortal(
    <div className="dialogBackdrop employeeDialogBackdrop nametagPrintBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog employeeNametagDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-nametag-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="masterDetailTitle">
            <span className="masterDetailIcon">
              <CreditCard size={24} />
            </span>
            <div>
              <span>Kiosk Access</span>
              <h2 id="employee-nametag-title">Nametag Karyawan</h2>
              <p>Barcode ini dipakai untuk scan absensi di pintu kiosk.</p>
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup nametag" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="employeeNametagBody">
          <article className="employeeNametagCard" id="employee-nametag-print">
            <div className="employeeNametagBrand">
              <img src={dmsLogo} alt="" />
              <div>
                <span>DMS</span>
                <strong>Employee Access</strong>
              </div>
            </div>
            <div className="employeeNametagAvatar">
              {row.photoUrl ? <img src={row.photoUrl} alt="" /> : <span>{getProfileInitials(row.fullName || row.employeeCode)}</span>}
            </div>
            <div className="employeeNametagIdentity">
              <span>{row.employeeCode}</span>
              <h3>{row.fullName}</h3>
              <p>{row.positionName} - {row.divisionName}</p>
              <small>{row.workLocationName} - {row.shiftName}</small>
            </div>
            <div className="employeeNametagBarcode">
              <Code128Barcode value={barcodeValue} className="employeeBarcodeSvg" />
              <strong>{barcodeValue}</strong>
            </div>
            <div className="employeeNametagMeta">
              <span>RFID: <strong>{row.rfidUid || "Belum terdaftar"}</strong></span>
              <span>Policy: <strong>{row.attendancePolicyName || "Multi Method"}</strong></span>
            </div>
          </article>
        </div>

        <div className="masterDetailActions">
          <button className="secondaryButton" type="button" onClick={onClose}>Tutup</button>
          <button className="secondaryButton" type="button" onClick={() => downloadTextFile(`${safeFileName}.svg`, nametagSvg, "image/svg+xml")}>
            <Download size={16} />
            Download SVG
          </button>
          <button className="primaryButton" type="button" onClick={() => window.print()}>
            <Printer size={16} />
            Cetak Nametag
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function UsersPage({ activeView, profile }: { activeView: ViewId; profile: AppAccessProfile }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<UserAccessRow | null>(null)
  const [detailRow, setDetailRow] = useState<UserAccessRow | null>(null)
  const [statusRow, setStatusRow] = useState<UserAccessRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<UserAccessRow | null>(null)
  const [passwordActionRow, setPasswordActionRow] = useState<UserAccessRow | null>(null)
  const [passwordActionType, setPasswordActionType] = useState<PasswordActionType>("setup")
  const [passwordDeliveryMode, setPasswordDeliveryMode] = useState<PasswordDeliveryMode>("manual")
  const [manualPassword, setManualPassword] = useState("")
  const [manualPasswordConfirm, setManualPasswordConfirm] = useState("")
  const [showManualPassword, setShowManualPassword] = useState(false)
  const [passwordActionError, setPasswordActionError] = useState("")
  const [formInitialValues, setFormInitialValues] = useState<UserAccessFormValues>(() => createEmptyUserForm())
  const [rows, setRows] = useState<UserAccessRow[]>([])
  const [roles, setRoles] = useState<UserAccessOption[]>([])
  const [divisions, setDivisions] = useState<UserAccessOption[]>([])
  const [employeesForUser, setEmployeesForUser] = useState<UserEmployeeOption[]>([])
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
      setEmployeesForUser(data.employees)
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
      ? [row.userCode, row.fullName, row.email, row.roleName, row.divisionName, row.status, appScopeLabel[row.appScope], row.employeeName].join(" ").toLowerCase().includes(normalizedTerm)
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
  const linkedEmployeeUsers = rows.filter((user) => Boolean(user.employeeId)).length
  const statusTarget = statusRow?.status === "locked" ? "active" : "locked"
  const passwordAction = passwordActionCopy[passwordActionType]
  const passwordDialogDescription = passwordDeliveryMode === "manual"
    ? "Admin membuat password sementara langsung dari management. Cocok untuk operasional saat email belum stabil."
    : passwordAction.description
  const passwordDialogConfirmLabel = passwordDeliveryMode === "manual"
    ? "Simpan Password"
    : passwordAction.confirm
  const manualPasswordScore = getManualPasswordScore(manualPassword)
  const manualPasswordScoreLabel = manualPasswordScore >= 5 ? "Kuat" : manualPasswordScore >= 4 ? "Cukup" : "Lemah"
  const canCreateUser = hasPermission(profile, "users.create")
  const canEditUser = hasPermission(profile, "users.edit")
  const canLockUser = hasPermission(profile, "users.lock")

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
      employeeId: row.employeeId,
      appScope: row.appScope,
      status: row.status,
      twoFactorStatus: "disabled",
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
          employee_id: values.employeeId,
          app_scope: values.appScope,
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
      throw new Error(message)
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
    setPasswordDeliveryMode("manual")
    setManualPassword("")
    setManualPasswordConfirm("")
    setPasswordActionError("")
    setShowManualPassword(false)
  }

  const handleGeneratePassword = () => {
    const nextPassword = generateSecurePassword()
    setManualPassword(nextPassword)
    setManualPasswordConfirm(nextPassword)
    setPasswordActionError("")
  }

  const handlePasswordAction = async () => {
    if (!passwordActionRow) return
    const targetRow = passwordActionRow
    const targetAction = passwordActionType
    setSaving(true)
    setErrorMessage("")
    setPasswordActionError("")

    try {
      if (passwordDeliveryMode === "manual") {
        const validationErrors = validateManualPassword(manualPassword, manualPasswordConfirm)

        if (validationErrors.length > 0) {
          setPasswordActionError(validationErrors.join(" "))
          return
        }

        await setUserManualPassword(targetRow, manualPassword)
      } else {
        await requestUserPasswordLink(targetRow, targetAction)
      }

      if (!useAppUsersFunction() && passwordDeliveryMode === "email") {
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
        title: passwordDeliveryMode === "manual" ? "Password disimpan" : targetAction === "setup" ? "Link buat password dikirim" : "Reset password dikirim",
        description: passwordDeliveryMode === "manual" ? `${targetRow.fullName} sudah bisa login dengan password baru.` : `Email dikirim ke ${targetRow.email}.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, passwordDeliveryMode === "manual" ? "Gagal menyimpan password." : targetAction === "setup" ? "Gagal mengirim link buat password." : "Gagal mengirim reset password.")
      setErrorMessage(message)
      setPasswordActionError(message)
      showToast({ tone: "error", title: passwordDeliveryMode === "manual" ? "Gagal simpan password" : targetAction === "setup" ? "Gagal kirim link" : "Gagal reset password", description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Kelola user management app, akses lapangan, role, status akses, invite user, dan relasi karyawan."
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
            <button className="primaryButton" type="button" onClick={openCreateDialog} disabled={!canCreateUser}>
              <Mail size={17} />
              Invite User
            </button>
          </>
        }
      />

      <OperationalKpiGrid>
        <OperationalKpiCard label="User Aktif" value={activeUsers} detail="Bisa akses management" icon={UsersRound} tone="blue" />
        <OperationalKpiCard label="Invite Pending" value={invitedUsers} detail="Menunggu aktivasi" icon={Mail} tone="amber" />
        <OperationalKpiCard label="Terhubung Karyawan" value={linkedEmployeeUsers} detail="Siap akses app lapangan" icon={UserRoundCheck} tone="green" />
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
                <col style={{ width: "150px" }} />
                <col style={{ width: "170px" }} />
                <col style={{ width: "170px" }} />
                <col style={{ width: "190px" }} />
                <col style={{ width: "170px" }} />
                <col style={{ width: "150px" }} />
                <col style={{ width: "112px" }} />
                <col className="tableActionColumn" />
              </colgroup>
              <thead>
                <tr>
                  <th className="tableNumberHeader">No</th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Verified</th>
                  <th>Role</th>
                  <th>Divisi</th>
                  <th>Karyawan Terkait</th>
                  <th>Scope</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th className="tableActionHeader">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="tableStateCell" colSpan={11}>
                      <TableState title="Memuat user" description="Mengambil pengguna, role, dan divisi dari Supabase." icon={UsersRound} />
                    </td>
                  </tr>
                )}
                {!loading && errorMessage && rows.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={11}>
                      <TableState title="Gagal memuat user" description={errorMessage} icon={AlertTriangle} tone="danger" />
                    </td>
                  </tr>
                )}
                {!loading && !errorMessage && filteredRows.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={11}>
                      <TableState title="User tidak ditemukan" description="Ubah filter atau invite user baru." icon={Search} />
                    </td>
                  </tr>
                )}
                {!loading && paginatedRows.map((user, index) => (
                  <ClickableTableRow key={user.id} label={`Lihat detail ${user.fullName}`} onOpen={() => setDetailRow(user)}>
                    <td className="tableNumberCell"><TableNumberCell value={(currentPage - 1) * Math.min(pageSize, 50) + index + 1} /></td>
                    <td><TableText primary={user.fullName} secondary={user.userCode} /></td>
                    <td><TableText primary={user.email} /></td>
                    <td><EmailVerifiedBadge verifiedAt={user.emailVerifiedAt} /></td>
                    <td><TableText primary={user.roleName} /></td>
                    <td><TableText primary={user.divisionName} /></td>
                    <td><TableText primary={user.employeeName} secondary={user.employeeCode || "Tidak dipakai app lapangan"} /></td>
                    <td><TableText primary={appScopeLabel[user.appScope]} /></td>
                    <td><TableText primary={formatUserDateTime(user.lastLoginAt)} /></td>
                    <td><UserStatusBadge status={user.status} /></td>
                    <td className="tableActionCell">
                      <div className="rowActions">
                        <RowActionMenu label={`Aksi ${user.fullName}`}>
                          <RowActionMenuItem disabled={!canEditUser || saving} onClick={() => openEditDialog(user)}>
                            <Pencil size={14} />
                            Edit
                          </RowActionMenuItem>
                          <RowActionMenuItem disabled={!canEditUser || saving} onClick={() => openPasswordAction(user)}>
                            <KeyRound size={14} />
                            {user.status === "invited" ? "Buat Password" : "Reset Password"}
                          </RowActionMenuItem>
                          <RowActionMenuItem danger={user.status !== "locked"} disabled={!canLockUser || saving} onClick={() => {
                            setDetailRow(null)
                            setStatusRow(user)
                          }}>
                            {user.status === "locked" ? <FileCheck2 size={14} /> : <Lock size={14} />}
                            {user.status === "locked" ? "Unlock" : "Lock"}
                          </RowActionMenuItem>
                          <RowActionMenuItem danger disabled={!canEditUser || saving} onClick={() => {
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
        currentUserId={editingRow?.id || ""}
        selfAccountLocked={Boolean(editingRow && editingRow.id === profile.id)}
        initialValues={formInitialValues}
        roles={roles}
        divisions={divisions}
        employees={employeesForUser}
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
        canEdit={canEditUser}
        canLock={canLockUser}
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
        className="passwordDialog"
        eyebrow={passwordDeliveryMode === "manual" ? "Password Manual" : passwordActionType === "setup" ? "Buat Password" : "Reset Password"}
        title={passwordActionRow ? `${passwordDeliveryMode === "manual" ? "Buat password manual" : passwordAction.title} untuk ${passwordActionRow.fullName}?` : `${passwordAction.title}?`}
        description={passwordDialogDescription}
        confirmLabel={passwordDialogConfirmLabel}
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) {
            setPasswordActionRow(null)
            setPasswordActionError("")
            setManualPassword("")
            setManualPasswordConfirm("")
            setShowManualPassword(false)
          }
        }}
        onConfirm={() => void handlePasswordAction()}
      >
        {passwordActionRow && (
          <>
            <div className="confirmDialogPreview">
              <span>{passwordActionRow.userCode}</span>
              <strong>{passwordActionRow.fullName}</strong>
              <small>{passwordActionRow.email}</small>
            </div>
            <div className="passwordModeSwitch" role="group" aria-label="Pilih metode password">
              <button className={clsx(passwordDeliveryMode === "manual" && "active")} type="button" onClick={() => {
                setPasswordDeliveryMode("manual")
                setPasswordActionError("")
              }}>
                Buat Manual
              </button>
              <button className={clsx(passwordDeliveryMode === "email" && "active")} type="button" onClick={() => {
                setPasswordDeliveryMode("email")
                setPasswordActionError("")
              }}>
                Kirim Link
              </button>
            </div>
            {passwordDeliveryMode === "manual" && (
              <div className="passwordManualFields">
                <div className="passwordManualToolbar">
                  <span>Password sementara wajib diganti user setelah login.</span>
                  <button className="secondaryButton compactButton" type="button" onClick={handleGeneratePassword}>
                    <KeyRound size={15} />
                    Generate
                  </button>
                </div>
                <PasswordFormField
                  label="Password Baru"
                  value={manualPassword}
                  visible={showManualPassword}
                  onChange={setManualPassword}
                  onToggle={() => setShowManualPassword((value) => !value)}
                  placeholder="Minimal 12 karakter"
                />
                <PasswordFormField
                  label="Konfirmasi Password"
                  value={manualPasswordConfirm}
                  visible={showManualPassword}
                  onChange={setManualPasswordConfirm}
                  onToggle={() => setShowManualPassword((value) => !value)}
                  placeholder="Ulangi password"
                />
                <div className={clsx("passwordStrength", manualPasswordScore >= 5 && "strong", manualPasswordScore === 4 && "medium")}>
                  <span><i style={{ width: `${Math.max(12, manualPasswordScore * 20)}%` }} /></span>
                  <small>{manualPassword ? manualPasswordScoreLabel : "Belum diisi"} · 12+ karakter, huruf besar/kecil, angka, simbol</small>
                </div>
              </div>
            )}
            {passwordActionError && (
              <div className="dialogInlineAlert">
                <AlertTriangle size={16} />
                <span>{passwordActionError}</span>
              </div>
            )}
          </>
        )}
      </ConfirmDialog>
      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </OperationalPageShell>
  )
}

function UserAccessDialog({
  open,
  mode,
  currentUserId,
  selfAccountLocked,
  initialValues,
  roles,
  divisions,
  employees,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: "create" | "edit"
  currentUserId: string
  selfAccountLocked: boolean
  initialValues: UserAccessFormValues
  roles: UserAccessOption[]
  divisions: UserAccessOption[]
  employees: UserEmployeeOption[]
  saving: boolean
  onClose: () => void
  onSubmit: (values: UserAccessFormValues) => Promise<void>
}) {
  const [values, setValues] = useState(initialValues)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [submitError, setSubmitError] = useState("")

  useEffect(() => {
    setValues(initialValues)
    setFormErrors([])
    setSubmitError("")
  }, [initialValues])

  if (!open) return null

  const activeRoles = roles.filter((role) => role.isActive || role.id === values.roleId)
  const activeDivisions = divisions.filter((division) => division.isActive || division.id === values.divisionId)
  const activeEmployees = employees.filter((employee) => employee.isActive || employee.id === values.employeeId)
  const selectedEmployee = values.employeeId ? employees.find((employee) => employee.id === values.employeeId) : null
  const handleEmployeeChange = (employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId)

    setValues((current) => ({
      ...current,
      employeeId,
      fullName: employee?.name || current.fullName,
      email: selfAccountLocked ? current.email : employee?.email || current.email,
      divisionId: employee?.divisionId || current.divisionId,
    }))
  }

  return createPortal(
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
            <p id="invite-user-description">Pilih karyawan terkait untuk mengisi nama, email, dan divisi otomatis.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="dialogForm" onSubmit={(event) => {
          event.preventDefault()
          const protectedValues = selfAccountLocked
            ? {
              ...values,
              email: initialValues.email,
              roleId: initialValues.roleId,
              status: initialValues.status,
            }
            : values
          const nextErrors = validateUserAccessForm(protectedValues, employees, currentUserId)

          if (nextErrors.length > 0) {
            setFormErrors(nextErrors)
            setSubmitError("")
            return
          }

          setFormErrors([])
          setSubmitError("")
          void onSubmit(protectedValues).catch((error) => {
            setSubmitError(getFriendlySupabaseError(error, "Gagal menyimpan user."))
          })
        }}>
          {selfAccountLocked && (
            <div className="protectedAccountNotice">
              <ShieldCheck size={17} />
              <span>Akun ini sedang kamu pakai. Email, role, dan status dikunci supaya akses utama tidak terkunci sendiri.</span>
            </div>
          )}
          {(formErrors.length > 0 || submitError) && (
            <div className="formValidationPanel">
              <AlertTriangle size={18} />
              <div>
                <strong>Periksa data user</strong>
                {submitError && <span>{submitError}</span>}
                {formErrors.map((error) => (
                  <span key={error}>{error}</span>
                ))}
              </div>
            </div>
          )}
          <TextFormField label="Kode User" value={values.userCode} readOnly disabled required />
          <TextFormField label="Nama User" value={values.fullName} onChange={(event) => setValues((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nama lengkap" required />
          <TextFormField label="Email Login" type="email" value={selfAccountLocked ? initialValues.email : values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} placeholder="nama@dms.local" disabled={selfAccountLocked} required />
          <SelectFormField label="Role" value={selfAccountLocked ? initialValues.roleId : values.roleId} onChange={(event) => setValues((current) => ({ ...current, roleId: event.target.value }))} disabled={selfAccountLocked} required>
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
          <SelectFormField label="Scope App" value={values.appScope} onChange={(event) => setValues((current) => ({ ...current, appScope: event.target.value as AppScope }))} required>
            <option value="management">Management</option>
            <option value="field">Lapangan</option>
            <option value="both">Management + Lapangan</option>
          </SelectFormField>
          <SelectFormField label="Karyawan Terkait" value={values.employeeId} onChange={(event) => handleEmployeeChange(event.target.value)} required={values.appScope === "field" || values.appScope === "both"}>
            <option value="">Belum dikaitkan</option>
            {activeEmployees.map((employee) => {
              const linkedToOtherUser = Boolean(employee.linkedUserId && employee.linkedUserId !== currentUserId)
              const linkedLabel = linkedToOtherUser ? ` • sudah dipakai ${employee.linkedUserName || employee.linkedUserEmail}` : ""

              return (
                <option value={employee.id} key={employee.id} disabled={linkedToOtherUser}>
                  {employee.code} - {employee.name}{linkedLabel}
                </option>
              )
            })}
          </SelectFormField>
          {selectedEmployee && (
            <div className="linkedEmployeeAutofill">
              <UserRoundCheck size={16} />
              <span>
                Data diambil dari {selectedEmployee.code} - {selectedEmployee.name}
                {selectedEmployee.email ? `, ${selectedEmployee.email}` : ""}.
              </span>
            </div>
          )}
          <SelectFormField label="Status" value={selfAccountLocked ? initialValues.status : values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value as UserStatus }))} disabled={selfAccountLocked} required>
            <option value="invited">Invite</option>
            <option value="active">Aktif</option>
            <option value="locked">Locked</option>
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
    </div>,
    document.body,
  )
}

function PasswordFormField({
  label,
  value,
  visible,
  onChange,
  onToggle,
  placeholder,
}: {
  label: string
  value: string
  visible: boolean
  onChange: (value: string) => void
  onToggle: () => void
  placeholder: string
}) {
  const inputId = label.toLowerCase().replace(/\s+/g, "-")

  return (
    <div className="formField passwordFormField">
      <label htmlFor={inputId}>{label}<span className="requiredMark">*</span></label>
      <div className="passwordFieldControl">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          required
        />
        <button
          className="passwordToggle"
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
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
  canEdit,
  canLock,
}: {
  row: UserAccessRow | null
  onClose: () => void
  onEdit: (row: UserAccessRow) => void
  onToggleStatus: (row: UserAccessRow) => void
  onDelete: (row: UserAccessRow) => void
  onPasswordAction: (row: UserAccessRow, type?: PasswordActionType) => void
  canEdit: boolean
  canLock: boolean
}) {
  if (!row) return null
  const linkedEmployee = row.employeeCode ? `${row.employeeCode} - ${row.employeeName}` : "Belum dikaitkan"
  const primaryMeta = [
    row.userCode,
    appScopeLabel[row.appScope],
    row.divisionName,
  ].filter(Boolean)
  const accessLines = [
    { label: "Role akses", value: row.roleName },
    { label: "Divisi", value: row.divisionName },
    { label: "Karyawan terkait", value: linkedEmployee },
    { label: "Scope app", value: appScopeLabel[row.appScope] },
  ]
  const securityLines = [
    { label: "Email verified", value: <EmailVerifiedBadge verifiedAt={row.emailVerifiedAt} /> },
    { label: "Last login", value: formatUserDateTime(row.lastLoginAt) },
    { label: "Invite dikirim", value: formatUserDateTime(row.invitedAt) },
    { label: "Setup password", value: formatUserDateTime(row.passwordSetupSentAt, "Belum dikirim") },
    { label: "Reset password", value: formatUserDateTime(row.passwordResetSentAt, "Belum dikirim") },
    { label: "Password manual", value: formatUserDateTime(row.passwordManualSetAt, "Belum dibuat") },
    { label: "Wajib ganti password", value: row.forcePasswordChange ? "Ya" : "Tidak" },
  ]

  return createPortal(
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog userDetailDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="userDetailHero">
            <span className="userDetailAvatar">
              <ShieldCheck size={22} />
            </span>
            <div>
              <span className="userDetailEyebrow">{row.roleName}</span>
              <h2 id="user-detail-title">{row.fullName}</h2>
              <p>{row.email}</p>
              <div className="userDetailMeta">
                {primaryMeta.map((item) => <span key={item}>{item}</span>)}
              </div>
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail user" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="userDetailBody">
          <section className="userDetailSummary">
            <div>
              <span>Status akses</span>
              <UserStatusBadge status={row.status} />
            </div>
            <p>
              User ini terhubung ke role <strong>{row.roleName}</strong>, scope <strong>{appScopeLabel[row.appScope]}</strong>,
              dan {row.employeeCode ? <>data karyawan <strong>{linkedEmployee}</strong>.</> : <>belum terhubung ke data karyawan.</>}
            </p>
          </section>
          <section className="userDetailSection">
            <h3>Akses Operasional</h3>
            <div className="userDetailRows">
              {accessLines.map((item) => (
                <div className="userDetailLine" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="userDetailSection">
            <h3>Keamanan Akun</h3>
            <div className="userDetailRows">
              {securityLines.map((item) => (
                <div className="userDetailLine" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
          {row.notes && (
            <section className="userDetailNote">
              <span>Catatan</span>
              <p>{row.notes}</p>
            </section>
          )}
        </div>
        <div className="masterDetailActions userDetailActions">
          <button className="secondaryButton" type="button" disabled={!canEdit} onClick={() => onEdit(row)}>
            <Pencil size={16} />
            Edit
          </button>
          <button className="secondaryButton dangerSoftButton" type="button" disabled={!canEdit} onClick={() => onDelete(row)}>
            <Trash2 size={16} />
            Hapus
          </button>
          <button className="secondaryButton" type="button" disabled={!canEdit} onClick={() => onPasswordAction(row)}>
            <KeyRound size={16} />
            {row.status === "invited" ? "Buat Password" : "Reset Password"}
          </button>
          <button className={clsx("primaryButton", row.status !== "locked" && "dangerButton")} type="button" disabled={!canLock} onClick={() => onToggleStatus(row)}>
            {row.status === "locked" ? <FileCheck2 size={16} /> : <Lock size={16} />}
            {row.status === "locked" ? "Unlock" : "Lock"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function RolePermissionPage({ activeView, profile }: { activeView: ViewId; profile: AppAccessProfile }) {
  const [roles, setRoles] = useState<RolePermissionRole[]>([])
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([])
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({})
  const [baselineMatrix, setBaselineMatrix] = useState<Record<string, Record<string, boolean>>>({})
  const [activeRoleId, setActiveRoleId] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [groupFilter, setGroupFilter] = useState("all")
  const [detailPermission, setDetailPermission] = useState<PermissionDefinition | null>(null)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const fetchMatrix = async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      const data = await loadRolePermissionData()
      setRoles(data.roles)
      setPermissions(data.permissions)
      setMatrix(data.matrix)
      setBaselineMatrix(clonePermissionMatrix(data.matrix))
      setActiveRoleId((current) => current && data.roles.some((role) => role.id === current) ? current : data.roles[0]?.id || "")
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Gagal mengambil role permission."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchMatrix()
  }, [])

  const showToast = (message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() })
  }

  const activeRole = roles.find((role) => role.id === activeRoleId) || null
  const permissionGroups = Array.from(new Set(permissions.map((permission) => permission.group)))
  const filteredPermissions = permissions.filter((permission) => {
    const normalizedTerm = searchTerm.trim().toLowerCase()
    const matchesGroup = groupFilter === "all" || permission.group === groupFilter
    const matchesSearch = normalizedTerm
      ? [permission.key, permission.label, permission.group, permission.description].join(" ").toLowerCase().includes(normalizedTerm)
      : true

    return matchesGroup && matchesSearch
  })
  const groupedPermissions = filteredPermissions.reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
    groups[permission.group] = [...(groups[permission.group] || []), permission]
    return groups
  }, {})
  const activeRolePermissions = activeRole ? matrix[activeRole.id] || {} : {}
  const enabledCount = Object.values(activeRolePermissions).filter(Boolean).length
  const totalEnabled = roles.reduce((total, role) => total + Object.values(matrix[role.id] || {}).filter(Boolean).length, 0)
  const dirty = activeRole
    ? getRolePermissionSnapshot(activeRole.id, matrix) !== getRolePermissionSnapshot(activeRole.id, baselineMatrix)
    : false
  const changedCount = activeRole
    ? permissions.filter((permission) => (matrix[activeRole.id]?.[permission.key] || false) !== (baselineMatrix[activeRole.id]?.[permission.key] || false)).length
    : 0
  const ownerRole = activeRole?.code === "ROLE-OWNER"
  const canManage = hasPermission(profile, "role_permissions.manage")

  const getPermissionDisabledReason = (role: RolePermissionRole, permissionKey: string) => {
    if (!canManage) return "Role kamu tidak boleh mengubah permission."
    if (role.code === "ROLE-OWNER") return "Owner dikunci sebagai full access."
    if (role.id === profile.roleId && permissionKey === "role_permissions.manage") return "Permission ini menjaga akses kamu ke halaman ini."
    if (role.id === profile.roleId && permissionKey === "dashboard.view") return "Dashboard wajib aktif untuk role yang sedang dipakai."
    if (role.userCount > 0 && permissionKey === "dashboard.view") return "Dashboard wajib aktif untuk role yang punya user aktif."
    return ""
  }

  const togglePermission = (role: RolePermissionRole, permissionKey: string) => {
    if (getPermissionDisabledReason(role, permissionKey)) return
    setMatrix((current) => ({
      ...current,
      [role.id]: {
        ...(current[role.id] || {}),
        [permissionKey]: !(current[role.id]?.[permissionKey] || false),
      },
    }))
  }

  const handleSaveMatrix = async () => {
    if (!activeRole) return
    setSaving(true)
    setErrorMessage("")

    try {
      await saveRolePermissionMatrix(activeRole, matrix[activeRole.id] || {})
      setSaveConfirmOpen(false)
      await fetchMatrix()
      showToast({
        tone: "success",
        title: "Permission tersimpan",
        description: `Akses role ${activeRole.name} sudah diperbarui.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal menyimpan permission role.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal menyimpan permission", description: message })
    } finally {
      setSaving(false)
    }
  }

  const handleResetDefaults = async () => {
    if (!activeRole) return
    setSaving(true)
    setErrorMessage("")

    try {
      await resetRolePermissionDefaults(activeRole)
      setResetConfirmOpen(false)
      await fetchMatrix()
      showToast({
        tone: "success",
        title: "Default role dipulihkan",
        description: `Permission ${activeRole.name} kembali ke template awal DMS.`,
      })
    } catch (error) {
      const message = getFriendlySupabaseError(error, "Gagal reset permission role.")
      setErrorMessage(message)
      showToast({ tone: "error", title: "Gagal reset default", description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Atur akses per role secara live. Perubahan permission tersimpan ke Supabase dan dicatat di audit log."
        meta={
          <InlinePageStats
            items={[
              `${roles.length} role`,
              `${permissions.length} permission`,
              `${totalEnabled} akses aktif`,
              dirty ? `${changedCount} perubahan belum disimpan` : "matrix sinkron",
            ]}
          />
        }
        actions={
          <>
            <button className="secondaryButton" type="button" disabled={!activeRole || saving} onClick={() => setResetConfirmOpen(true)}>
              <ArrowDown size={17} />
              Reset Default
            </button>
            <button className="primaryButton" type="button" disabled={!activeRole || !dirty || saving || ownerRole} onClick={() => setSaveConfirmOpen(true)}>
              <FileCheck2 size={17} />
              Simpan Matrix
            </button>
          </>
        }
      />

      <section className="moduleGrid rolePermissionModule">
        {errorMessage && <div className="inlineAlert">{errorMessage}</div>}

        <CategoryTabs
          activeId={activeRoleId}
          ariaLabel="Role permission"
          items={roles.map((role) => ({
            id: role.id,
            label: role.name,
            icon: role.code === "ROLE-OWNER" ? Crown : ShieldCheck,
            count: Object.values(matrix[role.id] || {}).filter(Boolean).length,
          }))}
          onChange={setActiveRoleId}
        />

        {activeRole && (
          <section className="rolePermissionSummary">
            <div>
              <span>{activeRole.code}</span>
              <h2>{activeRole.name}</h2>
              <p>{activeRole.description || "Role aktif DMS Management."}</p>
            </div>
            <div className="rolePermissionSummaryStats">
              <span><strong>{enabledCount}</strong><small>aktif</small></span>
              <span><strong>{permissions.length - enabledCount}</strong><small>nonaktif</small></span>
              <span><strong>{activeRole.userCount}</strong><small>user</small></span>
              {ownerRole && <em>Protected</em>}
              {dirty && <em className="warning">{changedCount} changed</em>}
            </div>
          </section>
        )}

        <OperationalFilterPanel>
          <div className="filterField">
            <label>Search</label>
            <div className="uiInput inputWithIcon compact">
              <Search size={16} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari permission, modul, action..." />
            </div>
          </div>
          <div className="filterField">
            <label>Grup</label>
            <select className="uiSelectTrigger" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="all">Semua Grup</option>
              {permissionGroups.map((group) => (
                <option value={group} key={group}>{group}</option>
              ))}
            </select>
          </div>
          <button className="secondaryButton" type="button" onClick={() => {
            setSearchTerm("")
            setGroupFilter("all")
          }}>Reset Filter</button>
        </OperationalFilterPanel>

        <OperationalTableCard className="rolePermissionMatrixCard">
          <div className="tableHeader">
            <div>
              <h2>Permission Matrix</h2>
              <p>Desktop menampilkan matrix semua role. Di PWA, fokus ke role aktif agar tetap ringan.</p>
            </div>
          </div>
          <div className="tableScroller uiDataTableScroller uiDataTableHasColumns rolePermissionTable desktopPermissionMatrix">
            <table>
              <colgroup>
                <col style={{ width: "340px" }} />
                {roles.map((role) => (
                  <col key={role.id} style={{ width: "130px" }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>Permission</th>
                  {roles.map((role) => (
                    <th className="textCenter" key={role.id}>{role.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="tableStateCell" colSpan={roles.length + 1}>
                      <TableState title="Memuat matrix" description="Mengambil role, permission, dan status akses dari Supabase." icon={Lock} />
                    </td>
                  </tr>
                )}
                {!loading && filteredPermissions.length === 0 && (
                  <tr>
                    <td className="tableStateCell" colSpan={roles.length + 1}>
                      <TableState title="Permission tidak ditemukan" description="Ubah filter atau reset pencarian." icon={Search} />
                    </td>
                  </tr>
                )}
                {!loading && Object.entries(groupedPermissions).map(([group, groupPermissions]) => (
                  <Fragment key={group}>
                    <tr className="permissionGroupRow">
                      <td colSpan={roles.length + 1}>{group}</td>
                    </tr>
                    {groupPermissions.map((permission) => (
                      <ClickableTableRow key={permission.key} label={`Lihat detail ${permission.label}`} onOpen={() => setDetailPermission(permission)}>
                        <td><TableText primary={permission.label} secondary={permission.description} /></td>
                        {roles.map((role) => {
                          const checked = matrix[role.id]?.[permission.key] || false
                          const disabledReason = getPermissionDisabledReason(role, permission.key)
                          return (
                            <td className="permissionCheckCell" key={`${role.id}-${permission.key}`}>
                              <RolePermissionSwitch
                                checked={checked}
                                disabled={Boolean(disabledReason)}
                                locked={Boolean(disabledReason)}
                                label={`${checked ? "Nonaktifkan" : "Aktifkan"} ${permission.label} untuk ${role.name}`}
                                onClick={() => togglePermission(role, permission.key)}
                              />
                            </td>
                          )
                        })}
                      </ClickableTableRow>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobilePermissionList">
            {loading && <TableState title="Memuat matrix" description="Mengambil role permission dari Supabase." icon={Lock} />}
            {!loading && activeRole && Object.entries(groupedPermissions).map(([group, groupPermissions]) => (
              <section className="mobilePermissionGroup" key={group}>
                <h3>{group}</h3>
                {groupPermissions.map((permission) => {
                  const checked = matrix[activeRole.id]?.[permission.key] || false
                  const disabledReason = getPermissionDisabledReason(activeRole, permission.key)
                  return (
                    <div
                      className="mobilePermissionItem"
                      role="button"
                      tabIndex={0}
                      key={permission.key}
                      onClick={() => setDetailPermission(permission)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return
                        event.preventDefault()
                        setDetailPermission(permission)
                      }}
                    >
                      <span>
                        <strong>{permission.label}</strong>
                        <small>{permission.description}</small>
                      </span>
                      <RolePermissionSwitch
                        checked={checked}
                        disabled={Boolean(disabledReason)}
                        locked={Boolean(disabledReason)}
                        label={`${checked ? "Nonaktifkan" : "Aktifkan"} ${permission.label}`}
                        onClick={() => togglePermission(activeRole, permission.key)}
                      />
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        </OperationalTableCard>
      </section>

      <RolePermissionDetailDialog
        permission={detailPermission}
        role={activeRole}
        enabled={Boolean(activeRole && detailPermission && matrix[activeRole.id]?.[detailPermission.key])}
        disabledReason={activeRole && detailPermission ? getPermissionDisabledReason(activeRole, detailPermission.key) : ""}
        onClose={() => setDetailPermission(null)}
        onToggle={() => {
          if (activeRole && detailPermission) togglePermission(activeRole, detailPermission.key)
        }}
      />
      <ConfirmDialog
        open={saveConfirmOpen}
        tone="default"
        icon={FileCheck2}
        eyebrow="Simpan Permission"
        title={activeRole ? `Simpan perubahan ${activeRole.name}?` : "Simpan perubahan permission?"}
        description="Perubahan akan langsung mempengaruhi akses user pada login/session berikutnya."
        confirmLabel="Simpan Matrix"
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setSaveConfirmOpen(false)
        }}
        onConfirm={() => void handleSaveMatrix()}
      >
        {activeRole && (
          <div className="confirmDialogPreview">
            <span>{activeRole.code}</span>
            <strong>{activeRole.name}</strong>
            <small>{changedCount} permission berubah</small>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={resetConfirmOpen}
        tone="warning"
        icon={AlertTriangle}
        eyebrow="Reset Default"
        title={activeRole ? `Reset ${activeRole.name} ke default DMS?` : "Reset permission default?"}
        description="Matrix role akan dikembalikan ke template awal sistem dan dicatat di audit log."
        confirmLabel="Reset Default"
        cancelLabel="Batal"
        loading={saving}
        onClose={() => {
          if (!saving) setResetConfirmOpen(false)
        }}
        onConfirm={() => void handleResetDefaults()}
      >
        {activeRole && (
          <div className="confirmDialogPreview">
            <span>{activeRole.code}</span>
            <strong>{activeRole.name}</strong>
            <small>{activeRole.userCount} user terkait</small>
          </div>
        )}
      </ConfirmDialog>
      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </OperationalPageShell>
  )
}

function RolePermissionSwitch({
  checked,
  disabled,
  locked,
  label,
  onClick,
}: {
  checked: boolean
  disabled?: boolean
  locked?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={clsx("permissionSwitchButton", checked && "checked", locked && "locked")}
      type="button"
      aria-label={label}
      aria-pressed={checked}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <span />
    </button>
  )
}

function RolePermissionDetailDialog({
  permission,
  role,
  enabled,
  disabledReason,
  onClose,
  onToggle,
}: {
  permission: PermissionDefinition | null
  role: RolePermissionRole | null
  enabled: boolean
  disabledReason: string
  onClose: () => void
  onToggle: () => void
}) {
  if (!permission || !role) return null

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog rolePermissionDetailDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="masterDetailTitle">
            <span className="masterDetailIcon">
              <Lock size={22} />
            </span>
            <div>
              <span>{permission.group}</span>
              <h2 id="permission-detail-title">{permission.label}</h2>
              <p>{permission.description}</p>
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail permission" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="masterDetailBody">
          <div className="masterDetailGrid">
            <div className="masterDetailField"><span>Role</span><strong>{role.name}</strong></div>
            <div className="masterDetailField"><span>Kode Role</span><strong>{role.code}</strong></div>
            <div className="masterDetailField"><span>Permission Key</span><strong>{permission.key}</strong></div>
            <div className="masterDetailField"><span>Status</span><strong>{enabled ? "Aktif" : "Nonaktif"}</strong></div>
            <div className="masterDetailField"><span>User Terkait</span><strong>{role.userCount} user</strong></div>
            <div className="masterDetailField"><span>Proteksi</span><strong>{disabledReason || "Bisa diubah"}</strong></div>
          </div>
        </div>
        <div className="masterDetailActions">
          <button className="secondaryButton" type="button" onClick={onClose}>Tutup</button>
          <button className={clsx("primaryButton", enabled && "dangerButton")} type="button" disabled={Boolean(disabledReason)} onClick={onToggle}>
            {enabled ? <Lock size={16} /> : <FileCheck2 size={16} />}
            {enabled ? "Nonaktifkan" : "Aktifkan"}
          </button>
        </div>
      </section>
    </div>
  )
}

function AuditLogPage({ activeView }: { activeView: ViewId }) {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [detailEvent, setDetailEvent] = useState<{ event: AuditEvent; index: number } | null>(null)

  const refreshEvents = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_name, action, target_table, target_id, status, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error

      const mappedEvents = ((data || []) as Array<Record<string, unknown>>).map((row) => {
        const targetTable = String(row.target_table || "-")
        const targetId = String(row.target_id || "")
        const metadata = row.metadata && typeof row.metadata === "object"
          ? JSON.stringify(row.metadata, null, 2)
          : String(row.metadata || "{}")

        return {
          id: String(row.id || `${targetTable}-${targetId}-${row.created_at}`),
          time: formatUserDateTime(String(row.created_at || ""), "-"),
          actor: String(row.actor_name || "System"),
          action: String(row.action || "-"),
          target: targetId ? `${targetTable} / ${formatShortId(targetId, "REF")}` : targetTable,
          targetTable,
          targetId,
          status: String(row.status || "success"),
          metadata,
          createdAt: String(row.created_at || ""),
        }
      })

      setEvents(mappedEvents)
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Audit log belum bisa dimuat."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshEvents()
  }, [refreshEvents])

  const successCount = events.filter((event) => event.status.toLowerCase() === "success").length
  const reviewCount = events.filter((event) => ["pending", "review"].includes(event.status.toLowerCase())).length
  const failedCount = events.filter((event) => event.status.toLowerCase() === "failed").length

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle="Riwayat aktivitas user, perubahan permission, invite user, login, dan audit keamanan sistem."
      />

      <OperationalKpiGrid>
        <OperationalKpiCard label="Event" value={events.length} detail="100 aktivitas terbaru" icon={FileBarChart} tone="blue" />
        <OperationalKpiCard label="Success" value={successCount} detail="Aktivitas aman" icon={FileCheck2} tone="green" />
        <OperationalKpiCard label="Review" value={reviewCount} detail="Butuh pengecekan" icon={AlertTriangle} tone="amber" />
        <OperationalKpiCard label="Failed" value={failedCount} detail="Perlu investigasi" icon={AlertCircle} tone="rose" />
      </OperationalKpiGrid>

      <OperationalTableCard>
        <div className="tableHeader">
          <div>
            <h2>Audit Log</h2>
            <p>Data live dari Supabase untuk melacak perubahan penting di management app.</p>
          </div>
          <button className="secondaryButton" type="button" onClick={() => void refreshEvents()} disabled={loading}>
            <FileCheck2 size={17} />
            Refresh Log
          </button>
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
              {loading && (
                <tr>
                  <td className="tableStateCell" colSpan={7}>
                    <TableState title="Memuat audit log" description="Mengambil riwayat aktivitas dari Supabase." icon={FileBarChart} />
                  </td>
                </tr>
              )}
              {!loading && errorMessage && (
                <tr>
                  <td className="tableStateCell" colSpan={7}>
                    <TableState title="Gagal memuat audit" description={errorMessage} icon={AlertTriangle} tone="danger" />
                  </td>
                </tr>
              )}
              {!loading && !errorMessage && events.length === 0 && (
                <tr>
                  <td className="tableStateCell" colSpan={7}>
                    <TableState title="Belum ada audit log" description="Aktivitas akan muncul setelah ada perubahan data." icon={Search} />
                  </td>
                </tr>
              )}
              {!loading && !errorMessage && events.map((event, index) => (
                <ClickableTableRow key={event.id} label={`Lihat detail audit ${event.action}`} onOpen={() => setDetailEvent({ event, index })}>
                  <td className="tableNumberCell"><TableNumberCell value={index + 1} /></td>
                  <td><TableText primary={event.time} /></td>
                  <td><TableText primary={event.actor} /></td>
                  <td><TableText primary={event.action} /></td>
                  <td><TableText primary={event.targetTable} secondary={event.targetId ? formatShortId(event.targetId, "REF") : undefined} /></td>
                  <td><ModuleStatusBadge value={event.status} /></td>
                  <td className="tableActionCell">
                    <div className="rowActions">
                      <RowActionButton label={`Lihat detail audit ${event.action}`} onClick={() => setDetailEvent({ event, index })} />
                    </div>
                  </td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>
      <AuditLogDetailDialog detailEvent={detailEvent} onClose={() => setDetailEvent(null)} />
    </OperationalPageShell>
  )
}

function AuditLogDetailDialog({ detailEvent, onClose }: { detailEvent: { event: AuditEvent; index: number } | null; onClose: () => void }) {
  if (!detailEvent) return null

  const { event, index } = detailEvent

  return createPortal(
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
        onMouseDown={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="masterDetailTitle">
            <span className="masterDetailIcon">
              <FileBarChart size={22} />
            </span>
            <div>
              <span>Audit Log</span>
              <h2 id="audit-detail-title">{event.action}</h2>
              <p>Detail aktivitas sistem untuk kebutuhan audit dan compliance.</p>
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail audit" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="masterDetailBody">
          <div className="masterDetailGrid">
            <div className="masterDetailField"><span>No</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
            <div className="masterDetailField"><span>Waktu</span><strong>{event.time}</strong></div>
            <div className="masterDetailField"><span>Actor</span><strong>{event.actor}</strong></div>
            <div className="masterDetailField"><span>Action</span><strong>{event.action}</strong></div>
            <div className="masterDetailField"><span>Target</span><strong>{event.target}</strong></div>
            <div className="masterDetailField"><span>Target ID</span><strong>{event.targetId ? formatShortId(event.targetId, "REF") : "-"}</strong></div>
            <div className="masterDetailField"><span>Status</span><strong>{event.status}</strong></div>
          </div>
          <div className="masterDetailNote">
            <span>Metadata</span>
            <strong>{event.metadata}</strong>
          </div>
        </div>

        <div className="masterDetailActions">
          <button className="secondaryButton" type="button" onClick={onClose}>Tutup</button>
        </div>
      </section>
    </div>,
    document.body,
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
              <span>Kode User</span>
              <strong>{profile.userCode || formatShortId(profile.id, "USR")}</strong>
            </div>
            <div>
              <span>Auth ID</span>
              <strong>{formatShortId(profile.authUserId, "AUTH")}</strong>
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
      calculationUnit: row.calculationUnit === "hour" || row.calculationUnit === "day" ? row.calculationUnit : "fixed",
      rateAmount: String(row.rateAmount || 0),
      dayType: row.dayType === "weekday" || row.dayType === "sunday" || row.dayType === "holiday" ? row.dayType : "all",
      autoDetectOvertime: row.autoDetectOvertime === true,
      requiresApproval: row.requiresApproval !== false,
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
              <SelectFormField label="Unit Hitung" value={values.calculationUnit} onChange={(event) => setValues((current) => ({ ...current, calculationUnit: event.target.value as MasterDataFormValues["calculationUnit"] }))} required>
                <option value="fixed">Nominal Tetap</option>
                <option value="hour">Per Jam</option>
                <option value="day">Per Hari</option>
              </SelectFormField>
              <TextFormField label={values.calculationUnit === "hour" ? "Rate Per Jam" : "Nominal Rate"} type="number" min={0} value={values.rateAmount} onChange={(event) => setValues((current) => ({ ...current, rateAmount: event.target.value }))} placeholder="20000" required />
              <SelectFormField label="Tipe Hari" value={values.dayType} onChange={(event) => setValues((current) => ({ ...current, dayType: event.target.value as MasterDataFormValues["dayType"] }))} required>
                <option value="all">Semua Hari</option>
                <option value="weekday">Weekday</option>
                <option value="sunday">Minggu</option>
                <option value="holiday">Hari Libur</option>
              </SelectFormField>
              <SwitchFormField
                label="Auto Detect Lembur"
                checked={values.autoDetectOvertime}
                onChange={(checked) => setValues((current) => ({
                  ...current,
                  autoDetectOvertime: checked,
                  componentType: checked ? "earning" : current.componentType,
                  calculationUnit: checked ? "hour" : current.calculationUnit,
                }))}
              />
              <SwitchFormField
                label="Wajib Approval"
                checked={values.requiresApproval}
                onChange={(checked) => setValues((current) => ({ ...current, requiresApproval: checked }))}
              />
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
  const [data, setData] = useState<OperationsFoundationData>({ rows: [], allRows: [], locations: [], reviews: [], overtime: [] })
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    let active = true

    setLoading(true)
    setErrorMessage("")
    void loadOperationsFoundationData()
      .then((nextData) => {
        if (active) setData(nextData)
      })
      .catch((error) => {
        if (active) setErrorMessage(getFriendlySupabaseError(error, "Gagal mengambil data absensi dan payroll."))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const totals = useMemo(() => {
    const rows = data.rows

    return {
      activeEmployees: rows.length,
      validToday: rows.filter((employee) => employee.attendanceStatus === "valid").length,
      pending: rows.filter((employee) => employee.attendanceStatus === "pending" || employee.attendanceStatus === "failed").length,
      payrollReady: rows.filter((employee) => employee.payrollStatus === "ready").length,
      payrollPreview: rows.reduce((sum, employee) => sum + employee.payrollAmount, 0),
    }
  }, [data.rows])

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
                <strong>{formatCurrency(totals.payrollPreview)} preview payroll</strong>
                <span>Dihitung dari cycle kerja valid yang sudah masuk.</span>
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
        <EmployeeTable rows={data.rows} loading={loading} errorMessage={errorMessage} />
      </section>
    </OperationalPageShell>
  )
}

function EmployeeTable({ rows, loading, errorMessage }: { rows: AttendanceMonitorRow[]; loading: boolean; errorMessage: string }) {
  const [detailRow, setDetailRow] = useState<AttendanceMonitorRow | null>(null)

  return (
    <>
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
              <col style={{ width: "230px" }} />
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
                <th>Preview</th>
                <th className="tableActionHeader">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="tableStateCell" colSpan={10}>
                    <TableState title="Memuat absensi" description="Mengambil data absensi, GPS, face, dan payroll cycle dari Supabase." icon={Megaphone} />
                  </td>
                </tr>
              )}
              {!loading && errorMessage && (
                <tr>
                  <td className="tableStateCell" colSpan={10}>
                    <TableState title="Gagal memuat absensi" description={errorMessage} icon={AlertTriangle} tone="danger" />
                  </td>
                </tr>
              )}
              {!loading && !errorMessage && rows.length === 0 && (
                <tr>
                  <td className="tableStateCell" colSpan={10}>
                    <TableState title="Belum ada karyawan aktif" description="Tambahkan karyawan dan absensi untuk mulai memonitor payroll cycle." icon={UsersRound} />
                  </td>
                </tr>
              )}
              {!loading && !errorMessage && rows.map((employee, index) => (
                <ClickableTableRow key={employee.id} label={`Lihat detail ${employee.fullName}`} onOpen={() => setDetailRow(employee)}>
                  <td className="tableNumberCell"><TableNumberCell value={index + 1} /></td>
                  <td>
                    <EmployeeIdentityCell fullName={employee.fullName} code={employee.employeeCode} photoUrl={employee.employeePhotoUrl} />
                  </td>
                  <td><TableText primary={employee.divisionName} /></td>
                  <td><TableText primary={employee.workLocationName} secondary={employee.distanceM === null ? "GPS belum masuk" : `${employee.distanceM}m / ${employee.radiusM || "-"}m`} /></td>
                  <td><StatusBadge status={employee.attendanceStatus} /></td>
                  <td>
                    <span className={clsx("faceScore", employee.faceScore && employee.faceScore >= 90 ? "good" : employee.faceScore && employee.faceScore >= 70 ? "warn" : "bad")}>
                      {employee.faceScore ? `${employee.faceScore}%` : "-"}
                    </span>
                  </td>
                  <td>
                    <div className="cycleCell">
                      <ProgressRing value={employee.cycleDays} />
                      <span>{employee.cycleDays}/{employee.targetDays}</span>
                    </div>
                  </td>
                  <td><TableText primary={payrollLabel[employee.payrollStatus]} /></td>
                  <td><TableText primary={employee.payrollAmount ? formatCurrency(employee.payrollAmount) : "-"} secondary={employeeSalaryTypeLabel[employee.salaryType]} /></td>
                  <td className="tableActionCell">
                    <div className="rowActions">
                      <RowActionButton label={`Lihat detail ${employee.fullName}`} onClick={() => setDetailRow(employee)} />
                    </div>
                  </td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>
      <AttendanceMonitorDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
    </>
  )
}

function AttendanceMonitorDetailDialog({
  row,
  onClose,
  onResetDay,
  onCorrectCheckout,
}: {
  row: AttendanceMonitorRow | null
  onClose: () => void
  onResetDay?: (row: AttendanceMonitorRow) => void
  onCorrectCheckout?: (row: AttendanceMonitorRow) => void
}) {
  if (!row) return null

  const logStatusLabel: Record<AttendanceLogStatus | "missing", string> = {
    valid: "Valid",
    review: "Menunggu review",
    rejected: "Ditolak",
    missing: "Belum ada data",
  }
  const gpsLogLabel: Record<AttendanceGpsStatus | "missing", string> = {
    valid: "Dalam radius",
    out_of_radius: "Di luar radius",
    missing: "GPS belum masuk",
  }
  const faceLogLabel: Record<AttendanceFaceStatus, string> = {
    verified: "Wajah cocok",
    review: "Perlu review",
    failed: "Wajah tidak cocok",
    not_required: "Tidak wajib",
  }
  const eventRows = [
    {
      label: "Check-in",
      time: row.checkInAt ? formatAttendanceTime(row.checkInAt) : "Belum masuk",
      status: logStatusLabel[row.checkInStatus],
      gps: row.checkInDistanceM === null ? gpsLogLabel[row.checkInGpsStatus] : `${gpsLogLabel[row.checkInGpsStatus]} · ${row.checkInDistanceM}m / ${row.radiusM || "-"}m`,
      face: row.checkInFaceScore === null ? faceLogLabel[row.checkInFaceStatus] : `${row.checkInFaceScore}% · ${faceLogLabel[row.checkInFaceStatus]}`,
      notes: row.checkInNotes,
      tone: row.checkInStatus === "valid" ? "valid" : row.checkInStatus === "rejected" ? "failed" : row.checkInStatus === "missing" ? "missing" : "pending",
    },
    {
      label: "Check-out",
      time: row.checkOutAt ? formatAttendanceTime(row.checkOutAt) : "Belum pulang",
      status: logStatusLabel[row.checkOutStatus],
      gps: row.checkOutDistanceM === null ? gpsLogLabel[row.checkOutGpsStatus] : `${gpsLogLabel[row.checkOutGpsStatus]} · ${row.checkOutDistanceM}m / ${row.radiusM || "-"}m`,
      face: row.checkOutFaceScore === null ? faceLogLabel[row.checkOutFaceStatus] : `${row.checkOutFaceScore}% · ${faceLogLabel[row.checkOutFaceStatus]}`,
      notes: row.checkOutNotes,
      tone: row.checkOutStatus === "valid" ? "valid" : row.checkOutStatus === "rejected" ? "failed" : row.checkOutStatus === "missing" ? "missing" : "pending",
    },
  ]
  const summaryRows = [
    { label: "Karyawan", value: `${row.employeeCode} · ${row.divisionName || "-"}` },
    { label: "Lokasi kerja", value: `${row.workLocationName || "-"} · radius ${row.radiusM || "-"}m` },
    { label: "Jam kerja real", value: row.workDurationLabel },
    { label: "Payroll cycle", value: row.payrollCycleNumber ? `Cycle ${row.payrollCycleNumber} · ${row.cycleDays}/${row.targetDays} hari` : `${row.cycleDays}/${row.targetDays} hari` },
    { label: "Periode", value: formatPayrollPeriod(row) },
    { label: "Tipe gaji", value: `${employeeSalaryTypeLabel[row.salaryType]} · ${row.basePayrollAmount ? formatCurrency(row.basePayrollAmount) : "-"}` },
    { label: "Total payroll", value: `${row.payrollAmount ? formatCurrency(row.payrollAmount) : "-"} · ${payrollLabel[row.payrollStatus]}` },
  ]
  const hasAttendance = Boolean(row.checkInId || row.checkOutId)
  const canCorrectCheckout = Boolean(row.checkInId && !row.checkOutId && isMissingCheckoutShift(row.checkInAt, row.checkOutAt, row.attendanceDate))

  return createPortal(
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog attendanceMonitorDetailDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-monitor-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="masterDetailTitle">
            <span className="masterDetailIcon employeeDetailAvatar">
              {row.employeePhotoUrl ? <img src={row.employeePhotoUrl} alt="" /> : <span className="employeeDetailInitials">{getProfileInitials(row.fullName || row.employeeCode)}</span>}
            </span>
            <div>
              <span>Attendance Monitor</span>
              <h2 id="attendance-monitor-detail-title">{row.fullName}</h2>
              <p>Ringkasan absensi, GPS radius, face verification, dan payroll cycle karyawan.</p>
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="masterDetailBody">
          <div className="attendanceDetailStory">
            <div className="attendanceDetailTimeline">
              {eventRows.map((event) => (
                <div className="attendanceDetailEvent" key={event.label}>
                  <span className={clsx("attendanceDetailDot", event.tone)} />
                  <div className="attendanceDetailEventMain">
                    <div>
                      <small>{event.label}</small>
                      <strong>{event.time}</strong>
                    </div>
                    <UiStatusBadge tone={event.tone as AttendanceStatus}>{event.status}</UiStatusBadge>
                  </div>
                  <p><LocateFixed size={15} />{event.gps}</p>
                  <p><ScanFace size={15} />{event.face}</p>
                  {event.notes && <em>{event.notes}</em>}
                </div>
              ))}
            </div>

            <dl className="attendanceDetailList">
              {summaryRows.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {row.notes && (
            <div className="masterDetailRelation">
              <small>Catatan</small>
              <div>
                <span>
                  <em>HR Note</em>
                  <strong>{row.notes}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="masterDetailActions">
          {canCorrectCheckout && onCorrectCheckout && (
            <button className="secondaryButton" type="button" onClick={() => {
              onClose()
              onCorrectCheckout(row)
            }}>
              <CalendarCheck2 size={17} />
              Koreksi Pulang
            </button>
          )}
          {hasAttendance && onResetDay && (
            <button className="secondaryButton dangerSoftButton" type="button" onClick={() => {
              onClose()
              onResetDay(row)
            }}>
              <RotateCcw size={17} />
              Reset Absensi Hari Ini
            </button>
          )}
          <button className="secondaryButton" type="button" onClick={onClose}>Tutup</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function AttendanceCyclePage({ activeView }: { activeView: "attendance-live" | "attendance-requests" | "attendance-review" | "field-monitoring" | "payroll" }) {
  const [data, setData] = useState<OperationsFoundationData>({ rows: [], allRows: [], locations: [], reviews: [], overtime: [] })
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedDate, setSelectedDate] = useState(getLocalDateKey())
  const [attendanceDateMode, setAttendanceDateMode] = useState<AttendanceDateMode>("today")
  const [recapRange, setRecapRange] = useState<AttendanceRecapRange>("day")
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [fieldSubmitting, setFieldSubmitting] = useState(false)
  const [faceEnrollmentOpen, setFaceEnrollmentOpen] = useState(false)
  const [faceEnrollmentSubmitting, setFaceEnrollmentSubmitting] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<AttendanceReviewRow | null>(null)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [overtimeTarget, setOvertimeTarget] = useState<OvertimeReviewRow | null>(null)
  const [overtimeSubmitting, setOvertimeSubmitting] = useState(false)
  const [payrollTarget, setPayrollTarget] = useState<AttendanceMonitorRow | null>(null)
  const [payrollAction, setPayrollAction] = useState<PayrollProcessAction>("lock")
  const [payrollSubmitting, setPayrollSubmitting] = useState(false)
  const [resetAttendanceRow, setResetAttendanceRow] = useState<AttendanceMonitorRow | null>(null)
  const [resetAttendanceSubmitting, setResetAttendanceSubmitting] = useState(false)
  const [checkoutCorrectionRow, setCheckoutCorrectionRow] = useState<AttendanceMonitorRow | null>(null)
  const [checkoutCorrectionSubmitting, setCheckoutCorrectionSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const showToast = (message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() })
  }

  const refreshData = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      const nextData = await loadOperationsFoundationData(selectedDate)
      setData(nextData)
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "Gagal mengambil foundation absensi dan payroll."))
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    let active = true

    setLoading(true)
    setErrorMessage("")
    void loadOperationsFoundationData(selectedDate)
      .then((nextData) => {
        if (active) setData(nextData)
      })
      .catch((error) => {
        if (active) setErrorMessage(getFriendlySupabaseError(error, "Gagal mengambil foundation absensi dan payroll."))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedDate])

  const handleFieldAttendanceSubmit = async (payload: FieldAttendanceSubmitPayload) => {
    setFieldSubmitting(true)
    try {
      const result = await submitFieldAttendance(payload)
      setFieldDialogOpen(false)
      showToast({
        tone: result.log.status === "valid" ? "success" : "error",
        title: result.log.status === "valid" ? "Absensi tersimpan" : "Masuk review HR",
        description: `${result.employee.name} • ${result.log.distance_m}m dari radius ${result.log.radius_m}m • face ${result.log.face_score ?? "-"}%.`,
      })
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal absensi",
        description: getFriendlySupabaseError(error, "Absensi lapangan belum bisa disimpan."),
      })
    } finally {
      setFieldSubmitting(false)
    }
  }

  const handleFaceEnrollmentSubmit = async (payload: FaceEnrollmentSubmitPayload) => {
    setFaceEnrollmentSubmitting(true)
    try {
      await submitEmployeeFaceEnrollment(
        payload.snapshotsBase64,
        "image/jpeg",
        "Registrasi wajah awal dari app lapangan.",
        "",
        payload.faceEmbeddings,
        payload.faceEmbeddingModel,
      )
      setFaceEnrollmentOpen(false)
      showToast({
        tone: "success",
        title: "Wajah terkirim",
        description: "Registrasi wajah masuk antrian review HR. Setelah approved, absensi face bisa dipakai.",
      })
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal daftar wajah",
        description: getFriendlySupabaseError(error, "Registrasi wajah belum bisa disimpan."),
      })
    } finally {
      setFaceEnrollmentSubmitting(false)
    }
  }

  const openReviewDialog = (row: AttendanceReviewRow) => {
    setReviewTarget(row)
  }

  const handleReviewSubmit = async (decision: "approve" | "reject", notes: string) => {
    if (!reviewTarget) return

    setReviewSubmitting(true)
    try {
      await reviewAttendanceLog(reviewTarget.id, decision, notes)
      showToast({
        tone: "success",
        title: decision === "approve" ? "Absensi disetujui" : "Absensi ditolak",
        description: `${reviewTarget.fullName} sudah diproses dan payroll cycle diperbarui.`,
      })
      setReviewTarget(null)
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal review absensi",
        description: getFriendlySupabaseError(error, "Approval absensi belum bisa diproses."),
      })
    } finally {
      setReviewSubmitting(false)
    }
  }

  const handleApproveReviewGroup = async (rows: AttendanceReviewRow[]) => {
    if (!rows.length) return

    setReviewSubmitting(true)
    try {
      await Promise.all(rows.map((row) => reviewAttendanceLog(row.id, "approve", "Approved bersama dari antrian harian.")))
      showToast({
        tone: "success",
        title: rows.length > 1 ? "Review harian disetujui" : "Absensi disetujui",
        description: `${rows[0].fullName} · ${rows.length} event sudah diproses.`,
      })
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal approve review",
        description: getFriendlySupabaseError(error, "Approval absensi belum bisa diproses."),
      })
    } finally {
      setReviewSubmitting(false)
    }
  }

  const handleOvertimeReviewSubmit = async (decision: "approve" | "reject", approvedMinutes: number, notes: string) => {
    if (!overtimeTarget) return

    setOvertimeSubmitting(true)
    try {
      await reviewOvertimeRequest(overtimeTarget.id, decision, approvedMinutes, notes)
      showToast({
        tone: "success",
        title: decision === "approve" ? "Lembur disetujui" : "Lembur ditolak",
        description: `${overtimeTarget.fullName} • ${formatMinutesDuration(approvedMinutes)} • payroll preview diperbarui.`,
      })
      setOvertimeTarget(null)
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal review lembur",
        description: getFriendlySupabaseError(error, "Review lembur belum bisa diproses."),
      })
    } finally {
      setOvertimeSubmitting(false)
    }
  }

  const openPayrollProcessDialog = (row: AttendanceMonitorRow, action: PayrollProcessAction) => {
    setPayrollTarget(row)
    setPayrollAction(action)
  }

  const handlePayrollProcessSubmit = async (notes: string) => {
    if (!payrollTarget) return

    setPayrollSubmitting(true)
    try {
      await processPayrollCycle(payrollTarget.payrollCycleId, payrollAction, notes)
      showToast({
        tone: "success",
        title: payrollAction === "lock"
          ? "Payroll dikunci"
          : payrollAction === "mark_paid"
            ? "Payroll ditandai terbayar"
            : payrollAction === "unlock"
              ? "Payroll dibuka ulang"
              : payrollAction === "void"
                ? "Payroll dibatalkan"
                : "Payroll direstore",
        description: `${payrollTarget.fullName} • ${formatCurrency(payrollTarget.payrollAmount)} • ${payrollLabel[payrollTarget.payrollStatus]}.`,
      })
      setPayrollTarget(null)
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal proses payroll",
        description: getFriendlySupabaseError(error, "Payroll belum bisa diproses."),
      })
    } finally {
      setPayrollSubmitting(false)
    }
  }

  const handleResetAttendanceSubmit = async () => {
    if (!resetAttendanceRow) return

    setResetAttendanceSubmitting(true)
    try {
      await resetAttendanceDay(
        resetAttendanceRow.employeeId,
        resetAttendanceRow.attendanceDate,
        "Reset data testing dari Live Absensi management.",
      )
      showToast({
        tone: "success",
        title: "Absensi direset",
        description: `${resetAttendanceRow.fullName} bisa test ulang check-in dan check-out untuk ${formatEmployeeDate(resetAttendanceRow.attendanceDate)}.`,
      })
      setResetAttendanceRow(null)
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal reset absensi",
        description: getFriendlySupabaseError(error, "Data absensi belum bisa direset."),
      })
    } finally {
      setResetAttendanceSubmitting(false)
    }
  }

  const handleCheckoutCorrectionSubmit = async (checkOutTime: string, notes: string) => {
    if (!checkoutCorrectionRow) return

    setCheckoutCorrectionSubmitting(true)
    try {
      await correctMissingCheckout(
        checkoutCorrectionRow.employeeId,
        checkoutCorrectionRow.attendanceDate,
        checkOutTime,
        notes || "Koreksi checkout manual oleh HR.",
      )
      showToast({
        tone: "success",
        title: "Checkout dikoreksi",
        description: `${checkoutCorrectionRow.fullName} ditutup pukul ${checkOutTime} untuk ${formatEmployeeDate(checkoutCorrectionRow.attendanceDate)}.`,
      })
      setCheckoutCorrectionRow(null)
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal koreksi checkout",
        description: getFriendlySupabaseError(error, "Checkout belum bisa dikoreksi."),
      })
    } finally {
      setCheckoutCorrectionSubmitting(false)
    }
  }

  const todayDate = getLocalDateKey()
  const isTodayView = selectedDate === todayDate && attendanceDateMode === "today"
  const attendanceDateRange = getAttendanceDateRange(selectedDate, attendanceDateMode)
  const liveAttendanceSourceRows = activeView === "attendance-live" && !["today", "yesterday", "day"].includes(attendanceDateMode)
    ? data.allRows
    : data.rows
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredRows = liveAttendanceSourceRows.filter((row) => {
    const matchesDate = activeView !== "attendance-live"
      || attendanceDateMode === "all"
      || (row.attendanceDate >= attendanceDateRange.start && row.attendanceDate <= attendanceDateRange.end)
    const matchesSearch = normalizedSearch
      ? [row.employeeCode, row.fullName, row.divisionName, row.workLocationName, row.logStatus, row.gpsStatus, row.faceStatus].join(" ").toLowerCase().includes(normalizedSearch)
      : true
    const matchesStatus = statusFilter === "all"
      || row.attendanceStatus === statusFilter
      || row.payrollStatus === statusFilter

    return matchesDate && matchesSearch && matchesStatus
  })
  const filteredReviewRows = data.reviews.filter((row) => {
    const matchesSearch = normalizedSearch
      ? [row.employeeCode, row.fullName, row.divisionName, row.workLocationName, row.status, row.gpsStatus, row.faceStatus, row.issueLabel].join(" ").toLowerCase().includes(normalizedSearch)
      : true
    const matchesStatus = statusFilter === "all"
      || row.status === statusFilter
      || row.gpsStatus === statusFilter
      || row.faceStatus === statusFilter

    return matchesSearch && matchesStatus
  })
  const readyPayrollRows = data.rows.filter((row) => row.payrollStatus === "ready")
  const lockedPayrollRows = data.rows.filter((row) => row.payrollStatus === "locked")
  const paidPayrollRows = data.rows.filter((row) => row.payrollStatus === "paid")
  const voidPayrollRows = data.rows.filter((row) => row.payrollStatus === "void")
  const reviewRows = data.rows.filter((row) => row.attendanceStatus === "pending" || row.attendanceStatus === "failed")
  const gpsReadyLocations = data.locations.filter((location) => location.isReady)
  const faceVerifiedRows = data.rows.filter((row) => row.faceStatus === "verified")
  const payrollPreviewTotal = [...readyPayrollRows, ...lockedPayrollRows].reduce((sum, row) => sum + row.payrollAmount, 0)
  const filteredOvertimeRows = data.overtime.filter((row) => {
    const matchesSearch = normalizedSearch
      ? [row.employeeCode, row.fullName, row.divisionName, row.componentName, row.status, row.dayType].join(" ").toLowerCase().includes(normalizedSearch)
      : true
    const matchesStatus = statusFilter === "all" || row.status === statusFilter || row.dayType === statusFilter

    return matchesSearch && matchesStatus
  })
  const pendingOvertimeRows = data.overtime.filter((row) => row.status === "pending")
  const approvedOvertimeTotal = data.overtime.reduce((sum, row) => sum + (row.status === "approved" ? row.totalAmount : 0), 0)
  const isDateDrivenView = activeView === "attendance-live" || activeView === "attendance-requests"
  const rangeStartDate = getAttendanceRecapRangeStart(selectedDate, recapRange)
  const recapSourceRows = recapRange === "day" ? data.rows : data.allRows
  const filteredRecapRows = recapSourceRows.filter((row) => {
    const inRange = recapRange === "day"
      ? row.attendanceDate === selectedDate
      : row.attendanceDate >= rangeStartDate && row.attendanceDate <= selectedDate
    if (!inRange) return false

    const matchesSearch = normalizedSearch
      ? [row.employeeCode, row.fullName, row.divisionName, row.workLocationName, row.attendanceStatus, row.gpsStatus, row.faceStatus].join(" ").toLowerCase().includes(normalizedSearch)
      : true
    const matchesStatus = statusFilter === "all"
      || row.attendanceStatus === statusFilter
      || row.payrollStatus === statusFilter
      || row.gpsStatus === statusFilter
      || row.faceStatus === statusFilter

    return matchesSearch && matchesStatus
  })
  const pageSubtitle = activeView === "payroll"
    ? "Preview payroll otomatis dari 26 hari kerja valid, lembur approved, tipe gaji, dan cycle berjalan."
    : activeView === "attendance-review"
      ? "Approve atau reject absensi bermasalah sebelum masuk hitungan payroll cycle."
    : activeView === "attendance-requests"
      ? "Rekap check-in, check-out, jam kerja, validasi GPS/face, dan status hari kerja per tanggal."
    : activeView === "field-monitoring"
      ? "Monitoring titik lokasi kerja, radius GPS, kesiapan koordinat, dan aktivitas absensi per lokasi."
      : "Pantau absensi realtime dengan validasi GPS radius, face verification, dan progress payroll cycle."

  return (
    <OperationalPageShell>
      <PageHeader
        activeView={activeView}
        subtitle={pageSubtitle}
        actions={
          <>
            <button className="secondaryButton" type="button" onClick={refreshData} disabled={loading}>
              <FileCheck2 size={17} />
              Refresh Data
            </button>
            {activeView === "attendance-live" && (
              <>
                <button className="secondaryButton" type="button" onClick={() => setFaceEnrollmentOpen(true)}>
                  <ScanFace size={17} />
                  Daftar Wajah
                </button>
                <button className="primaryButton" type="button" onClick={() => setFieldDialogOpen(true)}>
                  <LocateFixed size={17} />
                  Tes Absensi Lapangan
                </button>
              </>
            )}
          </>
        }
        meta={
          <InlinePageStats
            items={[
              `${filteredRows.length} karyawan`,
              activeView === "attendance-review" ? `${filteredReviewRows.length} antrian review` : `${gpsReadyLocations.length} lokasi GPS siap`,
              `${faceVerifiedRows.length} face valid`,
              activeView === "payroll" ? `${readyPayrollRows.length} siap · ${lockedPayrollRows.length} locked · ${paidPayrollRows.length} terbayar · ${voidPayrollRows.length} void` : `${readyPayrollRows.length} cycle siap`,
            ]}
          />
        }
      />

      {activeView !== "attendance-live" && activeView !== "attendance-review" && activeView !== "attendance-requests" && (
        <OperationalKpiGrid>
          <OperationalKpiCard label="Absen Valid" value={data.rows.filter((row) => row.attendanceStatus === "valid").length} detail={isTodayView ? "Hari ini" : formatWorkDate(selectedDate)} icon={UserRoundCheck} tone="green" />
          <OperationalKpiCard label="Butuh Review" value={reviewRows.length} detail="GPS/face/perlu approval" icon={AlertTriangle} tone="amber" />
          <OperationalKpiCard label="Lokasi GPS" value={`${gpsReadyLocations.length}/${data.locations.length}`} detail="Koordinat + radius siap" icon={LocateFixed} tone="blue" />
          <OperationalKpiCard label="Preview Payroll" value={formatCurrency(payrollPreviewTotal)} detail="Pokok + lembur approved" icon={BadgeDollarSign} tone="violet" />
        </OperationalKpiGrid>
      )}

      <OperationalFilterPanel>
        {isDateDrivenView && (
          <div className="filterField dateFilterField">
            <label>Tanggal</label>
            <AttendanceDateFilter
              value={selectedDate}
              mode={attendanceDateMode}
              onChange={(nextDate, nextMode) => {
                setSelectedDate(nextDate)
                setAttendanceDateMode(nextMode)
              }}
            />
          </div>
        )}
        {activeView === "attendance-requests" && (
          <div className="filterField recapRangeField">
            <label>Range</label>
            <div className="recapRangeControl" role="tablist" aria-label="Range rekap absensi">
              <button className={clsx(recapRange === "day" && "active")} type="button" onClick={() => setRecapRange("day")}>Harian</button>
              <button className={clsx(recapRange === "week" && "active")} type="button" onClick={() => setRecapRange("week")}>7 Hari</button>
              <button className={clsx(recapRange === "month" && "active")} type="button" onClick={() => setRecapRange("month")}>30 Hari</button>
            </div>
          </div>
        )}
        <div className="filterField">
          <label>Search</label>
          <div className="uiInput inputWithIcon compact">
            <Search size={16} />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari karyawan, lokasi, GPS, face..." />
          </div>
        </div>
        <div className="filterField">
          <label>Status</label>
          <select className="uiSelectTrigger" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Semua Status</option>
            <option value="valid">Absensi Valid</option>
            <option value="pending">Review</option>
            <option value="review">Perlu Review</option>
            <option value="rejected">Ditolak</option>
            <option value="failed">Failed</option>
            <option value="out_of_radius">Luar Radius</option>
            <option value="verified">Face Valid</option>
            <option value="missing">Belum Absen</option>
            <option value="ready">Siap Gajian</option>
            <option value="locked">Locked</option>
            <option value="active">Cycle Aktif</option>
            <option value="paid">Terbayar</option>
            <option value="void">Void</option>
            <option value="pending">Lembur Pending</option>
            <option value="approved">Lembur Approved</option>
            <option value="weekday">Lembur Weekday</option>
            <option value="sunday">Lembur Minggu</option>
          </select>
        </div>
        <button className="secondaryButton" type="button" onClick={() => {
          setSearchTerm("")
          setStatusFilter("all")
          if (isDateDrivenView) {
            setSelectedDate(todayDate)
            setAttendanceDateMode("today")
          }
        }}>Reset Filter</button>
      </OperationalFilterPanel>

      {(activeView === "attendance-live" || activeView === "attendance-requests") && (
        <AttendanceLiveRecap rows={activeView === "attendance-requests" ? filteredRecapRows : filteredRows} selectedDate={selectedDate} range={activeView === "attendance-requests" ? recapRange : "day"} />
      )}

      {activeView === "field-monitoring" ? (
        <LocationRadiusTable locations={data.locations} loading={loading} errorMessage={errorMessage} />
      ) : activeView === "attendance-review" ? (
        <AttendanceReviewTable rows={filteredReviewRows} loading={loading || reviewSubmitting} errorMessage={errorMessage} onReview={openReviewDialog} onApproveAll={handleApproveReviewGroup} />
      ) : activeView === "attendance-requests" ? (
        <AttendanceRecapTable rows={filteredRecapRows} loading={loading} errorMessage={errorMessage} selectedDate={selectedDate} range={recapRange} onResetDay={setResetAttendanceRow} onCorrectCheckout={setCheckoutCorrectionRow} />
      ) : activeView === "payroll" ? (
        <>
          <PayrollPreviewTable rows={filteredRows} loading={loading} errorMessage={errorMessage} overtimeTotal={approvedOvertimeTotal} onProcess={openPayrollProcessDialog} />
          <OvertimeReviewTable rows={filteredOvertimeRows} loading={loading} errorMessage={errorMessage} onReview={setOvertimeTarget} />
        </>
      ) : (
        <LiveAttendanceTable rows={filteredRows} loading={loading} errorMessage={errorMessage} selectedDate={selectedDate} onResetDay={setResetAttendanceRow} onCorrectCheckout={setCheckoutCorrectionRow} />
      )}

      <FieldAttendanceDialog
        open={fieldDialogOpen}
        saving={fieldSubmitting}
        onClose={() => setFieldDialogOpen(false)}
        onSubmit={handleFieldAttendanceSubmit}
      />
      <FaceEnrollmentDialog
        open={faceEnrollmentOpen}
        saving={faceEnrollmentSubmitting}
        onClose={() => setFaceEnrollmentOpen(false)}
        onSubmit={handleFaceEnrollmentSubmit}
      />
      <AttendanceReviewDialog
        row={reviewTarget}
        saving={reviewSubmitting}
        onClose={() => setReviewTarget(null)}
        onSubmit={handleReviewSubmit}
      />
      <OvertimeReviewDialog
        row={overtimeTarget}
        saving={overtimeSubmitting}
        onClose={() => setOvertimeTarget(null)}
        onSubmit={handleOvertimeReviewSubmit}
      />
      <PayrollProcessDialog
        row={payrollTarget}
        action={payrollAction}
        saving={payrollSubmitting}
        onClose={() => setPayrollTarget(null)}
        onSubmit={handlePayrollProcessSubmit}
      />
      <ConfirmDialog
        open={Boolean(resetAttendanceRow)}
        tone="danger"
        icon={RotateCcw}
        eyebrow="Reset Testing"
        title={resetAttendanceRow ? `Reset absensi ${resetAttendanceRow.fullName}?` : "Reset absensi hari ini?"}
        description="Check-in, check-out, dan snapshot wajah di tanggal ini akan dihapus agar karyawan bisa testing ulang dari app lapangan."
        confirmLabel="Reset Absensi"
        cancelLabel="Batal"
        loading={resetAttendanceSubmitting}
        onClose={() => {
          if (!resetAttendanceSubmitting) setResetAttendanceRow(null)
        }}
        onConfirm={() => void handleResetAttendanceSubmit()}
      >
        {resetAttendanceRow && (
          <div className="confirmDialogPreview">
            <span>{resetAttendanceRow.employeeCode} · {formatEmployeeDate(resetAttendanceRow.attendanceDate)}</span>
            <strong>{resetAttendanceRow.fullName}</strong>
            <small>{resetAttendanceRow.checkInAt ? `Masuk ${formatAttendanceTime(resetAttendanceRow.checkInAt)}` : "Belum check-in"} · {resetAttendanceRow.checkOutAt ? `Pulang ${formatAttendanceTime(resetAttendanceRow.checkOutAt)}` : "Belum check-out"}</small>
          </div>
        )}
      </ConfirmDialog>
      <CheckoutCorrectionDialog
        row={checkoutCorrectionRow}
        saving={checkoutCorrectionSubmitting}
        onClose={() => {
          if (!checkoutCorrectionSubmitting) setCheckoutCorrectionRow(null)
        }}
        onSubmit={handleCheckoutCorrectionSubmit}
      />
      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </OperationalPageShell>
  )
}

function CheckoutCorrectionDialog({
  row,
  saving,
  onClose,
  onSubmit,
}: {
  row: AttendanceMonitorRow | null
  saving: boolean
  onClose: () => void
  onSubmit: (checkOutTime: string, notes: string) => void
}) {
  const [checkOutTime, setCheckOutTime] = useState("17:00")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!row) return
    setCheckOutTime(addMinutesToIsoTimeInput(row.checkInAt, 8 * 60, "17:00"))
    setNotes("")
    setError("")
  }, [row])

  if (!row) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!checkOutTime) {
      setError("Jam pulang wajib diisi untuk menutup hari kerja.")
      return
    }

    onSubmit(checkOutTime, notes)
  }

  return createPortal(
    <div className="dialogBackdrop" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <section
        className="dialogPanel checkoutCorrectionDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-correction-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader">
          <div className="dialogHeaderCopy">
            <span>Koreksi HR</span>
            <h2 id="checkout-correction-title">Tutup checkout {row.fullName}</h2>
            <p>Dipakai saat karyawan lupa absen pulang. Hari kerja baru dihitung setelah koreksi ini disimpan.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup koreksi checkout" onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <form className="checkoutCorrectionBody" onSubmit={handleSubmit}>
          <div className="checkoutCorrectionSummary">
            <span className="attendanceMonitorIcon pending"><CalendarCheck2 size={20} /></span>
            <div>
              <small>{row.employeeCode} · {formatEmployeeDate(row.attendanceDate)}</small>
              <strong>{row.checkInAt ? `Masuk ${formatAttendanceTime(row.checkInAt)}` : "Belum ada check-in"}</strong>
              <p>{row.workLocationName} · {row.divisionName}</p>
            </div>
          </div>

          <div className="checkoutCorrectionFields">
            <TextFormField label="Jam Pulang" type="time" value={checkOutTime} onChange={(event) => setCheckOutTime(event.target.value)} required />
            <TextFormField label="Catatan HR" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contoh: lupa checkout, dikoreksi sesuai konfirmasi supervisor" />
          </div>

          <div className="checkoutCorrectionNotice">
            <AlertCircle size={17} />
            <span>Log check-in akan diset valid, checkout manual dibuat sebagai sumber management, lalu payroll cycle diperbarui.</span>
          </div>

          {error && <p className="formErrorMessage">{error}</p>}

          <div className="attendanceReviewActions">
            <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>Batal</button>
            <button className="primaryButton" type="submit" disabled={saving}>
              <FileCheck2 size={17} />
              {saving ? "Menyimpan..." : "Simpan Koreksi"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}

function LiveAttendanceTable({
  rows,
  loading,
  errorMessage,
  selectedDate,
  onResetDay,
  onCorrectCheckout,
}: {
  rows: AttendanceMonitorRow[]
  loading: boolean
  errorMessage: string
  selectedDate: string
  onResetDay: (row: AttendanceMonitorRow) => void
  onCorrectCheckout: (row: AttendanceMonitorRow) => void
}) {
  const [detailRow, setDetailRow] = useState<AttendanceMonitorRow | null>(null)

  return (
    <>
      <OperationalTableCard>
        <div className="tableHeader">
          <div>
            <h2>Realtime Attendance Feed</h2>
            <p>Data check-in dan check-out {formatWorkDate(selectedDate)} dari GPS radius, face verification, dan workday counted.</p>
          </div>
        </div>
        <div className="tableScroller uiDataTableScroller uiDataTableHasColumns liveAttendanceTableScroller">
          <table>
            <colgroup>
              <col className="tableNumberColumn" />
              <col style={{ width: "270px" }} />
              <col style={{ width: "390px" }} />
              <col style={{ width: "330px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "86px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>No</th>
                <th>Karyawan</th>
                <th>Aktivitas Hari Ini</th>
                <th>Validasi Lapangan</th>
                <th>Cycle</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="tableStateCell" colSpan={7}><TableState title="Memuat absensi" description="Mengambil live feed absensi." icon={Megaphone} /></td></tr>}
              {!loading && errorMessage && <tr><td className="tableStateCell" colSpan={7}><TableState title="Gagal memuat" description={errorMessage} icon={AlertTriangle} tone="danger" /></td></tr>}
              {!loading && !errorMessage && rows.map((row, index) => {
                const canCorrectCheckout = Boolean(row.checkInId && !row.checkOutId && isMissingCheckoutShift(row.checkInAt, row.checkOutAt, row.attendanceDate))

                return (
                  <ClickableTableRow key={row.id} label={`Lihat detail absensi ${row.fullName}`} onOpen={() => setDetailRow(row)}>
                    <td><TableNumberCell value={index + 1} /></td>
                    <td><EmployeeIdentityCell fullName={row.fullName} code={row.employeeCode} photoUrl={row.employeePhotoUrl} /></td>
                    <td><AttendanceTimelineCell row={row} /></td>
                    <td><AttendanceValidationCell row={row} /></td>
                    <td><span className="cycleCell"><ProgressRing value={row.cycleDays} /><span>{row.cycleDays}/{row.targetDays}</span></span></td>
                    <td><StatusBadge status={row.attendanceStatus} /></td>
                    <td className="tableActionCell">
                      <div className="rowActions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <RowActionMenu label={`Aksi absensi ${row.fullName}`}>
                          <RowActionMenuItem onClick={() => setDetailRow(row)}>
                            <Eye size={15} />
                            Detail
                          </RowActionMenuItem>
                          <RowActionMenuItem disabled={!canCorrectCheckout} onClick={() => onCorrectCheckout(row)}>
                            <CalendarCheck2 size={15} />
                            Koreksi Pulang
                          </RowActionMenuItem>
                          <RowActionMenuItem danger disabled={!row.checkInId && !row.checkOutId} onClick={() => onResetDay(row)}>
                            <RotateCcw size={15} />
                            Reset Tanggal Ini
                          </RowActionMenuItem>
                        </RowActionMenu>
                      </div>
                    </td>
                  </ClickableTableRow>
                )
              })}
              {!loading && !errorMessage && rows.length === 0 && <tr><td className="tableStateCell" colSpan={7}><TableState title="Tidak ada data" description="Belum ada feed sesuai filter." icon={Search} /></td></tr>}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>
      <AttendanceMonitorDetailDialog row={detailRow} onClose={() => setDetailRow(null)} onResetDay={onResetDay} onCorrectCheckout={onCorrectCheckout} />
    </>
  )
}

function AttendanceLiveRecap({ rows, selectedDate, range = "day" }: { rows: AttendanceMonitorRow[]; selectedDate: string; range?: AttendanceRecapRange }) {
  const checkedIn = rows.filter((row) => row.checkInId).length
  const checkedOut = rows.filter((row) => row.checkOutId).length
  const review = rows.filter((row) => row.attendanceStatus === "pending").length
  const failed = rows.filter((row) => row.attendanceStatus === "failed").length
  const missing = rows.filter((row) => !row.checkInId).length
  const missingCheckout = rows.filter((row) => row.checkInId && !row.checkOutId).length
  const workdayCounted = rows.filter((row) => row.attendanceStatus === "valid" && row.checkInId).length
  const rangeLabel = range === "month" ? "30 hari" : range === "week" ? "7 hari" : "Tanggal"
  const items = [
    { label: rangeLabel, value: formatWorkDate(selectedDate), tone: "neutral" },
    { label: "Masuk", value: checkedIn, tone: "valid" },
    { label: "Pulang", value: checkedOut, tone: "valid" },
    { label: "Belum checkout", value: missingCheckout, tone: missingCheckout ? "pending" : "neutral" },
    { label: "Review", value: review, tone: review ? "pending" : "neutral" },
    { label: "Failed", value: failed, tone: failed ? "failed" : "neutral" },
    { label: "Belum absen", value: missing, tone: missing ? "missing" : "neutral" },
    { label: "Hari kerja valid", value: workdayCounted, tone: "valid" },
  ] as const

  return (
    <div className="attendanceLiveRecap" aria-label={`Rekap absensi ${formatWorkDate(selectedDate)}`}>
      {items.map((item) => (
        <span className={clsx("attendanceLiveRecapItem", `tone-${item.tone}`)} key={item.label}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
        </span>
      ))}
    </div>
  )
}

function AttendanceRecapTable({
  rows,
  loading,
  errorMessage,
  selectedDate,
  range,
  onResetDay,
  onCorrectCheckout,
}: {
  rows: AttendanceMonitorRow[]
  loading: boolean
  errorMessage: string
  selectedDate: string
  range: AttendanceRecapRange
  onResetDay: (row: AttendanceMonitorRow) => void
  onCorrectCheckout: (row: AttendanceMonitorRow) => void
}) {
  const [detailRow, setDetailRow] = useState<AttendanceMonitorRow | null>(null)
  const title = range === "day" ? `Rekap ${formatWorkDate(selectedDate)}` : range === "week" ? `Rekap 7 hari sampai ${formatWorkDate(selectedDate)}` : `Rekap 30 hari sampai ${formatWorkDate(selectedDate)}`

  return (
    <>
      <OperationalTableCard>
        <div className="tableHeader">
          <div>
            <h2>Attendance Recap</h2>
            <p>{title}. Klik baris untuk melihat detail check-in, check-out, GPS, face, dan payroll cycle.</p>
          </div>
        </div>
        <div className="tableScroller uiDataTableScroller uiDataTableHasColumns attendanceRecapTableScroller">
          <table>
            <colgroup>
              <col className="tableNumberColumn" />
              <col style={{ width: "250px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "170px" }} />
              <col style={{ width: "260px" }} />
              <col style={{ width: "130px" }} />
              <col className="tableActionColumn" />
            </colgroup>
            <thead>
              <tr>
                <th>No</th>
                <th>Karyawan</th>
                <th>Tanggal</th>
                <th>Masuk</th>
                <th>Pulang</th>
                <th>Jam Kerja</th>
                <th>Validasi</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="tableStateCell" colSpan={9}><TableState title="Memuat rekap" description="Mengambil data absensi dari attendance logs." icon={CalendarCheck2} /></td></tr>}
              {!loading && errorMessage && <tr><td className="tableStateCell" colSpan={9}><TableState title="Gagal memuat" description={errorMessage} icon={AlertTriangle} tone="danger" /></td></tr>}
              {!loading && !errorMessage && rows.map((row, index) => {
                const canCorrectCheckout = Boolean(row.checkInId && !row.checkOutId && isMissingCheckoutShift(row.checkInAt, row.checkOutAt, row.attendanceDate))
                const durationMeta = row.checkInId && row.checkOutId ? "Final" : row.checkInId ? canCorrectCheckout ? "Perlu koreksi HR" : "Berjalan" : "Belum mulai"

                return (
                  <ClickableTableRow key={`${row.employeeId}-${row.attendanceDate}-${row.checkInId || "missing"}`} label={`Lihat rekap absensi ${row.fullName}`} onOpen={() => setDetailRow(row)}>
                    <td><TableNumberCell value={index + 1} /></td>
                    <td><EmployeeIdentityCell fullName={row.fullName} code={row.employeeCode} photoUrl={row.employeePhotoUrl} /></td>
                    <td><TableText primary={formatWorkDate(row.attendanceDate)} secondary={row.divisionName} /></td>
                    <td><RecapEventText eventType="check_in" time={row.checkInAt} status={row.checkInStatus} /></td>
                    <td><RecapEventText eventType="check_out" time={row.checkOutAt} status={row.checkOutStatus} /></td>
                    <td><TableText primary={row.workDurationLabel} secondary={durationMeta} /></td>
                    <td><RecapValidationSummary row={row} /></td>
                    <td><StatusBadge status={row.attendanceStatus} /></td>
                    <td className="tableActionCell">
                      <div className="rowActions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <RowActionMenu label={`Aksi rekap ${row.fullName}`}>
                          <RowActionMenuItem onClick={() => setDetailRow(row)}>
                            <Eye size={15} />
                            Detail
                          </RowActionMenuItem>
                          <RowActionMenuItem disabled={!canCorrectCheckout} onClick={() => onCorrectCheckout(row)}>
                            <CalendarCheck2 size={15} />
                            Koreksi Pulang
                          </RowActionMenuItem>
                          <RowActionMenuItem danger disabled={!row.checkInId && !row.checkOutId} onClick={() => onResetDay(row)}>
                            <RotateCcw size={15} />
                            Reset Data Ini
                          </RowActionMenuItem>
                        </RowActionMenu>
                      </div>
                    </td>
                  </ClickableTableRow>
                )
              })}
              {!loading && !errorMessage && rows.length === 0 && <tr><td className="tableStateCell" colSpan={9}><TableState title="Tidak ada rekap" description="Belum ada data absensi sesuai filter tanggal/range." icon={Search} /></td></tr>}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>
      <AttendanceMonitorDetailDialog row={detailRow} onClose={() => setDetailRow(null)} onResetDay={onResetDay} onCorrectCheckout={onCorrectCheckout} />
    </>
  )
}

function RecapEventText({ eventType, time, status }: { eventType: "check_in" | "check_out"; time: string; status: AttendanceLogStatus | "missing" }) {
  const tone = status === "valid" ? "valid" : status === "review" ? "pending" : status === "rejected" ? "failed" : "missing"
  return (
    <span className={clsx("recapEventText", `tone-${tone}`)}>
      <span>{eventType === "check_in" ? "Masuk" : "Pulang"}</span>
      <strong>{time ? formatAttendanceTime(time) : "Belum"}</strong>
      <small>{status === "missing" ? "Belum ada" : status}</small>
    </span>
  )
}

function RecapValidationSummary({ row }: { row: AttendanceMonitorRow }) {
  const distance = row.checkOutDistanceM ?? row.checkInDistanceM
  const radius = row.radiusM
  const gpsStatus = row.checkOutId ? row.checkOutGpsStatus : row.checkInGpsStatus
  const faceScore = row.checkOutFaceScore ?? row.checkInFaceScore ?? row.faceScore
  const faceStatus = row.checkOutId ? row.checkOutFaceStatus : row.checkInFaceStatus
  const gpsText = distance === null || distance === undefined
    ? "GPS kosong"
    : `${distance}m${radius ? ` dari ${radius}m` : ""}`

  return (
    <div className="recapValidationSummary">
      <span className={clsx("recapValidationPill", gpsStatus === "valid" && "valid", gpsStatus === "out_of_radius" && "failed")}>
        <LocateFixed size={14} />
        {gpsText}
      </span>
      <span className={clsx("recapValidationPill", faceStatus === "verified" && "valid", faceStatus === "review" && "pending", faceStatus === "failed" && "failed")}>
        <ScanFace size={14} />
        {faceScore === null || faceScore === undefined ? "Face -" : `${faceScore}% face`}
      </span>
    </div>
  )
}

function AttendanceReviewTable({
  rows,
  loading,
  errorMessage,
  onReview,
  onApproveAll,
}: {
  rows: AttendanceReviewRow[]
  loading: boolean
  errorMessage: string
  onReview: (row: AttendanceReviewRow) => void
  onApproveAll: (rows: AttendanceReviewRow[]) => void
}) {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const groups = useMemo(() => groupAttendanceReviewRows(rows), [rows])

  return (
    <OperationalTableCard>
      <div className="tableHeader">
        <div>
          <h2>Attendance Review Queue</h2>
          <p>Satu baris adalah satu karyawan per tanggal. Klik baris untuk melihat review check-in dan check-out.</p>
        </div>
      </div>
      <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
        <table>
          <colgroup>
            <col className="tableNumberColumn" />
            <col style={{ width: "260px" }} />
            <col style={{ width: "170px" }} />
            <col style={{ width: "260px" }} />
            <col style={{ width: "230px" }} />
            <col style={{ width: "170px" }} />
            <col className="tableActionColumn" />
          </colgroup>
          <thead>
            <tr>
              <th>No</th>
              <th>Karyawan</th>
              <th>Tanggal</th>
              <th>Aktivitas Review</th>
              <th>Issue</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="tableStateCell" colSpan={7}><TableState title="Memuat review" description="Mengambil antrian absensi bermasalah." icon={ClipboardList} /></td></tr>}
            {!loading && errorMessage && <tr><td className="tableStateCell" colSpan={7}><TableState title="Gagal memuat" description={errorMessage} icon={AlertTriangle} tone="danger" /></td></tr>}
            {!loading && !errorMessage && groups.map((group, index) => {
              const isOpen = openGroupId === group.id
              const reviewEvents = [group.checkIn, group.checkOut].filter(Boolean) as AttendanceReviewRow[]

              return (
                <Fragment key={group.id}>
                  <tr className={clsx("clickableTableRow attendanceReviewGroupRow", isOpen && "active")} tabIndex={0} onClick={() => setOpenGroupId(isOpen ? null : group.id)} onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setOpenGroupId(isOpen ? null : group.id)
                    }
                  }}>
                    <td><TableNumberCell value={index + 1} /></td>
                    <td><AttendanceReviewGroupEmployeeCell group={group} /></td>
                    <td><TableText primary={formatWorkDate(group.attendanceDate)} secondary={`${group.reviewCount} event review`} /></td>
                    <td><AttendanceReviewGroupActivity group={group} /></td>
                    <td><TableText primary={group.issues.join(", ")} secondary={group.workDurationLabel} /></td>
                    <td><UiStatusBadge tone="pending">Review</UiStatusBadge></td>
                    <td className="tableActionCell">
                      <div className="rowActions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <button className="rowExpandButton" type="button" aria-label={isOpen ? "Tutup detail review" : "Buka detail review"} onClick={() => setOpenGroupId(isOpen ? null : group.id)}>
                          <ChevronDown size={18} />
                        </button>
                        <RowActionMenu>
                          <RowActionMenuItem onClick={() => setOpenGroupId(isOpen ? null : group.id)}>
                            <Eye size={16} />
                            {isOpen ? "Tutup Detail" : "Lihat Detail"}
                          </RowActionMenuItem>
                          <RowActionMenuItem disabled={reviewEvents.length === 0} onClick={() => onApproveAll(reviewEvents)}>
                            <FileCheck2 size={16} />
                            Approve Semua
                          </RowActionMenuItem>
                        </RowActionMenu>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="attendanceReviewExpandRow">
                      <td />
                      <td colSpan={6}>
                        <div className="attendanceReviewExpandPanel">
                          <AttendanceReviewEventPanel
                            label="Absen Masuk"
                            eventType="check_in"
                            row={group.checkIn}
                            pairedAt={group.pairedCheckInAt}
                            pairedStatus={group.pairedCheckInStatus}
                            onReview={onReview}
                          />
                          <AttendanceReviewEventPanel
                            label="Absen Pulang"
                            eventType="check_out"
                            row={group.checkOut}
                            pairedAt={group.pairedCheckOutAt}
                            pairedStatus={group.pairedCheckOutStatus}
                            onReview={onReview}
                          />
                          {reviewEvents.length > 1 && (
                            <button className="primaryButton compactButton attendanceReviewApproveAll" type="button" onClick={() => onApproveAll(reviewEvents)}>
                              <FileCheck2 size={16} />
                              Approve Masuk & Pulang
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!loading && !errorMessage && groups.length === 0 && <tr><td className="tableStateCell" colSpan={7}><TableState title="Antrian bersih" description="Tidak ada absensi yang butuh review saat ini." icon={FileCheck2} /></td></tr>}
          </tbody>
        </table>
      </div>
    </OperationalTableCard>
  )
}

function groupAttendanceReviewRows(rows: AttendanceReviewRow[]) {
  const groups = new Map<string, AttendanceReviewGroup>()

  rows.forEach((row) => {
    const groupId = `${row.employeeId}:${row.attendanceDate}`
    const existing = groups.get(groupId)
    const issues = existing?.issues || []
    const nextIssues = issues.includes(row.issueLabel) ? issues : [...issues, row.issueLabel]
    const nextGroup: AttendanceReviewGroup = existing || {
      id: groupId,
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      employeePhotoUrl: row.employeePhotoUrl,
      divisionName: row.divisionName,
      workLocationName: row.workLocationName,
      attendanceDate: row.attendanceDate,
      pairedCheckInAt: row.pairedCheckInAt,
      pairedCheckInStatus: row.pairedCheckInStatus,
      pairedCheckOutAt: row.pairedCheckOutAt,
      pairedCheckOutStatus: row.pairedCheckOutStatus,
      reviewCount: 0,
      issues: [],
      workDurationLabel: row.workDurationLabel,
      status: "review",
    }

    if (row.eventType === "check_out") nextGroup.checkOut = row
    else nextGroup.checkIn = row

    nextGroup.reviewCount += 1
    nextGroup.issues = nextIssues
    if (!nextGroup.pairedCheckInAt && row.pairedCheckInAt) {
      nextGroup.pairedCheckInAt = row.pairedCheckInAt
      nextGroup.pairedCheckInStatus = row.pairedCheckInStatus
    }
    if (!nextGroup.pairedCheckOutAt && row.pairedCheckOutAt) {
      nextGroup.pairedCheckOutAt = row.pairedCheckOutAt
      nextGroup.pairedCheckOutStatus = row.pairedCheckOutStatus
    }
    nextGroup.workDurationLabel = row.workDurationLabel || nextGroup.workDurationLabel
    groups.set(groupId, nextGroup)
  })

  return Array.from(groups.values())
}

function AttendanceReviewGroupEmployeeCell({ group }: { group: AttendanceReviewGroup }) {
  return (
    <EmployeeIdentityCell fullName={group.fullName} code={group.employeeCode} photoUrl={group.employeePhotoUrl} secondary={`${group.employeeCode} · ${group.divisionName}`} />
  )
}

function AttendanceReviewGroupActivity({ group }: { group: AttendanceReviewGroup }) {
  return (
    <div className="attendanceReviewGroupActivity">
      <AttendanceReviewMiniEvent label="Masuk" row={group.checkIn} pairedAt={group.pairedCheckInAt} pairedStatus={group.pairedCheckInStatus} />
      <AttendanceReviewMiniEvent label="Pulang" row={group.checkOut} pairedAt={group.pairedCheckOutAt} pairedStatus={group.pairedCheckOutStatus} />
    </div>
  )
}

function AttendanceReviewMiniEvent({
  label,
  row,
  pairedAt,
  pairedStatus,
}: {
  label: string
  row?: AttendanceReviewRow
  pairedAt: string
  pairedStatus: AttendanceLogStatus | "missing"
}) {
  const effectiveStatus = row?.status || pairedStatus
  const tone = effectiveStatus === "rejected" ? "failed" : effectiveStatus === "valid" ? "valid" : effectiveStatus === "review" ? "pending" : "missing"
  const timeLabel = row ? formatAttendanceTime(row.eventAt) : pairedAt ? formatAttendanceTime(pairedAt) : "Belum ada"

  return (
    <span className={clsx("attendanceReviewMiniEvent", `tone-${tone}`)}>
      <span>{label}</span>
      <strong>{timeLabel}</strong>
    </span>
  )
}

function AttendanceReviewEventPanel({
  label,
  eventType,
  row,
  pairedAt,
  pairedStatus,
  onReview,
}: {
  label: string
  eventType: AttendanceReviewRow["eventType"]
  row?: AttendanceReviewRow
  pairedAt: string
  pairedStatus: AttendanceLogStatus | "missing"
  onReview: (row: AttendanceReviewRow) => void
}) {
  if (!row) {
    const hasPairedEvent = Boolean(pairedAt)
    const panelTone = pairedStatus === "valid" ? "valid" : pairedStatus === "rejected" ? "failed" : pairedStatus === "review" ? "pending" : "empty"

    return (
      <div className={clsx("attendanceReviewEventPanel", eventType === "check_out" && "checkout", `tone-${panelTone}`)}>
        <span className="attendanceReviewEventPanelIcon">
          {hasPairedEvent && pairedStatus === "valid" ? <ShieldCheck size={17} /> : <AlertCircle size={17} />}
        </span>
        <div>
          <strong>{label}{hasPairedEvent ? ` · ${formatAttendanceTime(pairedAt)}` : ""}</strong>
          <p>{getAttendanceReviewEventCopy(pairedStatus, eventType)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx("attendanceReviewEventPanel", row.eventType === "check_out" && "checkout", "tone-pending")}>
      <span className="attendanceReviewEventPanelIcon">
        {row.eventType === "check_out" ? <LogOut size={17} /> : <LogIn size={17} />}
      </span>
      <div className="attendanceReviewEventPanelMain">
        <strong>{label} · {formatAttendanceTime(row.eventAt)}</strong>
        <p>{row.issueLabel} · {row.workLocationName} · {row.distanceM === null ? "GPS kosong" : `${row.distanceM}m dari radius ${row.radiusM || "-"}m`}</p>
      </div>
      <AttendanceEvidenceCell row={row} />
      <button className="secondaryButton compactButton" type="button" onClick={() => onReview(row)}>
        <Eye size={15} />
        Review Event
      </button>
    </div>
  )
}

function getAttendanceReviewEventCopy(status: AttendanceLogStatus | "missing", eventType: AttendanceReviewRow["eventType"]) {
  if (status === "valid") return "Sudah valid, tidak masuk antrian review."
  if (status === "rejected") return "Sudah ditolak HR, tidak dihitung payroll."
  if (status === "review") return "Masih menunggu keputusan HR."
  return eventType === "check_out" ? "Belum ada absen pulang pada tanggal ini." : "Belum ada absen masuk pada tanggal ini."
}

function getAttendanceEventLabel(eventType: AttendanceReviewRow["eventType"]) {
  return eventType === "check_out" ? "Absen Pulang" : "Absen Masuk"
}

function getAttendanceLogStatusLabel(status: AttendanceLogStatus | "missing") {
  if (status === "valid") return "Valid"
  if (status === "review") return "Review"
  if (status === "rejected") return "Ditolak"
  return "Belum ada"
}

function getAttendancePairSummary(row: AttendanceReviewRow) {
  const checkIn = row.pairedCheckInAt ? `Masuk ${formatAttendanceTime(row.pairedCheckInAt)}` : "Masuk belum ada"
  const checkOut = row.pairedCheckOutAt ? `Pulang ${formatAttendanceTime(row.pairedCheckOutAt)}` : "Pulang belum ada"
  return `${checkIn} · ${checkOut}`
}

function AttendanceEvidenceCell({ row }: { row: AttendanceReviewRow }) {
  const hasGps = Boolean(row.latitude && row.longitude)
  const hasFace = Boolean(row.faceSnapshotUrl)
  const gpsTone = row.gpsStatus === "valid" ? "valid" : row.gpsStatus === "out_of_radius" ? "failed" : "pending"
  const faceTone = row.faceStatus === "verified" ? "valid" : row.faceStatus === "failed" ? "failed" : "pending"

  return (
    <div className="attendanceEvidenceCell">
      <span className={clsx("attendanceEvidencePill", gpsTone)}>
        <LocateFixed size={14} />
        {hasGps ? `${row.distanceM ?? "-"}m dari ${row.radiusM || "-"}m` : "GPS kosong"}
      </span>
      <span className={clsx("attendanceEvidencePill", faceTone)}>
        <ScanFace size={14} />
        {row.faceScore === null ? (hasFace ? "Foto wajah" : "Foto belum ada") : `${row.faceScore}% face`}
      </span>
    </div>
  )
}

function AttendanceReviewDialog({
  row,
  saving,
  onClose,
  onSubmit,
}: {
  row: AttendanceReviewRow | null
  saving: boolean
  onClose: () => void
  onSubmit: (decision: "approve" | "reject", notes: string) => Promise<void>
}) {
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (row) setNotes("")
  }, [row])

  if (!row) return null

  const mapsUrl = buildAttendanceMapsUrl(row)
  const hasGps = Boolean(row.latitude && row.longitude)
  const insideRadius = row.gpsStatus === "valid"
  const hasFaceSnapshot = Boolean(row.faceSnapshotUrl)
  const eventLabel = getAttendanceEventLabel(row.eventType)
  const eventTone = row.eventType === "check_out" ? "checkout" : "checkin"
  const eventDescription = row.eventType === "check_out"
    ? "Keputusan ini hanya memproses log pulang. Log masuk di hari yang sama tetap punya status sendiri."
    : "Keputusan ini hanya memproses log masuk. Log pulang di hari yang sama tetap punya status sendiri."
  const reviewStory = `${row.fullName} melakukan ${eventLabel.toLowerCase()} pukul ${formatAttendanceTime(row.eventAt)} pada ${formatWorkDate(row.attendanceDate)} di ${row.workLocationName}. ${hasGps ? `${insideRadius ? "Posisi masuk radius" : "Posisi di luar radius"} ${row.radiusM || "-"}m dengan jarak ${row.distanceM ?? "-"}m.` : "Koordinat GPS belum tersedia."} ${row.faceScore === null ? "Face score belum tersedia." : `Face score ${row.faceScore}%.`}`
  const distanceRatio = row.distanceM !== null && row.radiusM ? Math.min(1.45, row.distanceM / row.radiusM) : 0
  const userOffset = hasGps ? Math.min(32, Math.max(7, distanceRatio * 24)) : 0
  const mapStyle = {
    "--attendance-user-left": `${50 + userOffset}%`,
    "--attendance-user-top": `${50 - userOffset * 0.46}%`,
  } as CSSProperties

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <section
        className="dialogPanel attendanceReviewDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-review-title"
        aria-describedby="attendance-review-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="attendanceReviewHeader">
          <span className="attendanceReviewHeaderAvatar">
            {row.employeePhotoUrl ? <img src={row.employeePhotoUrl} alt="" /> : getProfileInitials(row.fullName || row.employeeCode)}
          </span>
          <div>
            <span>Attendance Review</span>
            <h2 id="attendance-review-title">Review {eventLabel}</h2>
            <p id="attendance-review-description">{row.fullName} · {row.employeeCode} · {row.divisionName} · {formatEmployeeDate(row.attendanceDate)} {formatAttendanceTime(row.eventAt)}</p>
          </div>
          <span className={clsx("attendanceReviewEventBadge", eventTone)}>
            {row.eventType === "check_out" ? <LogOut size={15} /> : <LogIn size={15} />}
            {eventLabel}
          </span>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail absensi" onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <div className="attendanceReviewContent">
          <div className="attendanceReviewStory">
            <span className={clsx("attendanceReviewStoryIcon", eventTone)}>
              {row.eventType === "check_out" ? <LogOut size={18} /> : <LogIn size={18} />}
            </span>
            <p>{reviewStory}</p>
          </div>

          <div className="attendanceEvidenceBoard">
            <div className="attendanceEvidenceMapCard">
              <div className="attendanceEvidenceMap" style={mapStyle}>
                <span className="attendanceMapGrid" />
                <span className={clsx("attendanceMapRadius", row.gpsStatus)} />
                <span className="attendanceMapOfficePin"><LocateFixed size={20} /></span>
                <span className={clsx("attendanceMapUserPin", row.gpsStatus)}><UserRoundCheck size={18} /></span>
                <span className="attendanceMapDistance">{row.distanceM === null ? "GPS kosong" : `${row.distanceM}m`}</span>
              </div>
              <div className="attendanceEvidenceCardCopy">
                <span>Jarak Absensi</span>
                <strong>{row.distanceM === null ? "GPS belum kebaca" : `${row.distanceM} meter dari lokasi kerja`}</strong>
                <small>{insideRadius ? `Masuk radius ${row.radiusM || "-"}m.` : `Di luar radius ${row.radiusM || "-"}m.`} Lokasi: {row.workLocationName}</small>
              </div>
              <a className={clsx("secondaryButton compactButton", !mapsUrl && "disabledLink")} href={mapsUrl || "#"} target="_blank" rel="noreferrer" aria-disabled={!mapsUrl}>
                <ExternalLink size={15} />
                Buka Maps
              </a>
            </div>

            <div className="attendanceEvidenceFaceCard">
              <button className={clsx("attendanceFacePreview", !hasFaceSnapshot && "empty")} type="button" disabled={!hasFaceSnapshot} aria-label="Lihat bukti wajah absen">
                {hasFaceSnapshot ? <img src={row.faceSnapshotUrl} alt="" /> : <ScanFace size={34} />}
              </button>
              <div className="attendanceEvidenceCardCopy">
                <span>Bukti Wajah</span>
                <strong>{hasFaceSnapshot ? "Foto wajah tersedia" : "Foto wajah belum tersedia"}</strong>
                <small>{row.faceScore === null ? "Face score belum dikirim." : `Face match ${row.faceScore}%. Status ${row.faceStatus}.`}</small>
              </div>
            </div>
          </div>

          <div className="attendanceReviewDayContext">
            <div className={clsx("attendanceReviewDayEvent", row.eventType === "check_in" && "active", row.pairedCheckInStatus)}>
              <span><LogIn size={16} /> Masuk</span>
              <strong>{row.pairedCheckInAt ? formatAttendanceTime(row.pairedCheckInAt) : "Belum ada"}</strong>
              <small>{getAttendanceLogStatusLabel(row.pairedCheckInStatus)}</small>
            </div>
            <div className="attendanceReviewDayLine" />
            <div className={clsx("attendanceReviewDayEvent", row.eventType === "check_out" && "active", row.pairedCheckOutStatus)}>
              <span><LogOut size={16} /> Pulang</span>
              <strong>{row.pairedCheckOutAt ? formatAttendanceTime(row.pairedCheckOutAt) : "Belum ada"}</strong>
              <small>{getAttendanceLogStatusLabel(row.pairedCheckOutStatus)}</small>
            </div>
            <div className="attendanceReviewDayDuration">
              <span>Jam kerja</span>
              <strong>{row.workDurationLabel}</strong>
              <small>{eventDescription}</small>
            </div>
          </div>

          <div className="attendanceReviewSummary">
            <div>
              <span>Jenis Review</span>
              <strong>{eventLabel}</strong>
              <small>{eventDescription}</small>
            </div>
            <div>
              <span>Issue</span>
              <strong>{row.issueLabel}</strong>
              <small>{row.workdayCounted ? "Sudah masuk hitungan payroll" : "Belum dihitung payroll"}</small>
            </div>
            <div>
              <span>Koordinat Absen</span>
              <strong>{hasGps ? `${row.latitude}, ${row.longitude}` : "Belum ada GPS"}</strong>
              <small>Koordinat lokasi: {row.workLocationLatitude && row.workLocationLongitude ? `${row.workLocationLatitude}, ${row.workLocationLongitude}` : "Belum lengkap"}</small>
            </div>
          </div>

          <TextFormField
            label="Catatan HR"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Contoh: valid karena tugas luar terkonfirmasi / reject karena lokasi dan wajah tidak sesuai"
          />
        </div>

        <div className="attendanceReviewActions">
          <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button className="secondaryButton dangerSoftButton" type="button" onClick={() => void onSubmit("reject", notes)} disabled={saving}>
            <X size={16} />
            Reject
          </button>
          <button className="primaryButton" type="button" onClick={() => void onSubmit("approve", notes)} disabled={saving}>
            <FileCheck2 size={16} />
            {saving ? "Memproses..." : `Approve ${eventLabel}`}
          </button>
        </div>
      </section>
    </div>
  )
}

function PayrollProcessDialog({
  row,
  action,
  saving,
  onClose,
  onSubmit,
}: {
  row: AttendanceMonitorRow | null
  action: PayrollProcessAction
  saving: boolean
  onClose: () => void
  onSubmit: (notes: string) => Promise<void> | void
}) {
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (row) setNotes("")
  }, [row, action])

  if (!row) return null

  const copy: Record<PayrollProcessAction, { eyebrow: string; title: string; description: string; button: string; icon: LucideIcon }> = {
    lock: {
      eyebrow: "PAYROLL LOCK",
      title: `Lock payroll ${row.fullName}?`,
      description: "Nominal cycle akan difinalkan dan tidak berubah saat data absensi/lembur direfresh.",
      button: "Lock Payroll",
      icon: Lock,
    },
    mark_paid: {
      eyebrow: "PAYROLL PAYMENT",
      title: `Tandai payroll ${row.fullName} terbayar?`,
      description: "Cycle akan masuk riwayat pembayaran dan tidak bisa berubah otomatis.",
      button: "Tandai Terbayar",
      icon: CreditCard,
    },
    unlock: {
      eyebrow: "PAYROLL REOPEN",
      title: `Buka ulang payroll ${row.fullName}?`,
      description: "Cycle kembali ke status siap gajian supaya nominal bisa dihitung ulang dari data terbaru.",
      button: "Buka Ulang",
      icon: FileCheck2,
    },
    void: {
      eyebrow: "PAYROLL VOID",
      title: `Batalkan cycle payroll ${row.fullName}?`,
      description: "Cycle akan ditandai Void tanpa menghapus data fisik, sehingga audit trail tetap aman.",
      button: "Void Payroll",
      icon: Trash2,
    },
    restore: {
      eyebrow: "PAYROLL RESTORE",
      title: `Restore cycle payroll ${row.fullName}?`,
      description: "Cycle Void akan dikembalikan ke status aktif atau siap gajian sesuai jumlah hari kerja valid.",
      button: "Restore Payroll",
      icon: FileCheck2,
    },
  }
  const current = copy[action]
  const Icon = current.icon

  return createPortal(
    <div className="dialogBackdrop" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <section
        className="dialogPanel payrollProcessDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payroll-process-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="payrollProcessHeader">
          <span className="payrollProcessIcon">
            <Icon size={28} />
          </span>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup payroll" onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
          <span>{current.eyebrow}</span>
          <h2 id="payroll-process-title">{current.title}</h2>
          <p>{current.description}</p>
        </div>

        <div className="payrollProcessSummary">
          <div className="payrollProcessEmployee">
            <EmployeeIdentityCell fullName={row.fullName} code={row.employeeCode} photoUrl={row.employeePhotoUrl} />
            <PayrollStatusBadge status={row.payrollStatus} />
          </div>
          <div className="payrollProcessGrid">
            <div>
              <small>Periode</small>
              <strong>{formatPayrollPeriod(row)}</strong>
            </div>
            <div>
              <small>Cycle</small>
              <strong>{row.cycleDays}/{row.targetDays} hari</strong>
            </div>
            <div>
              <small>Gaji Pokok</small>
              <strong>{formatCurrency(row.basePayrollAmount)}</strong>
            </div>
            <div>
              <small>Lembur Approved</small>
              <strong>{formatCurrency(row.overtimeAmount)}</strong>
            </div>
            <div className="payrollProcessTotal">
              <small>Total Payroll</small>
              <strong>{formatCurrency(row.payrollAmount)}</strong>
            </div>
          </div>
        </div>

        <label className="payrollProcessNotes">
          <span>Catatan Finance</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Contoh: angka sudah dicek dengan HR dan lembur approved."
            disabled={saving}
          />
        </label>

        <div className="attendanceReviewActions">
          <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button className="primaryButton" type="button" onClick={() => void onSubmit(notes)} disabled={saving}>
            <Icon size={16} />
            {saving ? "Memproses..." : current.button}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function PayrollPreviewTable({
  rows,
  loading,
  errorMessage,
  overtimeTotal,
  onProcess,
}: {
  rows: AttendanceMonitorRow[]
  loading: boolean
  errorMessage: string
  overtimeTotal: number
  onProcess: (row: AttendanceMonitorRow, action: PayrollProcessAction) => void
}) {
  const [detailRow, setDetailRow] = useState<AttendanceMonitorRow | null>(null)

  return (
    <>
      <OperationalTableCard>
        <div className="tableHeader">
          <div>
            <h2>Payroll Processing</h2>
            <p>Finalisasi cycle 26 hari kerja: review nominal, lock payroll, lalu tandai terbayar.</p>
            <InlinePageStats items={[`${formatCurrency(overtimeTotal)} lembur approved`, "Ready bisa dikunci", "Locked menunggu pembayaran"]} />
          </div>
          <button className="secondaryButton" type="button" onClick={() => exportPayrollCsv(rows)} disabled={loading || rows.length === 0}>
            <FileBarChart size={17} />
            Export Payroll
          </button>
        </div>
        <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
          <table>
            <colgroup>
              <col className="tableNumberColumn" />
              <col style={{ width: "240px" }} />
              <col style={{ width: "230px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "160px" }} />
              <col style={{ width: "150px" }} />
              <col className="tableActionColumn" />
            </colgroup>
            <thead>
              <tr>
                <th className="tableNumberHeader">No</th>
                <th>Karyawan</th>
                <th>Periode</th>
                <th>Gaji Pokok</th>
                <th>Lembur</th>
                <th>Total Payroll</th>
                <th>Cycle</th>
                <th>Status</th>
                <th className="tableActionHeader">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="tableStateCell" colSpan={9}><TableState title="Memuat payroll" description="Menghitung preview payroll cycle." icon={BadgeDollarSign} /></td></tr>}
              {!loading && errorMessage && <tr><td className="tableStateCell" colSpan={9}><TableState title="Gagal memuat" description={errorMessage} icon={AlertTriangle} tone="danger" /></td></tr>}
              {!loading && !errorMessage && rows.map((row, index) => (
                <ClickableTableRow key={row.employeeId} label={`Lihat detail payroll ${row.fullName}`} onOpen={() => setDetailRow(row)}>
                  <td><TableNumberCell value={index + 1} /></td>
                  <td><EmployeeIdentityCell fullName={row.fullName} code={row.employeeCode} photoUrl={row.employeePhotoUrl} /></td>
                  <td><TableText primary={formatPayrollPeriod(row)} secondary={row.payrollCycleNumber ? `Cycle ${row.payrollCycleNumber} · ${employeeSalaryTypeLabel[row.salaryType]}` : employeeSalaryTypeLabel[row.salaryType]} /></td>
                  <td><TableText primary={row.basePayrollAmount ? formatCurrency(row.basePayrollAmount) : "-"} /></td>
                  <td><TableText primary={row.overtimeAmount ? formatCurrency(row.overtimeAmount) : "-"} /></td>
                  <td><TableText primary={row.payrollAmount ? formatCurrency(row.payrollAmount) : "-"} /></td>
                  <td><span className="cycleCell"><ProgressRing value={row.cycleDays} /><span>{row.cycleDays}/{row.targetDays}</span></span></td>
                  <td><PayrollStatusBadge status={row.payrollStatus} /></td>
                  <td className="tableActionCell">
                    <RowActionMenu label={`Aksi payroll ${row.fullName}`}>
                      <RowActionMenuItem disabled={!row.payrollCycleId || row.payrollStatus !== "ready"} onClick={() => onProcess(row, "lock")}>
                        <Lock size={15} />
                        Lock Payroll
                      </RowActionMenuItem>
                      <RowActionMenuItem disabled={!row.payrollCycleId || row.payrollStatus !== "locked"} onClick={() => onProcess(row, "mark_paid")}>
                        <CreditCard size={15} />
                        Tandai Terbayar
                      </RowActionMenuItem>
                      <RowActionMenuItem disabled={!row.payrollCycleId || row.payrollStatus !== "locked"} onClick={() => onProcess(row, "unlock")}>
                        <FileCheck2 size={15} />
                        Buka Ulang
                      </RowActionMenuItem>
                      <RowActionMenuItem danger disabled={!row.payrollCycleId || row.payrollStatus === "paid" || row.payrollStatus === "void"} onClick={() => onProcess(row, "void")}>
                        <Trash2 size={15} />
                        Void Cycle
                      </RowActionMenuItem>
                      <RowActionMenuItem disabled={!row.payrollCycleId || row.payrollStatus !== "void"} onClick={() => onProcess(row, "restore")}>
                        <FileCheck2 size={15} />
                        Restore
                      </RowActionMenuItem>
                    </RowActionMenu>
                  </td>
                </ClickableTableRow>
              ))}
              {!loading && !errorMessage && rows.length === 0 && <tr><td className="tableStateCell" colSpan={9}><TableState title="Tidak ada payroll" description="Belum ada cycle sesuai filter." icon={Search} /></td></tr>}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>
      <AttendanceMonitorDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
    </>
  )
}

function OvertimeStatusBadge({ status }: { status: OvertimeStatus }) {
  if (status === "approved") return <UiStatusBadge tone="valid">Approved</UiStatusBadge>
  if (status === "rejected") return <UiStatusBadge tone="failed">Rejected</UiStatusBadge>
  if (status === "draft") return <UiStatusBadge tone="missing">Draft</UiStatusBadge>
  return <UiStatusBadge tone="pending">Pending</UiStatusBadge>
}

function OvertimeReviewTable({
  rows,
  loading,
  errorMessage,
  onReview,
}: {
  rows: OvertimeReviewRow[]
  loading: boolean
  errorMessage: string
  onReview: (row: OvertimeReviewRow) => void
}) {
  return (
    <OperationalTableCard>
      <div className="tableHeader">
        <div>
          <h2>Approval Lembur</h2>
          <p>Data otomatis dari check-out yang melewati jam selesai shift. Klik baris untuk review.</p>
        </div>
      </div>
      <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Karyawan</th>
              <th>Tanggal</th>
              <th>Jam Kerja</th>
              <th>Durasi</th>
              <th>Rate</th>
              <th>Preview</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="tableStateCell" colSpan={9}><TableState title="Memuat lembur" description="Mendeteksi check-out yang melewati jam kerja." icon={BadgeDollarSign} /></td></tr>}
            {!loading && errorMessage && <tr><td className="tableStateCell" colSpan={9}><TableState title="Gagal memuat lembur" description={errorMessage} icon={AlertTriangle} tone="danger" /></td></tr>}
            {!loading && !errorMessage && rows.map((row, index) => {
              const previewAmount = row.status === "approved" ? row.totalAmount : Math.round((row.overtimeMinutes / 60) * row.rateAmount)

              return (
                <ClickableTableRow key={row.id} label={`Review lembur ${row.fullName}`} onOpen={() => onReview(row)}>
                  <td><TableNumberCell value={index + 1} /></td>
                  <td>
                    <EmployeeIdentityCell fullName={row.fullName} code={row.employeeCode} photoUrl={row.employeePhotoUrl} secondary={`${row.employeeCode} · ${row.divisionName}`} />
                  </td>
                  <td><TableText primary={formatWorkDate(row.overtimeDate)} secondary={getPayrollDayTypeLabel(row.dayType)} /></td>
                  <td><TableText primary={`${row.shiftStartTime || "--:--"} - ${row.shiftEndTime || "--:--"}`} secondary={`Checkout ${formatAttendanceTime(row.actualCheckOutAt)}`} /></td>
                  <td><TableText primary={formatMinutesDuration(row.overtimeMinutes)} secondary={row.status === "approved" ? `${formatMinutesDuration(row.approvedMinutes)} dibayar` : "Menunggu approval"} /></td>
                  <td><TableText primary={`${formatCurrency(row.rateAmount)}/jam`} secondary={row.componentName} /></td>
                  <td><TableText primary={formatCurrency(previewAmount)} /></td>
                  <td><OvertimeStatusBadge status={row.status} /></td>
                  <td className="tableActionCell">
                    <div className="rowActions">
                      <RowActionButton />
                    </div>
                  </td>
                </ClickableTableRow>
              )
            })}
            {!loading && !errorMessage && rows.length === 0 && <tr><td className="tableStateCell" colSpan={9}><TableState title="Belum ada lembur" description="Kandidat lembur muncul otomatis saat check-out melewati jam selesai shift." icon={Search} /></td></tr>}
          </tbody>
        </table>
      </div>
    </OperationalTableCard>
  )
}

function OvertimeReviewDialog({
  row,
  saving,
  onClose,
  onSubmit,
}: {
  row: OvertimeReviewRow | null
  saving: boolean
  onClose: () => void
  onSubmit: (decision: "approve" | "reject", approvedMinutes: number, notes: string) => void
}) {
  const [approvedMinutes, setApprovedMinutes] = useState("0")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    setApprovedMinutes(String(row?.approvedMinutes || row?.overtimeMinutes || 0))
    setNotes("")
  }, [row])

  if (!row) return null

  const minutes = Math.max(0, Math.min(row.overtimeMinutes, Number(approvedMinutes || 0)))
  const previewAmount = Math.round((minutes / 60) * row.rateAmount)

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel attendanceReviewDialog overtimeReviewDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="overtime-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="attendanceReviewHeader">
          <span className="attendanceReviewHeaderAvatar">
            {row.employeePhotoUrl ? <img src={row.employeePhotoUrl} alt="" /> : getProfileInitials(row.fullName || row.employeeCode)}
          </span>
          <div>
            <span>Overtime Review</span>
            <h2 id="overtime-review-title">Review lembur {row.fullName}</h2>
            <p>Approve menit yang dibayar. Lembur approved akan masuk preview payroll.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup review lembur" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="attendanceReviewContent">
          <div className="overtimeHero">
            <span><BadgeDollarSign size={24} /></span>
            <div>
              <small>{row.componentName} · {getPayrollDayTypeLabel(row.dayType)}</small>
              <strong>{formatMinutesDuration(row.overtimeMinutes)}</strong>
              <p>{formatCurrency(row.rateAmount)}/jam · estimasi {formatCurrency(Math.round((row.overtimeMinutes / 60) * row.rateAmount))}</p>
            </div>
          </div>

          <div className="attendanceReviewSummary">
            <div>
              <span>Karyawan</span>
              <strong>{row.fullName}</strong>
              <small>{row.employeeCode} · {row.divisionName}</small>
            </div>
            <div>
              <span>Tanggal</span>
              <strong>{formatWorkDate(row.overtimeDate)}</strong>
              <small>{getPayrollDayTypeLabel(row.dayType)}</small>
            </div>
            <div>
              <span>Jam Shift</span>
              <strong>{row.shiftStartTime || "--:--"} - {row.shiftEndTime || "--:--"}</strong>
              <small>Checkout {formatAttendanceTime(row.actualCheckOutAt)}</small>
            </div>
            <div>
              <span>Dibayar</span>
              <strong>{formatMinutesDuration(minutes)}</strong>
              <small>{formatCurrency(previewAmount)}</small>
            </div>
          </div>

          <TextFormField
            label="Menit Dibayar"
            type="number"
            min={0}
            max={row.overtimeMinutes}
            value={approvedMinutes}
            onChange={(event) => setApprovedMinutes(event.target.value)}
            required
          />
          <TextFormField
            label="Catatan Finance / HR"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Contoh: lembur produksi disetujui karena closing order."
          />
        </div>

        <div className="attendanceReviewActions">
          <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button className="secondaryButton dangerSoftButton" type="button" onClick={() => onSubmit("reject", 0, notes)} disabled={saving}>
            <X size={16} />
            Reject
          </button>
          <button className="primaryButton" type="button" onClick={() => onSubmit("approve", minutes, notes)} disabled={saving}>
            <FileCheck2 size={16} />
            {saving ? "Memproses..." : "Approve Lembur"}
          </button>
        </div>
      </section>
    </div>
  )
}

function mapFieldLocationToMasterRow(location: FieldLocationSummary): MasterDataRow {
  return {
    id: location.id,
    categoryId: "locations",
    category: "Lokasi Kerja",
    code: location.code,
    name: location.name,
    manager: "HR Manager",
    usedBy: location.latitude && location.longitude ? `${location.latitude}, ${location.longitude}` : location.address || "GPS absensi",
    status: location.isReady ? "Aktif" : "Draft",
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    radiusM: location.radiusM,
  }
}

function LocationRadiusTable({ locations, loading, errorMessage }: { locations: FieldLocationSummary[]; loading: boolean; errorMessage: string }) {
  const [mapTarget, setMapTarget] = useState<MasterDataRow | null>(null)

  const openLocationMap = (location: FieldLocationSummary) => {
    setMapTarget(mapFieldLocationToMasterRow(location))
  }

  return (
    <>
      <OperationalTableCard>
        <div className="tableHeader">
          <div>
            <h2>GPS Radius & Lokasi Kerja</h2>
            <p>Klik baris atau icon maps untuk melihat titik lokasi dan radius valid absensi.</p>
          </div>
        </div>
        <div className="tableScroller uiDataTableScroller uiDataTableHasColumns">
          <table>
            <colgroup>
              <col className="tableNumberColumn" />
              <col style={{ width: "240px" }} />
              <col style={{ width: "290px" }} />
              <col style={{ width: "130px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
              <col className="tableActionColumn" />
            </colgroup>
            <thead>
              <tr>
                <th>No</th>
                <th>Lokasi</th>
                <th>Koordinat</th>
                <th>Radius</th>
                <th>Karyawan</th>
                <th>Hari Ini</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="tableStateCell" colSpan={8}><TableState title="Memuat lokasi" description="Mengambil koordinat dan radius lokasi kerja." icon={LocateFixed} /></td></tr>}
              {!loading && errorMessage && <tr><td className="tableStateCell" colSpan={8}><TableState title="Gagal memuat" description={errorMessage} icon={AlertTriangle} tone="danger" /></td></tr>}
              {!loading && !errorMessage && locations.map((location, index) => (
                <ClickableTableRow key={location.id} label={`Lihat maps ${location.name}`} onOpen={() => openLocationMap(location)}>
                  <td><TableNumberCell value={index + 1} /></td>
                  <td><TableText primary={location.name} secondary={location.code} /></td>
                  <td>
                    <span className="locationCell">
                      <TableText
                        primary={location.latitude && location.longitude ? `${location.latitude}, ${location.longitude}` : "Belum lengkap"}
                        secondary={location.address || "Alamat belum diisi"}
                      />
                      <button
                        className="locationMapIconButton"
                        type="button"
                        aria-label={`Lihat maps ${location.name}`}
                        disabled={!location.latitude || !location.longitude}
                        onClick={(event) => {
                          event.stopPropagation()
                          openLocationMap(location)
                        }}
                      >
                        <LocateFixed size={16} />
                      </button>
                    </span>
                  </td>
                  <td><TableText primary={`${location.radiusM || 0} meter`} /></td>
                  <td><TableText primary={`${location.employeeCount} karyawan`} /></td>
                  <td><TableText primary={`${location.validToday} valid`} secondary={`${location.reviewToday} review`} /></td>
                  <td><UiStatusBadge tone={location.isReady ? "valid" : "pending"}>{location.isReady ? "GPS Siap" : "Lengkapi Koordinat"}</UiStatusBadge></td>
                  <td className="tableActionCell">
                    <button
                      className="rowActionButton"
                      type="button"
                      aria-label={`Buka maps ${location.name}`}
                      disabled={!location.latitude || !location.longitude}
                      onClick={(event) => {
                        event.stopPropagation()
                        openLocationMap(location)
                      }}
                    >
                      <ExternalLink size={16} />
                    </button>
                  </td>
                </ClickableTableRow>
              ))}
              {!loading && !errorMessage && locations.length === 0 && <tr><td className="tableStateCell" colSpan={8}><TableState title="Belum ada lokasi" description="Isi Master Data Lokasi Kerja dahulu." icon={Search} /></td></tr>}
            </tbody>
          </table>
        </div>
      </OperationalTableCard>

      <LocationMapDialog row={mapTarget} onClose={() => setMapTarget(null)} />
    </>
  )
}

function FaceEnrollmentDialog({
  open,
  saving,
  targetEmployee,
  onClose,
  onSubmit,
}: {
  open: boolean
  saving: boolean
  targetEmployee?: FaceEnrollmentTarget
  onClose: () => void
  onSubmit: (payload: FaceEnrollmentSubmitPayload) => Promise<void>
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimersRef = useRef<number[]>([])
  const scanAnimationRef = useRef<number | null>(null)
  const capturedSampleMarksRef = useRef<boolean[]>([false, false, false])
  const scanProgressRef = useRef(0)
  const [snapshots, setSnapshots] = useState<string[]>([])
  const [cameraError, setCameraError] = useState("")
  const [capturing, setCapturing] = useState(false)
  const [scanStarted, setScanStarted] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanMessage, setScanMessage] = useState("Posisikan wajah di tengah oval.")
  const [faceDetectorReady, setFaceDetectorReady] = useState(true)
  const [embeddingMessage, setEmbeddingMessage] = useState("")

  const readySnapshot = snapshots[snapshots.length - 1] || ""
  const scanComplete = snapshots.length >= 3

  const clearScanTimers = () => {
    scanTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    scanTimersRef.current = []
    if (scanAnimationRef.current) {
      window.clearTimeout(scanAnimationRef.current)
      scanAnimationRef.current = null
    }
  }

  const resetScan = useCallback(() => {
    clearScanTimers()
    capturedSampleMarksRef.current = [false, false, false]
    setSnapshots([])
    setCameraError("")
    setCapturing(false)
    setScanStarted(false)
    setScanMessage("Posisikan wajah di tengah oval.")
    setFaceDetectorReady(true)
    setEmbeddingMessage("")
    scanProgressRef.current = 0
    setScanProgress(0)
  }, [])

  const restartScan = () => {
    clearScanTimers()
    capturedSampleMarksRef.current = [false, false, false]
    setSnapshots([])
    setCameraError("")
    setCapturing(false)
    setScanMessage("Posisikan wajah di tengah oval.")
    setFaceDetectorReady(true)
    setEmbeddingMessage("")
    scanProgressRef.current = 0
    setScanProgress(0)
    setScanStarted(Boolean(streamRef.current))
  }

  const handleSubmitEnrollment = async () => {
    if (!scanComplete) return
    setEmbeddingMessage("Membaca embedding wajah...")
    try {
      const faceEmbeddings = await extractEnrollmentFaceEmbeddings(snapshots)
      await onSubmit({
        snapshotsBase64: snapshots,
        faceEmbeddings,
        faceEmbeddingModel,
      })
      setEmbeddingMessage("")
    } catch (error) {
      setEmbeddingMessage("")
      setCameraError(getFriendlySupabaseError(error, "Embedding wajah belum bisa dibuat. Scan ulang dengan wajah lebih jelas."))
    }
  }

  useEffect(() => {
    if (!open) return undefined

    let cancelled = false
    resetScan()
    setCameraError("")
    setCapturing(false)
    void startUserCamera(videoRef.current)
      .then((stream) => {
        if (cancelled) {
          stopMediaStream(stream)
          return
        }
        streamRef.current = stream
        setScanStarted(true)
      })
      .catch((error) => {
        setCameraError(getFriendlySupabaseError(error, "Kamera belum bisa dibuka."))
      })

    return () => {
      cancelled = true
      clearScanTimers()
      stopMediaStream(streamRef.current)
      streamRef.current = null
    }
  }, [open, resetScan])

  useEffect(() => {
    if (!open || scanComplete || !streamRef.current || !videoRef.current) return

    if (videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play().catch((error) => {
        setCameraError(getFriendlySupabaseError(error, "Kamera belum bisa lanjut scan ulang."))
      })
    }
  }, [open, scanComplete, snapshots.length])

  useEffect(() => {
    if (!open || !scanStarted || cameraError || scanComplete) return undefined

    clearScanTimers()
    const sampleThresholds = [24, 54, 84]
    let cancelled = false

    const captureSample = (sampleIndex: number) => {
      if (capturedSampleMarksRef.current[sampleIndex]) return
      capturedSampleMarksRef.current[sampleIndex] = true

      try {
        setCapturing(true)
        const nextSnapshot = captureVideoFrame(videoRef.current as HTMLVideoElement)
        setSnapshots((current) => (current.length >= 3 ? current : [...current, nextSnapshot].slice(0, 3)))
        if (sampleIndex === 2) setScanProgress(100)
        window.setTimeout(() => setCapturing(false), 240)
      } catch (error) {
        setCapturing(false)
        setCameraError(getFriendlySupabaseError(error, "Kamera belum siap membaca wajah."))
      }
    }

    const scanTick = () => {
      if (cancelled) return

      const video = videoRef.current
      const previewReady = Boolean(video?.videoWidth && video.videoHeight && video.readyState >= 2)
      const qualityScore = previewReady && video ? calculateFrameQualityScore(video) : 0
      const stableEnough = previewReady && qualityScore >= 38
      const currentProgress = scanProgressRef.current
      const nextProgress = Math.max(0, Math.min(100, currentProgress + (stableEnough ? 8.5 : -4)))

      setFaceDetectorReady(true)
      setScanMessage(
        !previewReady
          ? "Menyiapkan preview kamera..."
          : qualityScore < 32
            ? "Tambah cahaya dan tahan wajah di oval."
            : nextProgress < 35
              ? "Wajah terbaca. Tahan sebentar."
              : "Mengambil sampel otomatis...",
      )

      scanProgressRef.current = nextProgress
      setScanProgress(nextProgress)

      sampleThresholds.forEach((threshold, sampleIndex) => {
        if (stableEnough && nextProgress >= threshold) captureSample(sampleIndex)
      })

      scanAnimationRef.current = window.setTimeout(scanTick, 180)
    }

    scanAnimationRef.current = window.setTimeout(scanTick, 220)

    return () => {
      cancelled = true
      clearScanTimers()
    }
  }, [cameraError, open, scanComplete, scanStarted])

  if (!open) return null

  const scanLabel = scanComplete
    ? "Wajah berhasil dibaca. Kirim ke HR untuk review."
    : cameraError
      ? "Kamera perlu diperiksa"
      : scanMessage
  const scanTone = cameraError || !faceDetectorReady || scanProgress < 36
    ? "danger"
    : scanProgress < 72
      ? "warning"
      : "success"
  const ovalProgressStyle = { "--face-progress": `${Math.max(0, 100 - scanProgress)}` } as CSSProperties
  const targetMeta = [targetEmployee?.employeeCode, targetEmployee?.divisionName, targetEmployee?.positionName].filter(Boolean).join(" • ")

  return createPortal(
    <div className="dialogBackdrop" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <section
        className="dialogPanel faceEnrollmentDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="face-enrollment-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader fieldAttendanceHeader">
          <div className="fieldAttendanceIcon">
            {targetEmployee?.photoUrl ? <img src={targetEmployee.photoUrl} alt="" /> : <ScanFace size={23} />}
          </div>
          <div>
            <span className="dialogEyebrow">Face Enrollment</span>
            <h2 id="face-enrollment-title">{targetEmployee ? `Daftar Wajah ${targetEmployee.fullName}` : "Daftar Wajah Karyawan"}</h2>
            <p>{targetEmployee ? targetMeta : "Scanner akan mengambil 3 sampel otomatis untuk direview HR sebelum dipakai absensi."}</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup registrasi wajah" onClick={onClose} disabled={saving}>
            <X size={20} />
          </button>
        </div>

        <div className="faceEnrollmentBody">
          {targetEmployee && (
            <div className="faceEnrollmentTargetCard">
              <span>{targetEmployee.employeeCode}</span>
              <strong>{targetEmployee.fullName}</strong>
              <small>{targetEmployee.divisionName || "Belum pilih divisi"}{targetEmployee.positionName ? ` / ${targetEmployee.positionName}` : ""}</small>
            </div>
          )}
          <div className={clsx("faceEnrollmentCamera", `tone-${scanTone}`, scanComplete && "captured", capturing && "capturing", !scanComplete && !cameraError && "scanning")}>
            {readySnapshot && scanComplete ? <img src={readySnapshot} alt="" /> : <video ref={videoRef} playsInline muted />}
            <span className="faceEnrollmentFrame" />
            <svg className="faceEnrollmentOvalProgress" viewBox="0 0 100 132" aria-hidden="true">
              <ellipse className="faceEnrollmentOvalTrack" cx="50" cy="66" rx="48" ry="64" pathLength="100" />
              <ellipse className="faceEnrollmentOvalBar" cx="50" cy="66" rx="48" ry="64" pathLength="100" style={ovalProgressStyle} />
            </svg>
            <span className="faceEnrollmentGuide">{scanLabel}</span>
          </div>

          <div className={clsx("faceEnrollmentStatusPanel", `tone-${scanTone}`)}>
            <div>
              <span className="dialogEyebrow">{scanComplete ? "Siap Review" : faceDetectorReady ? "Scanning" : "Detector Required"}</span>
              <strong>{scanLabel}</strong>
              <small>
              {embeddingMessage
                ? embeddingMessage
                : scanComplete
                  ? "3 sampel wajah sudah aman untuk dikirim."
                  : faceDetectorReady
                    ? "Progress berjalan otomatis saat preview kamera stabil."
                    : "Aktifkan face engine/browser support sebelum enrollment real."}
              </small>
            </div>
            <span className="faceEnrollmentCounter">{Math.min(snapshots.length, 3)}/3</span>
          </div>

          <div className="faceEnrollmentSamples" aria-label="Jumlah sampel wajah">
            {[0, 1, 2].map((sampleIndex) => (
              <span key={sampleIndex} aria-label={`Sampel ${sampleIndex + 1}`} className={clsx(snapshots.length > sampleIndex && "done", snapshots.length === sampleIndex && !scanComplete && !cameraError && "active")}>
                {snapshots.length > sampleIndex ? <ShieldCheck size={13} /> : sampleIndex + 1}
              </span>
            ))}
          </div>

          {cameraError && (
            <div className="dialogInlineAlert fieldAttendanceAlert">
              <AlertTriangle size={17} />
              <span>{cameraError}</span>
            </div>
          )}

          <div className="dialogActions faceEnrollmentActions">
            <button className="secondaryButton" type="button" onClick={scanComplete ? restartScan : onClose} disabled={saving}>
              {scanComplete ? "Scan Ulang" : "Batal"}
            </button>
            <button className="primaryButton" type="button" onClick={() => void handleSubmitEnrollment()} disabled={saving || !scanComplete || Boolean(cameraError)}>
              <FileCheck2 size={18} />
              {saving || embeddingMessage ? "Memproses..." : scanComplete ? "Kirim Review HR" : "Scanning otomatis..."}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function FieldAttendanceDialog({
  open,
  saving,
  defaultEventType = "check_in",
  workLocation,
  onClose,
  onSubmit,
}: {
  open: boolean
  saving: boolean
  defaultEventType?: "check_in" | "check_out"
  workLocation?: AttendanceWorkLocationGate
  onClose: () => void
  onSubmit: (payload: FieldAttendanceSubmitPayload) => Promise<void>
}) {
  const [eventType, setEventType] = useState<"check_in" | "check_out">("check_in")
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [faceScore, setFaceScore] = useState("")
  const [faceEmbedding, setFaceEmbedding] = useState<number[] | null>(null)
  const [faceSnapshotBase64, setFaceSnapshotBase64] = useState("")
  const [faceScreenOpen, setFaceScreenOpen] = useState(false)
  const [faceCapturing, setFaceCapturing] = useState(false)
  const [faceCameraReady, setFaceCameraReady] = useState(false)
  const [faceCameraError, setFaceCameraError] = useState("")
  const [faceScanProgress, setFaceScanProgress] = useState(0)
  const [faceScanMessage, setFaceScanMessage] = useState("Posisikan wajah di tengah frame.")
  const [faceDetectorReady, setFaceDetectorReady] = useState(true)
  const [notes, setNotes] = useState("")
  const [locating, setLocating] = useState(false)
  const [inlineError, setInlineError] = useState("")
  const faceVideoRef = useRef<HTMLVideoElement>(null)
  const faceStreamRef = useRef<MediaStream | null>(null)
  const faceScanTimerRef = useRef<number | null>(null)
  const faceScanProgressRef = useRef(0)
  const faceCapturedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setEventType(defaultEventType)
    setLatitude("")
    setLongitude("")
    setGpsAccuracy(null)
    setFaceScore("")
    setFaceEmbedding(null)
    setFaceSnapshotBase64("")
    setFaceScreenOpen(false)
    setFaceCapturing(false)
    setFaceCameraReady(false)
    setFaceCameraError("")
    setFaceScanProgress(0)
    setFaceScanMessage("Posisikan wajah di tengah frame.")
    setFaceDetectorReady(true)
    faceScanProgressRef.current = 0
    faceCapturedRef.current = false
    setNotes("")
    setInlineError("")
  }, [defaultEventType, open])

  useEffect(() => {
    if (!faceScreenOpen) {
      if (faceScanTimerRef.current) {
        window.clearTimeout(faceScanTimerRef.current)
        faceScanTimerRef.current = null
      }
      stopMediaStream(faceStreamRef.current)
      faceStreamRef.current = null
      setFaceCameraReady(false)
      return undefined
    }

    let cancelled = false
    let warmupTimer: number | null = null
    setFaceCameraError("")
    setFaceCapturing(false)
    setFaceCameraReady(false)
    setFaceScanProgress(6)
    setFaceScanMessage("Menyiapkan kamera...")
    setFaceDetectorReady(true)
    faceScanProgressRef.current = 6
    faceCapturedRef.current = false
    void startUserCamera(faceVideoRef.current)
      .then((stream) => {
        if (cancelled) {
          stopMediaStream(stream)
          return
        }
        faceStreamRef.current = stream
        setFaceCameraReady(true)
        faceScanProgressRef.current = Math.max(faceScanProgressRef.current, 10)
        setFaceScanProgress(faceScanProgressRef.current)
        setFaceScanMessage("Kamera aktif. Menyiapkan face engine...")

        warmupTimer = window.setInterval(() => {
          if (cancelled || faceCapturedRef.current) return
          const nextProgress = Math.min(28, faceScanProgressRef.current + 2)
          if (nextProgress !== faceScanProgressRef.current) {
            faceScanProgressRef.current = nextProgress
            setFaceScanProgress(nextProgress)
          }
        }, 420)

        void loadFaceEmbeddingEngine()
          .then(() => {
            if (cancelled || faceCapturedRef.current) return
            if (warmupTimer) {
              window.clearInterval(warmupTimer)
              warmupTimer = null
            }
            faceScanProgressRef.current = Math.max(faceScanProgressRef.current, 30)
            setFaceScanProgress(faceScanProgressRef.current)
            setFaceScanMessage("Face engine siap. Posisikan wajah di oval.")
          })
          .catch((error) => {
            if (cancelled) return
            if (warmupTimer) {
              window.clearInterval(warmupTimer)
              warmupTimer = null
            }
            setFaceDetectorReady(false)
            setFaceScanMessage(getFriendlySupabaseError(error, "Face detector belum bisa dimuat di browser ini."))
          })
      })
      .catch((error) => {
        setFaceCameraError(getFriendlySupabaseError(error, "Kamera belum bisa dibuka."))
        setFaceCameraReady(false)
      })

    return () => {
      cancelled = true
      if (warmupTimer) {
        window.clearInterval(warmupTimer)
        warmupTimer = null
      }
      if (faceScanTimerRef.current) {
        window.clearTimeout(faceScanTimerRef.current)
        faceScanTimerRef.current = null
      }
      stopMediaStream(faceStreamRef.current)
      faceStreamRef.current = null
      setFaceCameraReady(false)
    }
  }, [faceScreenOpen])

  useEffect(() => {
    if (!faceScreenOpen || !faceCameraReady || faceCameraError || !faceStreamRef.current || faceCapturedRef.current) return undefined

    let cancelled = false
    let analyzing = false

    const finishCapture = (score: number) => {
      if (faceCapturedRef.current || !faceVideoRef.current) return
      faceCapturedRef.current = true
      setFaceCapturing(true)

      try {
        const snapshot = captureVideoFrame(faceVideoRef.current)
        setFaceSnapshotBase64(snapshot)
        setFaceScore(String(Math.max(0, Math.min(100, Math.round(score)))))
        setFaceScanProgress(100)
        setFaceScanMessage("Bukti wajah tersimpan.")

        void extractFaceEmbeddingFromDataUrl(snapshot)
          .then((embedding) => {
            setFaceEmbedding(embedding)
            setFaceScanMessage("Bukti wajah dan embedding siap.")
          })
          .catch(() => {
            setFaceEmbedding(null)
            setFaceScanMessage("Bukti wajah tersimpan. HR bisa review jika embedding belum siap.")
          })

        window.setTimeout(() => {
          setFaceCapturing(false)
          setFaceScreenOpen(false)
        }, 520)
      } catch (error) {
        faceCapturedRef.current = false
        setFaceCapturing(false)
        setFaceCameraError(getFriendlySupabaseError(error, "Wajah belum bisa dibuat embedding. Scan ulang dengan wajah lebih jelas."))
      }
    }

    const scanTick = () => {
      if (cancelled || analyzing || faceCapturedRef.current) return
      analyzing = true
      const video = faceVideoRef.current
      const previewReady = Boolean(video?.videoWidth && video.videoHeight && video.readyState >= 2)

      if (!video || !previewReady) {
        analyzing = false
        const nextProgress = Math.max(faceScanProgressRef.current, 16)
        faceScanProgressRef.current = nextProgress
        setFaceScanProgress(nextProgress)
        setFaceScanMessage("Menunggu preview kamera stabil...")
        faceScanTimerRef.current = window.setTimeout(scanTick, 220)
        return
      }

      const qualityScore = calculateFrameQualityScore(video)
      analyzing = false
      if (cancelled || faceCapturedRef.current) return

      setFaceDetectorReady(true)
      setFaceScanMessage(qualityScore >= 45 ? "Wajah dan background sudah masuk frame." : "Cahaya kurang. Tahan wajah di frame.")
      const nextProgress = Math.min(100, Math.max(faceScanProgressRef.current, 34) + (qualityScore >= 45 ? 22 : 10))
      faceScanProgressRef.current = nextProgress
      setFaceScanProgress(nextProgress)

      if (nextProgress >= 100) {
        finishCapture(Math.max(45, qualityScore))
        return
      }

      faceScanTimerRef.current = window.setTimeout(scanTick, 180)
    }

    faceScanTimerRef.current = window.setTimeout(scanTick, 520)

    return () => {
      cancelled = true
      if (faceScanTimerRef.current) {
        window.clearTimeout(faceScanTimerRef.current)
        faceScanTimerRef.current = null
      }
    }
  }, [faceCameraError, faceCameraReady, faceScreenOpen])

  if (!open) return null

  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  const parsedFaceScore = faceScore.trim() ? Number(faceScore) : null
  const gpsReady = Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)
  const workLocationLatitude = Number(workLocation?.latitude)
  const workLocationLongitude = Number(workLocation?.longitude)
  const workLocationRadius = Number(workLocation?.radiusM || 0)
  const hasWorkLocationRadar = Boolean(
    workLocation
      && Number.isFinite(workLocationLatitude)
      && Number.isFinite(workLocationLongitude)
      && workLocationRadius > 0,
  )
  const gpsDistanceM = gpsReady && hasWorkLocationRadar
    ? calculateDistanceMeters(parsedLatitude, parsedLongitude, workLocationLatitude, workLocationLongitude)
    : null
  const gpsInsideRadius = !hasWorkLocationRadar || (gpsDistanceM !== null && gpsDistanceM <= workLocationRadius)
  const gpsCanSubmit = gpsReady && gpsInsideRadius
  const faceReady = parsedFaceScore !== null && Number.isFinite(parsedFaceScore) && parsedFaceScore >= 0 && parsedFaceScore <= 100
  const gpsCopy = gpsReady
    ? hasWorkLocationRadar
      ? gpsInsideRadius
        ? `${gpsDistanceM}m dari ${workLocation?.name || "lokasi kerja"} · dalam radius ${workLocationRadius}m`
        : `${gpsDistanceM}m dari ${workLocation?.name || "lokasi kerja"} · di luar radius ${workLocationRadius}m`
      : `Titik HP terkunci${gpsAccuracy ? ` · akurasi ${Math.round(gpsAccuracy)}m` : ""}`
    : hasWorkLocationRadar
      ? `Ambil GPS untuk cek radius ${workLocationRadius}m di ${workLocation?.name}`
      : "Ambil titik GPS dari browser/device"
  const faceCopy = faceReady
    ? `${parsedFaceScore}% quality · ${faceEmbedding ? "embedding siap" : "snapshot siap review"}`
    : "Tap untuk buka screen verifikasi wajah"
  const fieldFaceScanLabel = faceReady
    ? "Wajah berhasil dibaca. Bukti absensi siap disimpan."
    : faceCameraError
      ? "Kamera perlu diperiksa"
      : faceScanMessage
  const fieldFaceScanTone = faceCameraError || !faceDetectorReady || faceScanProgress < 36
    ? "danger"
    : faceScanProgress < 72
      ? "warning"
      : "success"
  const fieldFaceProgressStyle = { "--face-progress": `${Math.max(0, 100 - faceScanProgress)}` } as CSSProperties

  const handleLocate = async () => {
    setLocating(true)
    setInlineError("")
    try {
      const position = await getBrowserPosition()
      setLatitude(position.coords.latitude.toFixed(7))
      setLongitude(position.coords.longitude.toFixed(7))
      setGpsAccuracy(position.coords.accuracy || null)
    } catch (error) {
      setInlineError(getFriendlySupabaseError(error, "GPS browser belum bisa diambil."))
    } finally {
      setLocating(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setInlineError("")

    if (!gpsReady) {
      setInlineError("Koordinat GPS wajib diisi atau diambil dari browser.")
      return
    }
    if (!gpsInsideRadius) {
      setInlineError("Posisi di luar radius lokasi kerja. Dekati area kerja atau hubungi HR untuk pengecualian.")
      return
    }
    if (!faceReady || !faceSnapshotBase64) {
      setInlineError("Bukti wajah wajib diambil sebelum menyimpan absensi.")
      return
    }

    await onSubmit({
      eventType,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      faceScore: parsedFaceScore,
      faceEmbedding,
      faceEmbeddingModel,
      faceSnapshotBase64,
      faceSnapshotContentType: faceSnapshotBase64 ? "image/jpeg" : null,
      notes,
    })
  }

  return createPortal(
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel fieldAttendanceDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-attendance-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader fieldAttendanceHeader">
          <div className="fieldAttendanceIcon">
            <LocateFixed size={23} />
          </div>
          <div>
            <span className="dialogEyebrow">App Lapangan</span>
            <h2 id="field-attendance-title">Tes Absensi GPS + Face</h2>
            <p>Validasi user terkait karyawan, radius lokasi kerja, face score, dan payroll cycle.</p>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup dialog absensi" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {faceScreenOpen ? (
          <div className="fieldFaceScreen">
            <div className={clsx("faceEnrollmentCamera fieldFaceCamera", `tone-${fieldFaceScanTone}`, faceReady && "captured", faceCapturing && "capturing", !faceReady && !faceCameraError && "scanning")}>
              {faceSnapshotBase64 && faceReady ? <img src={faceSnapshotBase64} alt="" /> : <video ref={faceVideoRef} playsInline muted />}
              <span className="faceEnrollmentFrame" />
              <svg className="faceEnrollmentOvalProgress" viewBox="0 0 100 132" aria-hidden="true">
                <ellipse className="faceEnrollmentOvalTrack" cx="50" cy="66" rx="48" ry="64" pathLength="100" />
                <ellipse className="faceEnrollmentOvalBar" cx="50" cy="66" rx="48" ry="64" pathLength="100" style={fieldFaceProgressStyle} />
              </svg>
              <span className="faceEnrollmentGuide">{fieldFaceScanLabel}</span>
            </div>

            <div className={clsx("faceEnrollmentStatusPanel fieldFaceStatusPanel", `tone-${fieldFaceScanTone}`)}>
              <div>
                <span className="dialogEyebrow">{faceReady ? "Siap Absensi" : faceDetectorReady ? "Scanning" : "Detector Required"}</span>
                <strong>{faceCapturing ? "Snapshot tersimpan" : fieldFaceScanLabel}</strong>
                <small>
                  {faceReady
                    ? `${parsedFaceScore}% quality · ${faceEmbedding ? "embedding dan snapshot siap." : "snapshot siap untuk review HR."}`
                    : faceDetectorReady
                      ? "Snapshot otomatis disimpan saat kamera stabil. GPS dan background ikut menjadi bukti."
                      : "Browser memakai fallback kualitas frame. Gunakan Chrome Android/Safari terbaru untuk hasil lebih presisi."}
                </small>
              </div>
              <span className="faceEnrollmentCounter">{faceReady ? "1/1" : `${Math.round(faceScanProgress)}%`}</span>
            </div>

            <div className="faceEnrollmentChecklist fieldFaceChecklist">
              <span className={clsx(faceDetectorReady && "active", faceReady && "done")}><ScanFace size={16} /> Wajah terbaca</span>
              <span className={clsx(faceScanProgress >= 55 && "active", faceReady && "done")}><ShieldCheck size={16} /> Anti titip absen</span>
              <span className={clsx(gpsReady && "done")}><LocateFixed size={16} /> GPS siap</span>
            </div>

            {faceCameraError && (
              <div className="dialogInlineAlert fieldAttendanceAlert">
                <AlertTriangle size={17} />
                <span>{faceCameraError}</span>
              </div>
            )}
            <div className="dialogActions fieldFaceActions">
              <button className="secondaryButton" type="button" onClick={() => setFaceScreenOpen(false)} disabled={faceCapturing}>
                Kembali
              </button>
              <button className="primaryButton" type="button" disabled>
                <ScanFace size={18} />
                {faceCapturing ? "Menyimpan..." : "Scanning otomatis..."}
              </button>
            </div>
          </div>
        ) : (
        <form className="dialogForm fieldAttendanceForm" onSubmit={handleSubmit}>
          <SegmentedFormField
            label="Tipe Absensi"
            value={eventType}
            onChange={(value) => setEventType(value as "check_in" | "check_out")}
            options={[
              { value: "check_in", label: "Check-in", description: "Dihitung hari kerja jika valid." },
              { value: "check_out", label: "Check-out", description: "Log keluar shift." },
            ]}
            required
          />

          <section className={clsx("fieldAttendanceCard fieldAttendanceSignalCard", gpsReady && gpsInsideRadius && "ready", gpsReady && !gpsInsideRadius && "blocked")}>
            <div className="fieldAttendanceCardIcon">
              <LocateFixed size={20} />
            </div>
            <div className="fieldAttendanceCardCopy">
              <strong>Radar Lokasi Kerja</strong>
              <span>{gpsCopy}</span>
            </div>
            <button className="secondaryButton compactButton" type="button" onClick={handleLocate} disabled={locating || saving}>
              <LocateFixed size={16} />
              {locating ? "Mengambil..." : "Ambil GPS"}
            </button>
            {gpsReady && (
              <div className="fieldAttendanceMeta">
                {hasWorkLocationRadar && (
                  <span className={clsx(gpsInsideRadius ? "valid" : "failed")}>
                    {gpsInsideRadius ? "Dalam radius" : "Di luar radius"} · {gpsDistanceM}m / {workLocationRadius}m
                  </span>
                )}
                <span>Akurasi {gpsAccuracy ? `${Math.round(gpsAccuracy)}m` : "-"}</span>
                <span>Koordinat {latitude}, {longitude}</span>
              </div>
            )}
          </section>

          <section className={clsx("fieldAttendanceCard fieldAttendanceSignalCard", faceReady && "ready")}>
            <div className="fieldAttendanceCardIcon">
              <ScanFace size={20} />
            </div>
            <div className="fieldAttendanceCardCopy">
              <strong>Face Verification</strong>
              <span>{faceCopy}</span>
            </div>
            <button className="secondaryButton compactButton" type="button" onClick={() => setFaceScreenOpen(true)} disabled={saving}>
              <ScanFace size={16} />
              {faceReady ? "Scan Ulang" : "Verifikasi"}
            </button>
          </section>

          <TextFormField label="Catatan" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan absensi lapangan" />

          {inlineError && (
            <div className="dialogInlineAlert fieldAttendanceAlert">
              <AlertTriangle size={17} />
              <span>{inlineError}</span>
            </div>
          )}

          {gpsReady && !gpsInsideRadius && (
            <div className="dialogInlineAlert fieldAttendanceAlert">
              <AlertTriangle size={17} />
              <span>Posisi di luar radius lokasi kerja. Absensi real tidak bisa dikirim dari titik ini.</span>
            </div>
          )}

          <div className="dialogActions">
            <button className="secondaryButton" type="button" onClick={onClose} disabled={saving}>
              Batal
            </button>
            <button className="primaryButton" type="submit" disabled={saving || locating || !gpsCanSubmit || !faceReady || !faceSnapshotBase64}>
              <FileCheck2 size={18} />
              {!gpsReady ? "Ambil GPS dulu" : !gpsInsideRadius ? "Di luar radius" : !faceReady || !faceSnapshotBase64 ? "Verifikasi wajah dulu" : saving ? "Menyimpan..." : "Simpan Absensi"}
            </button>
          </div>
        </form>
        )}
      </section>
    </div>,
    document.body,
  )
}

function ModulePage({ activeView }: { activeView: ModuleViewId }) {
  const config = moduleConfigs[activeView]
  const [detailRow, setDetailRow] = useState<{ row: Record<string, string | number>; index: number } | null>(null)

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
                Simpan Draft
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
                  <ClickableTableRow
                    key={`${activeView}-${rowIndex}`}
                    label={`Lihat detail ${config.tableTitle} ${rowIndex + 1}`}
                    onOpen={() => setDetailRow({ row: row as Record<string, string | number>, index: rowIndex })}
                  >
                    <td className="tableNumberCell"><TableNumberCell value={rowIndex + 1} /></td>
                    {config.columns.map((column) => (
                      <td key={column}>
                        {column === "Status" ? (
                          <ModuleStatusBadge value={row[column]} />
                        ) : (
                          <TableText
                            primary={row[column]}
                            secondary={column === config.columns[0] ? `Draft #${String(rowIndex + 1).padStart(3, "0")}` : undefined}
                          />
                        )}
                      </td>
                    ))}
                    <td className="tableActionCell">
                      <div className="rowActions">
                        <RowActionButton label={`Lihat detail ${config.tableTitle} ${rowIndex + 1}`} onClick={() => setDetailRow({ row: row as Record<string, string | number>, index: rowIndex })} />
                      </div>
                    </td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          </div>
        </OperationalTableCard>
      </section>
      <ModuleRowDetailDialog
        activeView={activeView}
        title={config.tableTitle}
        columns={config.columns}
        detailRow={detailRow}
        onClose={() => setDetailRow(null)}
      />
    </OperationalPageShell>
  )
}

function ModuleRowDetailDialog({
  activeView,
  title,
  columns,
  detailRow,
  onClose,
}: {
  activeView: ModuleViewId
  title: string
  columns: string[]
  detailRow: { row: Record<string, string | number>; index: number } | null
  onClose: () => void
}) {
  if (!detailRow) return null

  const primaryColumn = columns[0]
  const primaryValue = detailRow.row[primaryColumn] ?? `${title} ${detailRow.index + 1}`

  return createPortal(
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialogPanel masterDetailDialog moduleRowDetailDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="module-row-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogCompactHeader masterDetailHeader">
          <div className="masterDetailTitle">
            <span className="masterDetailIcon">
              <FileBarChart size={22} />
            </span>
            <div>
              <span>{navItems.find((item) => item.id === activeView)?.label || "Detail"}</span>
              <h2 id="module-row-detail-title">{primaryValue}</h2>
              <p>Detail baris dari modul ini. Struktur data real akan mengikuti integrasi database berikutnya.</p>
            </div>
          </div>
          <button className="iconButton dialogClose" type="button" aria-label="Tutup detail" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="masterDetailBody">
          <div className="masterDetailGrid">
            {columns.map((column) => (
              <div className="masterDetailField" key={column}>
                <span>{column}</span>
                <strong>{detailRow.row[column] ?? "-"}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="masterDetailActions">
          <button className="secondaryButton" type="button" onClick={onClose}>Tutup</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function EmployeePwaApp({ profile, onLogout }: { profile: AppAccessProfile; onLogout: () => void }) {
  const [data, setData] = useState<EmployeePortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [attendanceEventType, setAttendanceEventType] = useState<"check_in" | "check_out">("check_in")
  const [attendanceSaving, setAttendanceSaving] = useState(false)
  const [faceEnrollmentOpen, setFaceEnrollmentOpen] = useState(false)
  const [faceSaving, setFaceSaving] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const showToast = (message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() })
  }

  const refreshData = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")

    try {
      const nextData = await loadEmployeePortalData()
      setData(nextData)
    } catch (error) {
      setErrorMessage(getFriendlySupabaseError(error, "App karyawan belum bisa memuat data."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  const handleAttendanceSubmit = async (payload: FieldAttendanceSubmitPayload) => {
    setAttendanceSaving(true)
    try {
      const result = await submitFieldAttendance(payload)
      setAttendanceOpen(false)
      showToast({
        tone: result.log.status === "valid" ? "success" : "error",
        title: result.log.status === "valid" ? "Absensi valid" : "Masuk review HR",
        description: `${result.log.distance_m}m dari radius ${result.log.radius_m}m · face ${result.log.face_score ?? "-"}%.`,
      })
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Absensi gagal",
        description: getFriendlySupabaseError(error, "Absensi belum bisa disimpan."),
      })
    } finally {
      setAttendanceSaving(false)
    }
  }

  const handleFaceEnrollmentSubmit = async (payload: FaceEnrollmentSubmitPayload) => {
    setFaceSaving(true)
    try {
      await submitEmployeeFaceEnrollment(
        payload.snapshotsBase64,
        "image/jpeg",
        "Registrasi wajah awal dari app karyawan.",
        "",
        payload.faceEmbeddings,
        payload.faceEmbeddingModel,
      )
      setFaceEnrollmentOpen(false)
      showToast({
        tone: "success",
        title: "Wajah terkirim",
        description: "Data wajah masuk antrian review HR.",
      })
      await refreshData()
    } catch (error) {
      showToast({
        tone: "error",
        title: "Gagal daftar wajah",
        description: getFriendlySupabaseError(error, "Registrasi wajah belum bisa disimpan."),
      })
    } finally {
      setFaceSaving(false)
    }
  }

  const employee = data?.employee
  const todayCheckIn = data?.todayLogs.find((log) => log.eventType === "check_in")
  const todayCheckOut = data?.todayLogs.find((log) => log.eventType === "check_out")
  const faceReady = data?.faceProfile.status === "approved" || data?.faceProfile.status === "disabled" || data?.faceProfile.verificationRequired === false
  const locationReady = Boolean(employee?.workLocationLatitude && employee?.workLocationLongitude && employee?.radiusM)
  const canCheckIn = Boolean(faceReady && locationReady && !todayCheckIn)
  const canCheckOut = Boolean(faceReady && locationReady && todayCheckIn && todayCheckIn.status !== "rejected" && !todayCheckOut)
  const cycle = data?.payrollCycle
  const cyclePercent = cycle ? Math.min(100, Math.round((cycle.workDaysCount / Math.max(1, cycle.targetWorkDays)) * 100)) : 0
  const mapUrl = employee?.workLocationLatitude && employee?.workLocationLongitude
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${employee.workLocationLatitude},${employee.workLocationLongitude}`)}`
    : ""
  const faceCanEnroll = data?.faceProfile.status !== "approved" && data?.faceProfile.status !== "pending_review"
  const faceGateTitle = data?.faceProfile.status === "pending_review"
    ? "Wajah sedang direview HR"
    : data?.faceProfile.status === "rejected"
      ? "Scan ulang wajah"
      : "Lengkapi verifikasi wajah"
  const faceGateCopy = data?.faceProfile.status === "pending_review"
    ? "Data wajah sudah terkirim. Tunggu approval HR sebelum absen real aktif."
    : data?.faceProfile.status === "rejected"
      ? "Data wajah sebelumnya ditolak. Scan ulang dengan cahaya cukup dan wajah jelas."
      : "Daftarkan wajah sekali agar check-in/check-out bisa divalidasi dengan GPS dan face match."
  const cycleRemainingDays = cycle ? Math.max(0, cycle.targetWorkDays - cycle.workDaysCount) : 0
  const attendanceRecapRows = useMemo(() => {
    const grouped = new Map<string, { date: string; checkIn?: EmployeePortalAttendanceLog; checkOut?: EmployeePortalAttendanceLog }>()

    ;(data?.recentLogs || []).forEach((log) => {
      const entry = grouped.get(log.attendanceDate) || { date: log.attendanceDate }
      if (log.eventType === "check_in" && !entry.checkIn) entry.checkIn = log
      if (log.eventType === "check_out" && !entry.checkOut) entry.checkOut = log
      grouped.set(log.attendanceDate, entry)
    })

    return Array.from(grouped.values())
      .sort((first, second) => second.date.localeCompare(first.date))
      .slice(0, 8)
  }, [data?.recentLogs])

  const getAttendanceBlockedReason = (eventType: "check_in" | "check_out") => {
    if (!faceReady) {
      if (data?.faceProfile.status === "pending_review") return "Data wajah sedang menunggu approval HR."
      if (data?.faceProfile.status === "rejected") return "Data wajah ditolak. Scan ulang wajah dulu."
      return "Daftarkan wajah dulu sebelum absensi real."
    }

    if (!locationReady) return "Lokasi kerja atau radius GPS karyawan belum lengkap."

    if (eventType === "check_in") {
      if (todayCheckIn) return "Check-in hari ini sudah tercatat. Satu hari hanya boleh satu kali check-in."
      return ""
    }

    if (!todayCheckIn) return "Check-in dulu sebelum absen pulang."
    if (todayCheckIn.status === "rejected") return "Check-in hari ini ditolak HR. Hubungi HR sebelum absen pulang."
    if (todayCheckOut) return "Check-out hari ini sudah tercatat."
    return ""
  }

  const openAttendance = (eventType: "check_in" | "check_out") => {
    const blockedReason = getAttendanceBlockedReason(eventType)
    if (blockedReason) {
      showToast({
        tone: "error",
        title: eventType === "check_in" ? "Belum bisa check-in" : "Belum bisa check-out",
        description: blockedReason,
      })
      return
    }

    setAttendanceEventType(eventType)
    setAttendanceOpen(true)
  }

  const checkInBlockedReason = getAttendanceBlockedReason("check_in")
  const checkOutBlockedReason = getAttendanceBlockedReason("check_out")
  const attendanceActionHint = !todayCheckIn ? checkInBlockedReason : checkOutBlockedReason

  return (
    <main className="employeeAppShell">
      <section className="employeeAppTop">
        <div className="employeeAppBrand">
          <span className="brandLogo">
            <img src={dmsLogo} alt="DMS" />
          </span>
          <div>
            <small>App Karyawan</small>
            <strong>DMS Lapangan</strong>
            <em>{profile.email}</em>
          </div>
        </div>
        <button className="employeeIconButton" type="button" aria-label="Logout" onClick={onLogout}>
          <LogOut size={18} />
        </button>
      </section>

      {loading && !data ? (
        <section className="employeeAppLoading">
          <span className="authTopProgress" />
          <strong>Memuat data karyawan...</strong>
          <small>Sinkronisasi user, karyawan, lokasi, dan payroll cycle.</small>
        </section>
      ) : errorMessage ? (
        <section className="employeeAppError">
          <AlertTriangle size={22} />
          <strong>App karyawan belum siap</strong>
          <small>{errorMessage}</small>
          <button className="primaryButton" type="button" onClick={refreshData}>Coba Lagi</button>
        </section>
      ) : data && employee ? (
        <>
          <section className="employeeHeroCard">
            <div className="employeeHeroIdentity">
              <span className="employeeHeroAvatar">
                {employee.photoUrl ? <img src={employee.photoUrl} alt="" /> : employee.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <span>{employee.code}</span>
                <h1>{employee.name}</h1>
                <p>{employee.positionName} · {employee.divisionName}</p>
              </div>
            </div>
            <div className="employeeHeroMeta">
              <span>{employee.shiftName || "Shift belum diatur"}</span>
              <span>{employee.workLocationName} · {employee.radiusM ? `${employee.radiusM} meter` : "Radius belum diatur"}</span>
            </div>
          </section>

          {!faceReady && (
            <section className="employeeFaceGateCard">
              <span className="employeeFaceGateIcon">
                <ScanFace size={24} />
              </span>
              <div className="employeeFaceGateCopy">
                <span className="dialogEyebrow">Verifikasi Wajah</span>
                <h2>{faceGateTitle}</h2>
                <p>{faceGateCopy}</p>
              </div>
              <div className="employeeFaceGateActions">
                <button className={faceCanEnroll ? "primaryButton" : "secondaryButton"} type="button" onClick={() => setFaceEnrollmentOpen(true)} disabled={!faceCanEnroll || faceSaving}>
                  <ScanFace size={17} />
                  {data.faceProfile.status === "pending_review" ? "Menunggu HR" : data.faceProfile.status === "rejected" ? "Scan Ulang" : "Daftar Wajah"}
                </button>
              </div>
            </section>
          )}

          <section className="employeeActionCard">
            <div className="employeeActionHeader">
              <div>
                <span className="dialogEyebrow">Absensi Hari Ini</span>
                <h2>{!faceReady ? "Verifikasi wajah dulu" : todayCheckOut ? "Absensi hari ini selesai" : todayCheckIn ? "Check-in tercatat" : "Siap check-in"}</h2>
                <p>
                  {!faceReady
                    ? "Absensi real akan terbuka setelah data wajah disetujui HR."
                    : todayCheckOut
                      ? `Pulang ${formatAttendanceTime(todayCheckOut.eventAt)} · masuk ${formatAttendanceTime(todayCheckIn?.eventAt)}`
                      : todayCheckIn
                        ? todayCheckIn.status === "valid"
                          ? `${formatAttendanceTime(todayCheckIn.eventAt)} · ${todayCheckIn.distanceM ?? "-"}m dari lokasi. Check-out sudah bisa dilakukan.`
                          : "Check-in tersimpan dan menunggu review HR. Kamu tetap bisa absen pulang."
                        : "GPS radius dan face verification akan dicek otomatis."}
                </p>
              </div>
              <UiStatusBadge tone={todayCheckOut ? "valid" : todayCheckIn?.status === "valid" ? "valid" : todayCheckIn ? "pending" : "missing"}>
                {todayCheckOut ? "Selesai" : todayCheckIn?.status === "valid" ? "Masuk valid" : todayCheckIn ? "Review HR" : "Belum absen"}
              </UiStatusBadge>
            </div>

            <div className="employeeReadinessList">
              <span className={clsx(faceReady && "ready", !faceReady && "blocked")}>
                <ScanFace size={15} />
                {faceReady ? "Face approved" : employeeFaceStatusLabel[data.faceProfile.status]}
              </span>
              <span className={clsx(locationReady && "ready", !locationReady && "blocked")}>
                <LocateFixed size={15} />
                {locationReady ? "Lokasi kerja siap" : "Lokasi/radius belum lengkap"}
              </span>
              <span className={clsx(todayCheckOut ? "ready" : todayCheckIn ? todayCheckIn.status === "rejected" ? "blocked" : "waiting" : "ready")}>
                <CalendarCheck2 size={15} />
                {todayCheckOut ? "Hari ini selesai" : todayCheckIn ? todayCheckIn.status === "rejected" ? "Check-in ditolak" : "Siap check-out" : "Belum check-in"}
              </span>
            </div>

            {attendanceActionHint && (
              <div className="employeeActionHint">
                <AlertCircle size={16} />
                <span>{attendanceActionHint}</span>
              </div>
            )}

            <div className="employeeActionButtons">
              {!faceReady ? (
                <button className="primaryButton" type="button" onClick={() => setFaceEnrollmentOpen(true)} disabled={!faceCanEnroll || faceSaving}>
                  <ScanFace size={18} />
                  {data.faceProfile.status === "pending_review" ? "Menunggu Approval HR" : "Lengkapi Wajah"}
                </button>
              ) : (
                <>
                  <button className={clsx("primaryButton", !canCheckIn && "isDisabled")} type="button" onClick={() => openAttendance("check_in")} disabled={attendanceSaving} aria-disabled={!canCheckIn}>
                    <LocateFixed size={18} />
                    {todayCheckIn ? "Masuk Tercatat" : !locationReady ? "Lokasi Belum Siap" : "Absen Masuk"}
                  </button>
                  <button className={clsx("secondaryButton", !canCheckOut && "isDisabled")} type="button" onClick={() => openAttendance("check_out")} disabled={attendanceSaving} aria-disabled={!canCheckOut}>
                    <CalendarCheck2 size={18} />
                    {todayCheckOut ? "Pulang Tercatat" : !todayCheckIn ? "Check-in Dulu" : todayCheckIn.status === "rejected" ? "Check-in Ditolak" : !locationReady ? "Lokasi Belum Siap" : "Absen Pulang"}
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="employeeStatusGrid">
            <div className="employeeMiniCard">
              <ScanFace size={18} />
              <span>Face</span>
              <strong>{employeeFaceStatusLabel[data.faceProfile.status]}</strong>
              {data.faceProfile.status !== "approved" && data.faceProfile.status !== "pending_review" && (
                <button type="button" onClick={() => setFaceEnrollmentOpen(true)}>Daftar</button>
              )}
            </div>
            <div className="employeeMiniCard">
              <LocateFixed size={18} />
              <span>Lokasi</span>
              <strong>{employee.workLocationName}</strong>
              <small>{employee.radiusM ? `${employee.radiusM} meter` : "Radius belum ada"}</small>
              {mapUrl && <button type="button" onClick={() => window.open(mapUrl, "_blank", "noopener,noreferrer")}>Maps</button>}
            </div>
            <div className="employeeMiniCard">
              <BadgeDollarSign size={18} />
              <span>Cycle</span>
              <strong>{cycle ? `${cycle.workDaysCount}/${cycle.targetWorkDays}` : "0/26"}</strong>
              <small>{cycle ? payrollLabel[cycle.status] : "Belum ada cycle"}</small>
            </div>
          </section>

          <section className="employeeCycleCard">
            <div>
              <span className="dialogEyebrow">Payroll Cycle</span>
              <h2>{cycle ? `${cycle.workDaysCount} dari ${cycle.targetWorkDays} hari kerja` : "Cycle belum berjalan"}</h2>
              <p>{cycle ? `${cycleRemainingDays} hari kerja lagi menuju cycle selesai.` : "Cycle akan terbentuk dari absensi valid."}</p>
            </div>
            <div className="employeeCycleTrack"><span style={{ width: `${cyclePercent}%` }} /></div>
          </section>

          <section className="employeeHistoryCard">
            <div className="employeeSectionHeader">
              <div>
                <h2>Rekap Harian</h2>
                <p>Ringkasan check-in, check-out, durasi kerja, GPS, dan face per tanggal.</p>
              </div>
              <button className="employeeTextButton" type="button" onClick={refreshData}>Refresh</button>
            </div>
            <div className="employeeDailyRecapList">
              {attendanceRecapRows.length === 0 ? (
                <div className="employeeEmptyState">
                  <CalendarCheck2 size={20} />
                  <span>Belum ada riwayat absensi.</span>
                </div>
              ) : attendanceRecapRows.map((row) => (
                <article className="employeeDailyRecapItem" key={row.date}>
                  <div className="employeeDailyRecapTop">
                    <div>
                      <strong>{formatWorkDate(row.date)}</strong>
                      <small>
                        {row.checkIn
                          ? `${row.checkIn.distanceM ?? "-"}m / ${row.checkIn.radiusM ?? "-"}m · face ${row.checkIn.faceScore ?? "-"}`
                          : "Belum ada check-in"}
                      </small>
                    </div>
                    <UiStatusBadge tone={row.checkOut ? "valid" : row.checkIn?.status === "valid" ? "pending" : row.checkIn?.status === "rejected" ? "failed" : "missing"}>
                      {row.checkOut ? "Selesai" : row.checkIn?.status === "valid" ? "Belum pulang" : row.checkIn?.status === "rejected" ? "Ditolak" : "Review"}
                    </UiStatusBadge>
                  </div>
                  <div className="employeeDailyRecapGrid">
                    <span>
                      <small>Masuk</small>
                      <strong>{row.checkIn ? formatAttendanceTime(row.checkIn.eventAt) : "-"}</strong>
                    </span>
                    <span>
                      <small>Pulang</small>
                      <strong>{row.checkOut ? formatAttendanceTime(row.checkOut.eventAt) : "-"}</strong>
                    </span>
                    <span>
                      <small>Durasi</small>
                      <strong>{row.checkIn ? formatAttendanceWorkDuration(row.checkIn.eventAt, row.checkOut ? row.checkOut.eventAt : null, row.date) : "-"}</strong>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <FieldAttendanceDialog
        open={attendanceOpen}
        saving={attendanceSaving}
        defaultEventType={attendanceEventType}
        workLocation={employee ? {
          name: employee.workLocationName,
          latitude: employee.workLocationLatitude,
          longitude: employee.workLocationLongitude,
          radiusM: employee.radiusM,
        } : undefined}
        onClose={() => setAttendanceOpen(false)}
        onSubmit={handleAttendanceSubmit}
      />
      <FaceEnrollmentDialog
        open={faceEnrollmentOpen}
        saving={faceSaving}
        onClose={() => setFaceEnrollmentOpen(false)}
        onSubmit={handleFaceEnrollmentSubmit}
      />
      <ToastViewport toast={toast} onClose={() => setToast(null)} />
    </main>
  )
}

function AuthLoadingPage() {
  return (
    <main className="authSoftShell" aria-busy="true" aria-live="polite">
      <span className="authTopProgress" aria-hidden="true" />
      <section className="authSoftPanel">
        <span className="authSoftLogo brandLogo">
          <img src={dmsLogo} alt="DMS" />
        </span>
        <div>
          <strong>DMS Management</strong>
          <small>Sinkronisasi akses...</small>
        </div>
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

function PasswordRecoveryPage({ email, forced, onCancel, onComplete }: { email?: string; forced?: boolean; onCancel: () => void; onComplete: () => Promise<void> | void }) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage("")

    const validationErrors = validateManualPassword(password, confirmPassword)

    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.join(" "))
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) throw error
      await invokeAppUsersFunction(forced ? "complete_password_change" : "complete_email_password_link", {})
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
          <h1>{forced ? "Ganti Password Wajib" : "Buat Password Baru"}</h1>
        </div>
        <p className="loginSub">{forced ? "Password sementara dari admin wajib diganti sebelum masuk dashboard." : "Masukkan password baru untuk akun DMS"}{email ? ` ${email}` : ""}.</p>

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
              <input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 12 karakter" autoComplete="new-password" required />
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
    () => accessProfile
      ? navItems.filter((item) => productionReadyViews.has(item.id) && canAccessView(accessProfile, item.id))
      : navItems.filter((item) => item.id === "dashboard" || item.id === "profile"),
    [accessProfile],
  )

  const applySession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession)
    setAuthError("")

    if (!nextSession) {
      setAccessProfile(null)
      writeCachedAccessProfile(null)
      setAuthLoading(false)
      return
    }

    const cachedProfile = readCachedAccessProfile(nextSession)

    if (cachedProfile) {
      setAccessProfile(cachedProfile)
      setAuthLoading(false)
    } else {
      setAuthLoading(true)
    }

    try {
      const profile = await loadAppAccessProfile(nextSession)
      setAccessProfile(profile)
      writeCachedAccessProfile(profile)
    } catch (error) {
      if (!cachedProfile) setAccessProfile(null)
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
    writeCachedAccessProfile(null)
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
    if (productionReadyViews.has(activeView) && canAccessView(accessProfile, activeView)) return

    const fallbackView = canAccessView(accessProfile, "dashboard") ? "dashboard" : "profile"
    setActiveView(fallbackView)
  }, [accessProfile, activeView])

  const navigate = (view: ViewId) => {
    if (!productionReadyViews.has(view)) {
      setActiveView(accessProfile && canAccessView(accessProfile, "dashboard") ? "dashboard" : "profile")
      setMobileMenuOpen(false)
      return
    }

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

  if (accessProfile.forcePasswordChange) {
    return (
      <PasswordRecoveryPage
        email={session.user.email}
        forced
        onCancel={handleLogout}
        onComplete={handlePasswordRecoveryComplete}
      />
    )
  }

  if (accessProfile.appScope === "field") {
    return <EmployeePwaApp profile={accessProfile} onLogout={handleLogout} />
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
          ) : activeView === "kiosk-mode" ? (
            <KioskModePage activeView={activeView} />
          ) : activeView === "biofinger" ? (
            <BiofingerPage activeView={activeView} profile={accessProfile} />
          ) : activeView === "attendance-live" || activeView === "attendance-requests" || activeView === "attendance-review" || activeView === "field-monitoring" || activeView === "payroll" ? (
            <AttendanceCyclePage activeView={activeView} />
          ) : activeView === "employees" ? (
            <EmployeesPage activeView={activeView} profile={accessProfile} />
          ) : activeView === "users" ? (
            <UsersPage activeView={activeView} profile={accessProfile} />
          ) : activeView === "role-permission" ? (
            <RolePermissionPage activeView={activeView} profile={accessProfile} />
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
