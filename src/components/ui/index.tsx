import type { HTMLAttributes, ReactNode } from "react";
import { SHADES } from "../../lib/constants";
import type { ShadeKey } from "../../lib/types";

export function GlassPanel({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function GlassStrongPanel({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass-strong ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function LiftedTile({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`lifted ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function FlatPanel({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flat ${className}`} {...rest}>
      {children}
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
}

export function StatTile({ label, value, sub, icon }: StatTileProps) {
  return (
    <GlassPanel className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {icon && <span className="text-white/40">{icon}</span>}
      </div>
      <div className="text-3xl font-semibold tracking-tight text-white">{value}</div>
      {sub && <div className="text-xs text-white/45">{sub}</div>}
    </GlassPanel>
  );
}

export function MonoBadge({ children, shade = "graphite" }: { children: ReactNode; shade?: ShadeKey }) {
  const s = SHADES[shade];
  return (
    <span
      className="chip"
      style={{ background: s.chip, borderColor: s.ring, color: "rgba(255,255,255,0.85)" }}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 text-white/20">{icon}</div>}
      <p className="text-sm font-medium text-white/55">{title}</p>
      {hint && <p className="text-xs text-white/30 mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="eyebrow mb-3">{children}</p>;
}

export function StatusDot({ variant }: { variant: "bright" | "mid" | "dim" | "outline" | "ring" | "pulse" }) {
  return <span className={`dot dot-${variant}`} />;
}

export function ShadeStripe({ shade }: { shade: ShadeKey }) {
  const s = SHADES[shade];
  return (
    <span
      className="block h-full w-1 rounded-full flex-shrink-0"
      style={{ background: s.dot }}
    />
  );
}

export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const text = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center text-white/90 font-semibold flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : text}
    </div>
  );
}

export function Modal({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`glass-strong relative z-10 w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="text-lg font-semibold text-white mb-5">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm" }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-white/65 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
