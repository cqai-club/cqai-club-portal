"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { ClearControlButton, useClearableControl, type ClearableProps } from "./clear-control"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & ClearableProps>(
  ({ className, type, clearable = true, clearLabel, onClear, wrapperClassName, onChange, onInput, ...props }, ref) => {
    const { ref: inputRef, hasValue, trackValue, clear } = useClearableControl<HTMLInputElement>(props.value, props.defaultValue, onClear)
    React.useImperativeHandle(ref, () => inputRef.current!)
    const supportsClear = clearable && !["file", "checkbox", "radio", "range", "color", "hidden", "button", "submit", "reset", "image"].includes(type || "text")
    const canClear = supportsClear && !props.disabled && !props.readOnly
    const input = (
      <input
        type={type}
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          className,
          supportsClear && "pr-10 [&::-webkit-search-cancel-button]:appearance-none"
        )}
        ref={inputRef}
        {...props}
        onChange={event => { trackValue(event.currentTarget.value); onChange?.(event) }}
        onInput={event => { trackValue(event.currentTarget.value); onInput?.(event) }}
      />
    )
    if (!supportsClear) return input
    return <div className={cn("relative flex w-full min-w-0 items-center", wrapperClassName)}>{input}{canClear && hasValue && <ClearControlButton label={clearLabel} onClick={clear} />}</div>
  }
)
Input.displayName = "Input"

export { Input }
