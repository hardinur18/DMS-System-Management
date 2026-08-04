import { useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react"
import clsx from "clsx"

function toDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDisplayDate(value: string) {
  if (!value) return ""
  const [year, month, day] = value.split("-")
  return `${day}/${month}/${year}`
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
  const [internalValue, setInternalValue] = useState("")
  const [open, setOpen] = useState(false)
  const selectedValue = controlledValue ?? internalValue
  const selectedDate = selectedValue ? new Date(`${selectedValue}T00:00:00`) : today
  const [viewDate, setViewDate] = useState(selectedDate)
  const calendarDays = getCalendarDays(viewDate)
  const todayValue = toDateValue(today)

  const setValue = (value: string) => {
    setInternalValue(value)
    onChange?.(value)
  }

  const moveMonth = (offset: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  return (
    <div className="datePickerField">
      <button className={clsx("dateInputButton", open && "active", !selectedValue && "empty")} type="button" onClick={() => setOpen((value) => !value)}>
        <span>{selectedValue ? formatDisplayDate(selectedValue) : placeholder}</span>
        <CalendarDays size={17} />
      </button>

      {open && (
        <div className="datePickerPopover">
          <div className="datePickerHeader">
            <button type="button" aria-label="Bulan sebelumnya" onClick={() => moveMonth(-1)}>
              <ChevronLeft size={17} />
            </button>
            <strong>{getMonthLabel(viewDate)}</strong>
            <button type="button" aria-label="Bulan berikutnya" onClick={() => moveMonth(1)}>
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="datePickerWeekdays">
            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
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
            <button type="button" onClick={() => setValue("")}>
              <X size={14} />
              Clear
            </button>
            <button type="button" onClick={() => {
              setViewDate(today)
              setValue(todayValue)
              setOpen(false)
            }}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
