import type { CSSProperties, HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, MoreVertical } from "lucide-react"

function isInteractiveTableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest("button, a, input, select, textarea, [data-row-action='true']"))
}

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

export function ClickableTableRow({
  children,
  onOpen,
  label,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & {
  children: ReactNode
  onOpen: () => void
  label: string
}) {
  const handleClick = (event: ReactMouseEvent<HTMLTableRowElement>) => {
    if (isInteractiveTableTarget(event.target)) return
    onOpen()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTableRowElement>) => {
    if (isInteractiveTableTarget(event.target)) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onOpen()
  }

  return (
    <tr
      {...props}
      className={["clickableTableRow", props.className].filter(Boolean).join(" ")}
      tabIndex={0}
      role="button"
      aria-label={label}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </tr>
  )
}

export function RowActionButton({
  label = "Aksi baris",
  onClick,
}: {
  label?: string
  onClick?: () => void
}) {
  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onClick?.()
  }

  return (
    <button className="rowActionButton" type="button" aria-label={label} data-row-action="true" onClick={handleClick}>
      <MoreVertical size={16} />
    </button>
  )
}

export function RowActionMenu({
  label = "Aksi baris",
  children,
}: {
  label?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const stopRowEvent = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const toggleMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen((value) => !value)
  }

  const syncPosition = () => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const menuWidth = 168
    const estimatedHeight = 132
    const gap = 8
    const top = rect.bottom + estimatedHeight + gap > window.innerHeight
      ? Math.max(12, rect.top - estimatedHeight - gap)
      : rect.bottom + gap
    const left = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.right - menuWidth))

    setPosition({
      position: "fixed",
      top,
      left,
      width: menuWidth,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    syncPosition()
  }, [open])

  useEffect(() => {
    if (!open) return

    const close = () => setOpen(false)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }

    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <span className="rowActionMenu" data-row-action="true" onClick={stopRowEvent}>
      <button ref={buttonRef} className="rowActionButton" type="button" aria-label={label} aria-expanded={open} data-row-action="true" onClick={toggleMenu}>
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <>
          <span className="rowActionMenuScrim" data-row-action="true" onClick={(event) => {
            event.stopPropagation()
            setOpen(false)
          }} />
          <span className="rowActionMenuPanel floating" style={position} data-row-action="true" onClick={(event) => {
            event.stopPropagation()
            setOpen(false)
          }}>
            {children}
          </span>
        </>,
        document.body,
      )}
    </span>
  )
}

export function RowActionMenuItem({
  children,
  danger,
  disabled,
  onClick,
}: {
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    onClick?.()
  }

  return (
    <button className={danger ? "danger" : undefined} type="button" disabled={disabled} data-row-action="true" onClick={handleClick}>
      {children}
    </button>
  )
}

export function DataTablePagination({
  page,
  pageSize,
  totalRows,
  pageSizeOptions = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  totalRows: number
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const safePageSize = Math.min(50, Math.max(1, pageSize))
  const pageCount = Math.max(1, Math.ceil(totalRows / safePageSize))
  const currentPage = Math.min(Math.max(1, page), pageCount)
  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * safePageSize + 1
  const endRow = Math.min(totalRows, currentPage * safePageSize)
  const normalizedOptions = pageSizeOptions
    .filter((option) => option > 0 && option <= 50)
    .filter((option, index, options) => options.indexOf(option) === index)

  return (
    <div className="dataTablePagination">
      <div className="dataTablePaginationInfo">
        <span>{startRow}-{endRow} dari {totalRows} data</span>
      </div>
      <div className="dataTablePaginationControls">
        <label>
          Baris
          <select value={safePageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {normalizedOptions.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
        <span>Halaman {currentPage} dari {pageCount}</span>
        <div className="dataTablePageButtons">
          <button type="button" aria-label="Halaman sebelumnya" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label="Halaman berikutnya" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
