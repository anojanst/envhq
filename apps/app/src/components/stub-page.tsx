/**
 * Placeholder content for routes not yet ported (HQ-61–64). Nav/theme
 * toggle used to live here for early end-to-end verification before the
 * real `AppShell` existed — now that `_protected.tsx` wraps every route in
 * `AppShell` (HQ-60), this is just the swappable content block.
 */
export function StubPage({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}
