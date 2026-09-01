"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

// Dropdown com portal pra document.body: o header pode ficar dentro de uma
// nav com overflow-x-auto (rolagem horizontal em telas estreitas), e um
// painel absolute normal seria cortado verticalmente por ela. Renderizando
// via portal + posicao "fixed" calculada a partir do trigger, o painel some
// desse problema em qualquer largura de tela.
export function HeaderMenu({
  label,
  align = "left",
  className = "",
  panelClassName = "",
  children
}: {
  label: ReactNode;
  align?: "left" | "right";
  className?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(
        align === "right"
          ? { top: rect.bottom + 6, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 6, left: rect.left }
      );
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 whitespace-nowrap ${className}`}
        aria-expanded={open}
      >
        {label}
        <ChevronIcon open={open} />
      </button>
      {open && position && (
        <MenuPortal>
          <div
            ref={panelRef}
            style={{ position: "fixed", top: position.top, left: position.left, right: position.right }}
            className={`z-50 min-w-[180px] overflow-hidden rounded-xl border border-slate-200/80 bg-white py-1 shadow-card ${panelClassName}`}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </MenuPortal>
      )}
    </>
  );
}

function MenuPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function HeaderMenuItem({
  selected,
  disabled,
  hint,
  onClick,
  children
}: {
  selected?: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        if (disabled) {
          event.stopPropagation();
          return;
        }
        onClick?.();
      }}
      className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
        disabled
          ? "cursor-not-allowed text-slate-300"
          : selected
            ? "bg-brand-50 font-medium text-brand-700"
            : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="truncate">{children}</span>
      {hint && <span className="shrink-0 text-xs text-slate-400">{hint}</span>}
    </button>
  );
}
