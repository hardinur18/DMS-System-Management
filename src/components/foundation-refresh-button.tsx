import type { ButtonHTMLAttributes, ReactNode } from "react"
import { RefreshCcw } from "lucide-react"
import clsx from "clsx"

export function FoundationRefreshButton({
  loading,
  label = "Refresh Data",
  loadingLabel = "Memuat...",
  iconSize = 17,
  variant = "secondary",
  className,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  label?: ReactNode
  loadingLabel?: ReactNode
  iconSize?: number
  variant?: "secondary" | "primary" | "text"
}) {
  const variantClassName = variant === "primary"
    ? "primaryButton"
    : variant === "text"
      ? "foundationRefreshTextButton"
      : "secondaryButton"

  return (
    <button
      className={clsx(variantClassName, "foundationRefreshButton", loading && "loading", className)}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <RefreshCcw className="foundationRefreshIcon" size={iconSize} />
      {loading ? loadingLabel : children || label}
    </button>
  )
}
