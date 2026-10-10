import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Severity } from "../api";
import { useT } from "../i18n";

/** Small set of Tailwind primitives shared across screens (no component lib). */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-500/40";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-forge-500 text-white hover:bg-forge-600",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

type Tone = "slate" | "green" | "amber" | "red" | "blue";

const BADGE_TONE: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  green: "bg-forge-50 text-forge-700 border-forge-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
};

export function Badge({
  tone = "slate",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const SEVERITY_TONE: Record<Severity, Tone> = {
  low: "slate",
  medium: "amber",
  high: "red",
  critical: "red",
};

export function SeverityTag({ severity }: { severity: Severity }) {
  const t = useT();
  return (
    <Badge tone={SEVERITY_TONE[severity]} className="uppercase tracking-wide">
      {t(severity)}
    </Badge>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}
