export default function Loading() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-8 py-16">
      <div className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
