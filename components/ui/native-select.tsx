"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { useTranslations } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"
import { ClearControlButton, useClearableControl, type ClearableProps } from "./clear-control"

function hasEmptyOption(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(child => React.isValidElement<{ value?: unknown; children?: React.ReactNode }>(child) &&
    ((child.type === "option" && child.props.value === "") || hasEmptyOption(child.props.children)))
}

const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & ClearableProps & { placeholder?: string; clearValue?: string }>(
  ({ children, className, clearable = true, clearLabel, onClear, wrapperClassName, placeholder, clearValue = "", onChange, ...props }, ref) => {
    const { t } = useTranslations()
    const { ref: selectRef, hasValue, trackValue, clear } = useClearableControl<HTMLSelectElement>(props.value, props.defaultValue, onClear, clearValue)
    React.useImperativeHandle(ref, () => selectRef.current!)
    const canClear = clearable && !props.disabled && !props.multiple
    if (props.multiple) return <select ref={selectRef} className={className} onChange={onChange} {...props}>{children}</select>
    return (
      <div className={cn("relative flex w-full min-w-0 items-center", wrapperClassName)}>
        <select
          ref={selectRef}
          className={cn("h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className, "appearance-none", canClear ? "pr-18" : "pr-9")}
          {...props}
          onChange={event => { trackValue(event.currentTarget.value); onChange?.(event) }}
        >
          {clearable && clearValue === "" && !hasEmptyOption(children) && <option value="">{placeholder || t("common.selectPlaceholder")}</option>}
          {children}
        </select>
        {canClear && hasValue && <ClearControlButton label={clearLabel} className="right-8" onClick={clear} />}
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
      </div>
    )
  },
)
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
