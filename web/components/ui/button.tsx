import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:bg-white",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:bg-transparent",
  danger: "border border-red-200 text-red-600 hover:bg-red-50 disabled:bg-transparent"
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm"
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
