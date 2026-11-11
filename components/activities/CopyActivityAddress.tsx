"use client";

import { useState } from "react";
import { PiCopy } from "react-icons/pi";

import { useToast } from "@/hooks/use-toast";

function copyWithSelection(address: string) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = document.createElement("textarea");
  input.value = address;
  input.readOnly = true;
  input.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px";
  document.body.append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, address.length);
    return document.execCommand("copy");
  } finally {
    input.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

export function CopyActivityAddress({ address, className }: { address: string; className: string }) {
  const { toast } = useToast();
  const [copying, setCopying] = useState(false);

  async function copy() {
    if (copying) return;
    setCopying(true);
    try {
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(address);
          copied = true;
        }
      } catch { /* Older mobile browsers may only support copying selected text. */ }
      if (!copied) copied = copyWithSelection(address);
      if (!copied) throw new Error("Copy unavailable");
      toast({ title: "地址已复制", duration: 2500 });
    } catch {
      toast({
        title: "请手动复制地址",
        description: <input aria-label="完整活动地址，选中后复制" readOnly value={address}
          onFocus={event => event.currentTarget.select()}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 text-base text-foreground" />,
        duration: 10000,
      });
    } finally {
      setCopying(false);
    }
  }

  return <button type="button" className={className} onClick={() => { void copy(); }}
    aria-disabled={copying} aria-busy={copying} aria-label="复制完整活动地址" title="复制地址">
    <PiCopy size={20} aria-hidden="true" />
  </button>;
}
