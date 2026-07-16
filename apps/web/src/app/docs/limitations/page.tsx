import Link from "next/link";
import { DocsHeader, H2, P, Code } from "@/components/docs-ui";

export const metadata = { title: "Limitations & FAQ" };

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="font-medium">{q}</p>
      <div className="mt-1 text-muted-foreground">{children}</div>
    </div>
  );
}

export default function LimitationsPage() {
  return (
    <div>
      <DocsHeader
        title="Limitations & FAQ"
        lede="EnvHQ is a free tool that's still actively evolving. This page lists what it deliberately doesn't do yet, and answers common questions — read alongside the Terms & Conditions."
      />

      <H2>Free tool, today</H2>
      <QA q="Is EnvHQ free?">
        <P>
          Yes, currently. We may introduce paid plans in the future as the product grows, but
          there is no cost today. See{" "}
          <Link href="/terms" className="underline underline-offset-2">Terms &amp; Conditions</Link>{" "}
          for the full free-tool disclaimer (no SLA, no warranty, liability limited to zero).
        </P>
      </QA>
      <QA q="Is there an uptime or support guarantee?">
        <P>No. The Service is offered best-effort, with no formal SLA for uptime or support response time.</P>
      </QA>

      <H2>Data safety</H2>
      <QA q="If I delete a variable, can I get it back?">
        <P>
          Yes — every change to an environment is a versioned, immutable snapshot. Open{" "}
          <Code>History</Code> on the environment (web) or run <Code>envhq history</Code> /{" "}
          <Code>envhq rollback &lt;version&gt;</Code> (CLI) to restore an earlier version,
          bringing back anything deleted or changed since.
        </P>
      </QA>
      <QA q="If I delete an entire environment or project, can I get it back?">
        <P>
          No — that&apos;s still permanent, with no undo, trash, or recovery path. Version history
          only covers changes to variables within an environment, not deleting the
          environment/project itself. If a secret matters, keep an independent backup of it (a
          password manager, a private vault, etc.) in addition to EnvHQ.
        </P>
      </QA>
      <QA q="If I push a partial or empty local file, will it wipe out my remote environment?">
        <P>
          <Code>push</Code> does a three-way sync against the last-known state, not a blind
          overwrite: it adds new keys, updates changed ones, and only deletes a remote key if you
          removed it locally <em>and</em> it hasn&apos;t changed remotely since — and it&apos;ll ask for
          confirmation before deleting anything (skippable with <Code>--yes</Code>). Run{" "}
          <Code>envhq diff</Code> first to preview exactly what a push would do. And since every
          push is a version, you can always <Code>rollback</Code> if something still goes wrong.
        </P>
      </QA>
      <QA q="Can EnvHQ's operator see my secrets?">
        <P>
          Technically, yes. Encryption is server-side (AES-256-GCM) using a key the operator
          holds — this is not zero-knowledge encryption. See the{" "}
          <Link href="/docs/security" className="underline underline-offset-2">Security model</Link>{" "}
          page for details and what&apos;s planned.
        </P>
      </QA>

      <H2>Access &amp; collaboration</H2>
      <QA q="Can I share a project with my team?">
        <P>
          Yes. Create or switch to a team organization from the sidebar switcher, invite people
          (handled by Clerk&apos;s hosted invite UI under <Code>Teams</Code>), then use{" "}
          <strong>Manage access</strong> on a project to grant an org member — or a group of
          them, from <Code>Settings → Groups</Code> — Viewer, Editor, or Admin access. Org
          admins/owners get admin access to every project in the org automatically.
        </P>
      </QA>
      <QA q="Can I give someone access to just one environment, like dev but not prod?">
        <P>
          Not yet — a role grant applies to the whole project, every environment included.
          Per-environment scoping is planned but not built yet.
        </P>
      </QA>
      <QA q="I think my CLI token leaked — what do I do?">
        <P>
          Go to <Code>Settings → CLI Tokens</Code> in the web app and revoke it immediately. Then
          create a new one and update wherever the old one was used (e.g. CI secrets).
        </P>
      </QA>

      <H2>General</H2>
      <QA q="Where is my data hosted?">
        <P>
          In a managed Postgres database (Neon); authentication is handled by Clerk. Values are
          stored encrypted, as described in the{" "}
          <Link href="/docs/security" className="underline underline-offset-2">Security model</Link>.
        </P>
      </QA>
      <QA q="Should I store production secrets in EnvHQ?">
        <P>
          That&apos;s your call, but weigh it against the limitations on this page — especially the
          lack of zero-knowledge encryption and the fact that deleting an entire environment or
          project is still unrecoverable — before relying on it as your sole store for anything
          business-critical.
        </P>
      </QA>
      <QA q="What's actively being worked on?">
        <P>
          Per-environment access scoping (e.g. Editor on <Code>dev</Code> but Viewer-only on{" "}
          <Code>prod</Code>) is next, followed by zero-knowledge (client-side) encryption further
          out. The three-way sync engine, version history with rollback, and team/organization
          access control described elsewhere on this page have already shipped. This page and the
          Security model page will be updated as each further piece ships.
        </P>
      </QA>
    </div>
  );
}
