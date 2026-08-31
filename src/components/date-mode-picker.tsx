import { useEffect, useRef, useState } from "react"
import { CalendarCheck2, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import clsx from "clsx"

export type DateModePickerMode = "today" | "yesterday" | "last7" | "last30" | "day" | "week" | "month" | "year" | "all"
type DateModePickerRange = { start: string; end: string }

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function parseDateKey(value: string) {
  if (!value) return new Date()
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function shiftDateKey(value: string, offsetDays: number) {
  const base = parseDateKey(value || getLocalDateKey())
  base.setDate(base.getDate() + offsetDays)
  return getLocalDateKey(base)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
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

function formatDateLabel(value?: string | null) {
  if (!value) return "-"
  const parsed = parseDateKey(value)
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed)
}

function formatMonthLabel(value?: string | null) {
  const parsed = parseDateKey(value || getLocalDateKey())
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(parsed)
}

function getMonthRange(value?: string | null): DateModePickerRange {
  const parsed = parseDateKey(value || getLocalDateKey())
  const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
  const end = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0)

  return { start: getLocalDateKey(start), end: getLocalDateKey(end) }
}

export function getDateModePickerLabel(selectedDate: string, mode: DateModePickerMode) {
  if (mode === "today") return "Hari ini"
  if (mode === "yesterday") return "Kemarin"
  if (mode === "last7") return "7 hari sebelumnya"
  if (mode === "last30") return "30 hari sebelumnya"
  if (mode === "day") return `Per hari - ${formatDateLabel(selectedDate)}`
  if (mode === "week") return `Per minggu - ${formatDateLabel(selectedDate)}`
  if (mode === "month") return `Per bulan - ${formatMonthLabel(selectedDate)}`
  if (mode === "year") return `Tahun ${selectedDate.slice(0, 4)}`
  return "Semua waktu"
}

function isRangeMode(mode: DateModePickerMode) {
  return mode === "last7" || mode === "last30" || mode === "week" || mode === "month" || mode === "year" || mode === "all"
}

function getDateModePickerRange(selectedDate: string, mode: DateModePickerMode): DateModePickerRange {
  const end = selectedDate || getLocalDateKey()
  if (mode === "last7" || mode === "week") return { start: shiftDateKey(end, -6), end }
  if (mode === "last30") return { start: shiftDateKey(end, -29), end }
  if (mode === "month") return getMonthRange(end)
  if (mode === "year") return { start: `${end.slice(0, 4)}-01-01`, end }
  if (mode === "all") return { start: "", end }
  return { start: end, end }
}

function getDateModePickerRangeSummary(selectedDate: string, mode: DateModePickerMode) {
  const range = getDateModePickerRange(selectedDate, mode)
  if (range.start && range.start !== range.end) return `${formatDateLabel(range.start)} - ${formatDateLabel(range.end)}`
  if (mode === "today") return "Real-time (GMT+07)"
  return getDateModePickerLabel(selectedDate, mode)
}

function getPreferredCalendarMonth(selectedDate: string, mode: DateModePickerMode) {
  const range = getDateModePickerRange(selectedDate, mode)
  return parseDateKey(range.start || range.end)
}

function useCompactDateModePicker() {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const mediaQuery = window.matchMedia("(max-width: 760px)")
    const syncCompact = () => setCompact(mediaQuery.matches)
    syncCompact()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncCompact)
      return () => mediaQuery.removeEventListener("change", syncCompact)
    }

    mediaQuery.addListener(syncCompact)
    return () => mediaQuery.removeListener(syncCompact)
  }, [])

  return compact
}

export function DateModePicker({
  value,
  mode,
  onChange,
  className,
}: {
  value: string
  mode: DateModePickerMode
  onChange: (nextDate: string, nextMode: DateModePickerMode) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => getPreferredCalendarMonth(value || getLocalDateKey(), mode))
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const compact = useCompactDateModePicker()
  const todayDate = getLocalDateKey()
  const yesterdayDate = shiftDateKey(todayDate, -1)
  const activeLabel = getDateModePickerLabel(value, mode)
  const rangeMode = isRangeMode(mode)
  const showRangeCalendar = rangeMode && !compact
  const activeRange = getDateModePickerRange(value || todayDate, mode)
  const visibleMonths = showRangeCalendar ? [calendarMonth, addMonths(calendarMonth, 1)] : [calendarMonth]
  const presets: Array<{ mode: DateModePickerMode; label: string; date?: string }> = [
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
    setCalendarMonth(getPreferredCalendarMonth(value || todayDate, mode))
  }, [mode, todayDate, value])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const selectPreset = (preset: { mode: DateModePickerMode; label: string; date?: string }) => {
    const nextDate = preset.date || value || todayDate
    onChange(nextDate, preset.mode)
    setCalendarMonth(getPreferredCalendarMonth(nextDate, preset.mode))
  }

  const moveMonth = (amount: number) => {
    setCalendarMonth((current) => addMonths(current, amount))
  }

  const renderCalendarMonth = (monthDate: Date, monthIndex: number) => {
    const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(monthDate)
    const calendarDays = getCalendarMonthDays(monthDate)

    return (
      <div className="dateModePickerMonthPanel" key={`${monthDate.getFullYear()}-${monthDate.getMonth()}-${monthIndex}`}>
        <div className="dateModePickerCalendarHeader attendanceDateCalendarHeader">
          <button type="button" onClick={() => moveMonth(-12)} aria-label="Tahun sebelumnya" title="Tahun sebelumnya"><ChevronsLeft size={16} /></button>
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Bulan sebelumnya" title="Bulan sebelumnya"><ChevronLeft size={16} /></button>
          <strong>{monthLabel}</strong>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Bulan berikutnya" title="Bulan berikutnya"><ChevronRight size={16} /></button>
          <button type="button" onClick={() => moveMonth(12)} aria-label="Tahun berikutnya" title="Tahun berikutnya"><ChevronsRight size={16} /></button>
        </div>
        <div className="dateModePickerWeekdays attendanceDateWeekdays">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="dateModePickerGrid attendanceDateGrid">
          {calendarDays.map((day) => {
            const rangeStart = Boolean(activeRange.start && day.key === activeRange.start)
            const rangeEnd = Boolean(activeRange.end && day.key === activeRange.end)
            const rangeMiddle = Boolean(activeRange.start && activeRange.end && day.key > activeRange.start && day.key < activeRange.end)
            const active = day.key === value && (!rangeMode || !activeRange.start)

            return (
              <button
                className={clsx(
                  day.muted && "muted",
                  day.key === todayDate && "today",
                  active && "active",
                  rangeMode && rangeStart && "rangeStart",
                  rangeMode && rangeMiddle && "rangeMiddle",
                  rangeMode && rangeEnd && "rangeEnd",
                  rangeMode && rangeStart && rangeEnd && "singleRange",
                )}
                key={`${monthIndex}-${day.key}`}
                type="button"
                aria-pressed={active || rangeStart || rangeEnd}
                onClick={() => {
                  onChange(day.key, rangeMode ? mode : "day")
                  setCalendarMonth(getPreferredCalendarMonth(day.key, rangeMode ? mode : "day"))
                }}
              >
                {day.date.getDate()}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={clsx("dateModePicker attendanceDateFilter", open && "open", className)} ref={pickerRef}>
      <button
        className={clsx("dateModePickerTrigger attendanceDateTrigger", open && "active")}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarCheck2 size={18} />
        <span>{activeLabel}</span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className={clsx("dateModePickerPopover attendanceDatePopover", showRangeCalendar && "rangeMode")}>
          <aside className="dateModePickerSidebar attendanceDateSidebar">
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
          <section className="dateModePickerCalendar attendanceDateCalendar">
            <div className="dateModePickerMonths">
              {visibleMonths.map((monthDate, monthIndex) => renderCalendarMonth(monthDate, monthIndex))}
            </div>
            <div className="dateModePickerFooter attendanceDateFooter">
              <strong>{getDateModePickerRangeSummary(value || todayDate, mode)}</strong>
              <button type="button" onClick={() => setOpen(false)}>Tutup</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
