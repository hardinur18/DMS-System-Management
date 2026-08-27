import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react"
import clsx from "clsx"

const weekdayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

function toDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseDateValue(value?: string) {
  if (!value) return null
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return null

  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function shiftDate(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function formatDisplayDate(value: string) {
  if (!value) return ""
  const date = parseDateValue(value)
  if (!date) return value

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function getMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(date)
}

function getCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDate = new Date(year, month, 1)
  const start = new Date(firstDate)
  start.setDate(firstDate.getDate() - firstDate.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function DatePickerField({
  placeholder = "Pilih tanggal",
  value: controlledValue,
  onChange,
}: {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
}) {
  const today = useMemo(() => new Date(), [])
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [internalValue, setInternalValue] = useState("")
  const [open, setOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState({ left: 0, top: 0, width: 476 })
  const selectedValue = controlledValue ?? internalValue
  const selectedDate = parseDateValue(selectedValue) ?? today
  const [viewDate, setViewDate] = useState(selectedDate)
  const calendarDays = getCalendarDays(viewDate)
  const todayValue = toDateValue(today)
  const quickPresets = [
    { label: "Hari ini", value: today },
    { label: "Kemarin", value: shiftDate(today, -1) },
    { label: "Awal bulan", value: new Date(today.getFullYear(), today.getMonth(), 1) },
  ]

  const setValue = (value: string) => {
    setInternalValue(value)
    onChange?.(value)
    const nextDate = parseDateValue(value)
    if (nextDate) setViewDate(nextDate)
  }

  const moveMonth = (offset: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  const moveYear = (offset: number) => {
    setViewDate((current) => new Date(current.getFullYear() + offset, current.getMonth(), 1))
  }

  const updatePopoverPosition = () => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const viewportPadding = window.innerWidth < 560 ? 12 : 16
    const width = Math.min(window.innerWidth < 560 ? 360 : 476, window.innerWidth - viewportPadding * 2)
    const popoverHeight = popoverRef.current?.offsetHeight || 386
    const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding)
    const preferredTop = rect.bottom + 10
    const flippedTop = rect.top - popoverHeight - 10
    const top = preferredTop + popoverHeight > window.innerHeight - viewportPadding
      ? Math.max(viewportPadding, flippedTop)
      : preferredTop

    setPopoverStyle({ left, top, width })
  }

  useEffect(() => {
    if (open) setViewDate(selectedDate)
  }, [open, selectedValue])

  useLayoutEffect(() => {
    if (!open) return

    updatePopoverPosition()
  }, [open, viewDate])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    const handlePositionChange = () => updatePopoverPosition()

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handlePositionChange)
    window.addEventListener("scroll", handlePositionChange, true)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handlePositionChange)
      window.removeEventListener("scroll", handlePositionChange, true)
    }
  }, [open])

  const calendarPopover = open ? createPortal(
    <div className="datePickerPopover portal" ref={popoverRef} style={popoverStyle}>
      <div className="datePickerShell">
        <aside className="datePickerSidebar" aria-label="Pilihan tanggal cepat">
          <small>Pilihan cepat</small>
          {quickPresets.map((preset) => {
            const presetValue = toDateValue(preset.value)
            return (
              <button
                className={clsx("datePickerPreset", selectedValue === presetValue && "active")}
                key={preset.label}
                type="button"
                onClick={() => {
                  setValue(presetValue)
                  setOpen(false)
                }}
              >
                {preset.label}
              </button>
            )
          })}
        </aside>

        <section className="datePickerCalendarPanel" aria-label="Kalender">
          <div className="datePickerHeader">
            <span className="datePickerHeaderNav">
              <button type="button" aria-label="Tahun sebelumnya" title="Tahun sebelumnya" onClick={() => moveYear(-1)}>
                <ChevronsLeft size={16} />
              </button>
              <button type="button" aria-label="Bulan sebelumnya" title="Bulan sebelumnya" onClick={() => moveMonth(-1)}>
                <ChevronLeft size={16} />
              </button>
            </span>
            <strong>{getMonthLabel(viewDate)}</strong>
            <span className="datePickerHeaderNav">
              <button type="button" aria-label="Bulan berikutnya" title="Bulan berikutnya" onClick={() => moveMonth(1)}>
                <ChevronRight size={16} />
              </button>
              <button type="button" aria-label="Tahun berikutnya" title="Tahun berikutnya" onClick={() => moveYear(1)}>
                <ChevronsRight size={16} />
              </button>
            </span>
          </div>

          <div className="datePickerWeekdays">
            {weekdayLabels.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="datePickerGrid">
            {calendarDays.map((date) => {
              const dateValue = toDateValue(date)
              const currentMonth = date.getMonth() === viewDate.getMonth()
              const active = dateValue === selectedValue
              return (
                <button
                  className={clsx("datePickerDay", !currentMonth && "muted", dateValue === todayValue && "today", active && "active")}
                  key={dateValue}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setValue(dateValue)
                    setOpen(false)
                  }}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="datePickerFooter">
            <span>{selectedValue ? formatDisplayDate(selectedValue) : "Belum pilih tanggal"}</span>
            <button type="button" onClick={() => setValue("")}>
              <X size={14} />
              Hapus
            </button>
            <button
              type="button"
              onClick={() => {
                setViewDate(today)
                setValue(todayValue)
                setOpen(false)
              }}
            >
              Hari ini
            </button>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div className="datePickerField">
      <button
        ref={buttonRef}
        className={clsx("dateInputButton", open && "active", !selectedValue && "empty")}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selectedValue ? formatDisplayDate(selectedValue) : placeholder}</span>
        <CalendarDays size={17} />
      </button>
      {calendarPopover}
    </div>
  )
}
