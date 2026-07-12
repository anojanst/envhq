import { cn } from "@/lib/utils";
import { AlertTriangle, Info } from "lucide-react";

export function DocsHeader({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {lede && <p className="mt-2 max-w-2xl text-muted-foreground">{lede}</p>}
    </div>
  );
}

export function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 mb-3 text-xl font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 leading-relaxed text-muted-foreground">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mb-3 list-disc space-y-1.5 pl-5 text-muted-foreground">{children}</ul>;
}

export function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mb-3 list-decimal space-y-2 pl-5 text-muted-foreground">{children}</ol>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mb-4 overflow-x-auto rounded-lg border bg-card p-4 font-mono text-sm">
      <code>{children}</code>
    </pre>
  );
}

export function Callout({
  variant = "info",
  children,
}: {
  variant?: "info" | "warning";
  children: React.ReactNode;
}) {
  const Icon = variant === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "mb-4 flex gap-3 rounded-lg border p-4 text-sm",
        variant === "warning" ? "border-brand/30 bg-brand/5" : "border-border bg-muted/40",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="text-foreground/90">{children}</div>
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b bg-muted/50 px-3 py-2 font-medium text-foreground">{children}</th>
  );
}

export function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b px-3 py-2 align-top text-muted-foreground last:border-b-0">{children}</td>;
}
