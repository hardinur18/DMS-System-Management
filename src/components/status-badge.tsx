import type { ReactNode } from "react"
import clsx from "clsx"

type StatusTone = "valid" | "pending" | "failed" | "missing"

export function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode
  tone: StatusTone
}) {
  return <span className={clsx("statusPill", tone)}>{children}</span>
}

export function AutoStatusBadge({ value }: { value: string | number }) {
  const normalized = String(value).toLowerCase()
  const tone =
    normalized.includes("valid") ||
    normalized.includes("aktif") ||
    normalized.includes("approved") ||
    normalized.includes("checkout") ||
    normalized.includes("online") ||
    normalized.includes("converted") ||
    normalized.includes("ready") ||
    normalized.includes("success")
      ? "valid"
      : normalized.includes("pending") ||
        normalized.includes("review") ||
        normalized.includes("draft") ||
        normalized.includes("idle") ||
        normalized.includes("active") ||
        normalized.includes("mapped") ||
        normalized.includes("dicicil") ||
        normalized.includes("invite")
        ? "pending"
        : normalized.includes("failed") ||
          normalized.includes("locked") ||
          normalized.includes("ditolak") ||
          normalized.includes("error") ||
          normalized.includes("over")
          ? "failed"
          : "missing"

  return <StatusBadge tone={tone}>{value}</StatusBadge>
}
