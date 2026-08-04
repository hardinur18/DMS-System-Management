import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react"

import { DatePickerField } from "./date-picker-field"

type BaseFieldProps = {
  label: string
  children: ReactNode
}

export function FormField({ label, children }: BaseFieldProps) {
  return (
    <div className="formField">
      <label>{label}</label>
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
    <FormField label={label}>
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
  return (
    <FormField label={label}>
      <select {...props}>{children}</select>
    </FormField>
  )
}

export function DateFormField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <FormField label={label}>
      <DatePickerField placeholder={placeholder} value={value} onChange={onChange} />
    </FormField>
  )
}
