import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/accounting/utils"

export function Amount({
  value,
  className,
  colorBySign = false,
  showSign = false,
  muted = false,
}: {
  value: number
  className?: string
  colorBySign?: boolean
  showSign?: boolean
  muted?: boolean
}) {
  const color = colorBySign
    ? value > 0
      ? "text-credit"
      : value < 0
        ? "text-debit"
        : "text-muted-foreground"
    : muted
      ? "text-muted-foreground"
      : ""

  return (
    <span className={cn("font-mono tabular-nums tracking-tight", color, className)}>
      {value === 0 && muted ? "-" : formatCurrency(value, showSign)}
    </span>
  )
}
