import { Children, isValidElement } from "react"
import type { CSSProperties, ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react"
import clsx from "clsx"

import { DatePickerField } from "./date-picker-field"
import { FoundationSelect, type FoundationSelectOption } from "./foundation-select"

type BaseFieldProps = {
  label: string
  required?: boolean
  children: ReactNode
}

export function FormField({ label, required, children }: BaseFieldProps) {
  return (
    <div className="formField">
      <label>
        {label}
        {required && <span className="requiredMark" aria-hidden="true">*</span>}
      </label>
      {children}
    </div>
  )
}

export function TextFormField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
}) {
  return (
    <FormField label={label} required={Boolean(props.required)}>
      <input {...props} />
    </FormField>
  )
}

export function SelectFormField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  children: ReactNode
}) {
  const options = Children.toArray(children).flatMap((child): FoundationSelectOption[] => {
    if (!isValidElement(child)) return []
    if (child.type !== "option") return []

    const optionProps = child.props as {
      children?: ReactNode
      disabled?: boolean
      value?: string | number | readonly string[]
    }
    const optionLabel = optionProps.children
    const optionValue = Array.isArray(optionProps.value)
      ? optionProps.value.join(",")
      : String(optionProps.value ?? (typeof optionLabel === "string" || typeof optionLabel === "number" ? optionLabel : ""))

    return [{
      value: optionValue,
      label: optionLabel,
      searchLabel: typeof optionLabel === "string" || typeof optionLabel === "number" ? String(optionLabel) : optionValue,
      disabled: optionProps.disabled,
    }]
  })
  const selectedValue = Array.isArray(props.value)
    ? props.value[0] || ""
    : String(props.value ?? props.defaultValue ?? "")
  const placeholder = String(options.find((option) => option.value === "")?.label || "Pilih data")
  const handleChange = (nextValue: string) => {
    props.onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as ChangeEvent<HTMLSelectElement>)
  }

  return (
    <FormField label={label} required={Boolean(props.required)}>
      <FoundationSelect
        label={label}
        value={selectedValue}
        options={options}
        placeholder={placeholder}
        disabled={props.disabled}
        searchable={options.length > 8}
        onChange={handleChange}
      />
    </FormField>
  )
}

export function SegmentedFormField<TValue extends string>({
  label,
  value,
  options,
  onChange,
  required,
  columns = 3,
}: {
  label: string
  value: TValue
  options: Array<{
    value: TValue
    label: string
    description?: string
  }>
  onChange: (value: TValue) => void
  required?: boolean
  columns?: 2 | 3
}) {
  return (
    <FormField label={label} required={required}>
      <div className="formSegmentedControl" role="radiogroup" aria-label={label} style={{ "--segment-count": columns } as CSSProperties}>
        {options.map((option) => (
          <button
            className={clsx("formSegmentedOption", value === option.value && "active")}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <strong>{option.label}</strong>
            {option.description && <small>{option.description}</small>}
          </button>
        ))}
      </div>
    </FormField>
  )
}

export function DateFormField({
  label,
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  required?: boolean
}) {
  return (
    <FormField label={label} required={required}>
      <DatePickerField placeholder={placeholder} value={value} onChange={onChange} />
    </FormField>
  )
}

export function SwitchFormField({
  label,
  checked,
  onChange,
  onLabel = "Aktif",
  offLabel = "Nonaktif",
  onDescription = "Data aktif dan bisa dipakai modul lain.",
  offDescription = "Data disimpan, tapi tidak dipakai pilihan aktif.",
  required,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  onLabel?: string
  offLabel?: string
  onDescription?: string
  offDescription?: string
  required?: boolean
  disabled?: boolean
}) {
  return (
    <FormField label={label} required={required}>
      <button
        className="formSwitchControl"
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked)
        }}
      >
        <span className="formSwitchTrack">
          <span className="formSwitchThumb" />
        </span>
        <span className="formSwitchCopy">
          <strong>{checked ? onLabel : offLabel}</strong>
          <small>{checked ? onDescription : offDescription}</small>
        </span>
      </button>
    </FormField>
  )
}
