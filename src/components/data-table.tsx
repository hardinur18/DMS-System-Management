import type { ReactNode } from "react"
import { MoreVertical } from "lucide-react"

export function TableText({
  primary,
  secondary,
}: {
  primary: ReactNode
  secondary?: ReactNode
}) {
  return (
    <span className="tableTextStack">
      <span className="tableTextPrimary">{primary}</span>
      {secondary !== undefined && secondary !== "" && <small className="tableTextSecondary">{secondary}</small>}
    </span>
  )
}

export function TableNumberCell({ value }: { value: number }) {
  return <span className="tableNumber">{String(value).padStart(2, "0")}</span>
}

export function RowActionButton({
  label = "Aksi baris",
  onClick,
}: {
  label?: string
  onClick?: () => void
}) {
  return (
    <button className="rowActionButton" type="button" aria-label={label} onClick={onClick}>
      <MoreVertical size={16} />
    </button>
  )
}
