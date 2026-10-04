"use client"

import * as React from "react"
import { X } from "lucide-react"
import { useTranslations } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

export type ClearableProps = {
  clearable?: boolean
  clearLabel?: string
  onClear?: () => void
  wrapperClassName?: string
}

export function useClearableControl<T extends HTMLInputElement | HTMLSelectElement>(
  value: unknown,
  defaultValue: unknown,
  onClear?: () => void,
  clearValue = "",
) {
  const ref = React.useRef<T>(null)
  const [localValue, setLocalValue] = React.useState(String(defaultValue ?? ""))
  const currentValue = value === undefined ? localValue : String(value ?? "")

  React.useEffect(() => {
    const node = ref.current
    if (!node) return
    // Native reset restores defaultValue after the reset event finishes.
    let resetTimer: ReturnType<typeof setTimeout> | undefined
    const reset = () => {
      clearTimeout(resetTimer)
      resetTimer = setTimeout(() => setLocalValue(node.value), 0)
    }
    node.form?.addEventListener("reset", reset)
    return () => { node.form?.removeEventListener("reset", reset); clearTimeout(resetTimer) }
  }, [])

  function clear() {
    const node = ref.current
    if (!node || node.matches(":disabled") || (node instanceof HTMLInputElement && node.readOnly)) return
    // Use the native setter so React's value tracker sees the change and invokes
    // existing onChange handlers, including controlled form state/validation.
    const prototype = node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(node, clearValue)
    node.dispatchEvent(new Event("input", { bubbles: true }))
    node.dispatchEvent(new Event("change", { bubbles: true }))
    setLocalValue(node.value)
    node.focus()
    onClear?.()
  }

  return { ref, hasValue: currentValue.length > 0 && currentValue !== clearValue, trackValue: setLocalValue, clear }
}

export function ClearControlButton({ label, className, onClick }: { label?: string; className?: string; onClick: () => void }) {
  const { t } = useTranslations()
  const text = label || t("common.clear")
  return (
    <button
      type="button"
      aria-label={text}
      title={text}
      className={cn("absolute inset-y-0 right-1 my-auto flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:hidden", className)}
      onPointerDown={event => event.preventDefault()}
      onClick={event => { event.preventDefault(); event.stopPropagation(); onClick() }}
    >
      <X aria-hidden="true" className="size-4" />
    </button>
  )
}
