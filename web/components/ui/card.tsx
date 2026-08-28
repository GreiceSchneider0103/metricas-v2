import type { ElementType, HTMLAttributes } from "react";

type CardProps<T extends ElementType> = { as?: T } & Omit<HTMLAttributes<HTMLElement>, "as">;

export function Card<T extends ElementType = "div">({ as, className = "", ...props }: CardProps<T>) {
  const Component = as ?? "div";
  return <Component className={`rounded-xl border border-slate-200/80 bg-white p-4 shadow-card ${className}`} {...props} />;
}
