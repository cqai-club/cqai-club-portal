"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

type MobileMenuProps = {
  children: ReactNode;
  className: string;
};

export function MobileMenu({ children, className }: MobileMenuProps) {
  const closeAfterNavigation = (event: MouseEvent<HTMLDetailsElement>) => {
    if (event.target instanceof Element && event.target.closest("nav a[href]")) {
      event.currentTarget.open = false;
    }
  };

  const closeOnEscape = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;

    event.preventDefault();
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  };

  return (
    <details className={className} onClick={closeAfterNavigation} onKeyDown={closeOnEscape}>
      {children}
    </details>
  );
}
