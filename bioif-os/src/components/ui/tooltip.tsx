import * as React from "react";
import { cn } from "@/lib/utils";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function TooltipTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function TooltipContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  // 这个最小版不做复杂定位；我们在触发元素里用 title/aria 也足够
  return (
    <div
      className={cn(
        "hidden",
        className
      )}
    >
      {children}
    </div>
  );
}
