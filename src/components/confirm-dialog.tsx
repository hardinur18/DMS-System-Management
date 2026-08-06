import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { AlertTriangle, X } from "lucide-react"
import clsx from "clsx"

type ConfirmDialogTone = "default" | "danger" | "warning"

const toneIconClass: Record<ConfirmDialogTone, string> = {
  default: "default",
  danger: "danger",
  warning: "warning",
}

export function ConfirmDialog({
  open,
  title,
  description,
  eyebrow = "Validasi Aksi",
  icon: Icon = AlertTriangle,
  tone = "default",
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  loading,
  children,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description?: ReactNode
  eyebrow?: string
  icon?: LucideIcon
  tone?: ConfirmDialogTone
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  children?: ReactNode
  onClose: () => void
  onConfirm: () => void
}) {
  if (!open) return null

  return (
    <div className="dialogBackdrop confirmDialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={clsx("dialogPanel confirmDialog", tone)}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-description" : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="iconButton dialogClose confirmDialogClose" type="button" aria-label="Tutup validasi" onClick={onClose} disabled={loading}>
          <X size={18} />
        </button>

        <div className="confirmDialogIconWrap">
          <span className={clsx("confirmDialogIcon", toneIconClass[tone])}>
            <Icon size={24} />
          </span>
        </div>

        <div className="confirmDialogCopy">
          <span className="confirmDialogEyebrow">{eyebrow}</span>
          <h2 id="confirm-dialog-title">{title}</h2>
          {description && <p id="confirm-dialog-description">{description}</p>}
        </div>

        {children && <div className="confirmDialogContent">{children}</div>}

        <div className="confirmDialogActions">
          <button className="secondaryButton" type="button" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button className={clsx("primaryButton", tone === "danger" && "dangerButton")} type="button" onClick={onConfirm} disabled={loading}>
            {loading ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
