import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import clsx from "clsx"

type FoundationDialogMode = "default" | "guide"

export function FoundationDialog({
  open,
  mode = "default",
  role = "dialog",
  labelledBy,
  describedBy,
  className,
  backdropClassName,
  closeOnBackdrop = true,
  lockBodyScroll = true,
  children,
  onClose,
}: {
  open: boolean
  mode?: FoundationDialogMode
  role?: "dialog" | "alertdialog"
  labelledBy?: string
  describedBy?: string
  className?: string
  backdropClassName?: string
  closeOnBackdrop?: boolean
  lockBodyScroll?: boolean
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    if (!open || !lockBodyScroll) return

    const previousOverflow = document.body.style.overflow
    const previousOverscrollBehavior = document.body.style.overscrollBehavior
    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscrollBehavior
    }
  }, [lockBodyScroll, open])

  if (!open) return null

  return createPortal(
    <div
      className={clsx("dialogBackdrop foundationDialogBackdrop", mode === "guide" && "foundationDialogBackdropGuide", backdropClassName)}
      role="presentation"
      onMouseDown={closeOnBackdrop ? onClose : undefined}
    >
      <section
        className={clsx("dialogPanel foundationDialogPanel", mode === "guide" && "foundationDialogPanelGuide", className)}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body,
  )
}

export function FoundationDialogCloseButton({
  label = "Tutup dialog",
  disabled,
  className,
  onClose,
}: {
  label?: string
  disabled?: boolean
  className?: string
  onClose: () => void
}) {
  return (
    <button className={clsx("iconButton dialogClose foundationDialogClose", className)} type="button" aria-label={label} onClick={onClose} disabled={disabled}>
      <X size={18} />
    </button>
  )
}
