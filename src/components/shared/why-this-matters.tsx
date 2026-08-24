// "Why this matters" (PHASE4_5_PRODUCTION_HARDENING.md — spec §7). A single
// grounded sentence explaining an intelligence item's significance, always
// generated from structured facts by the caller (stage.ts's
// explainStageChange(), a risk's description, etc.) — this component only
// renders it, never invents wording of its own.

export function WhyThisMatters({ text }: { text: string }) {
  return (
    <div className="mt-1.5 rounded-sm border border-border-subtle bg-secondary/40 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Why this matters</p>
      <p className="mt-0.5 text-xs text-foreground/90">{text}</p>
    </div>
  );
}
