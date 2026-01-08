import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost";
  size?: "default" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700 disabled:opacity-50 disabled:pointer-events-none";
    const variants = {
      default: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
      ghost: "bg-transparent text-zinc-100 hover:bg-zinc-900",
    } as const;
    const sizes = {
      default: "h-9 px-4 py-2",
      icon: "h-9 w-9",
    } as const;

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
