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
      <QA q="If I delete a variable, environment, or project, can I get it back?">
        <P>
          No — not today. Deletion is currently permanent: there is no user-facing undo, trash,
          or version history. If a secret matters, keep an independent backup of it (a password
          manager, a private vault, etc.) in addition to EnvHQ.
        </P>
      </QA>
      <QA q="If I push a partial or empty local file, will it wipe out my remote environment?">
        <P>
          <Code>push</Code> is an upsert-merge: it adds and updates keys from your local file but
          never deletes a remote key just because it's missing locally. A three-way sync with
          deletion tracking, previews, and safety confirmations is planned but not built yet.
        </P>
      </QA>
      <QA q="Can EnvHQ's operator see my secrets?">
        <P>
          Technically, yes. Encryption is server-side (AES-256-GCM) using a key the operator
          holds — this is not zero-knowledge encryption. See the{" "}
          <Link href="/docs/security" className="underline underline-offset-2">Security model</Link>{" "}
          page for details and what's planned.
        </P>
      </QA>

      <H2>Access &amp; collaboration</H2>
      <QA q="Can I share a project with my team?">
        <P>
          Not yet. EnvHQ v1 is personal-only — every project belongs to a single account, with no
          teams, organizations, or role-based permissions. The only way to give someone else
          access today is to share your login or a CLI token, which gives them full access within
          that token&apos;s scope — not recommended. Team access is on the roadmap.
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
          That's your call, but weigh it against the limitations on this page — especially the
          lack of versioning/backups and the personal-only access model — before relying on it as
          your sole store for anything business-critical.
        </P>
      </QA>
      <QA q="What's actively being worked on?">
        <P>
          Roughly in order: a proper three-way sync engine with safe deletion and previews,
          version history with rollback, team/organization access control, and — further out —
          zero-knowledge (client-side) encryption. This page and the Security model page will be
          updated as each ships.
        </P>
      </QA>
    </div>
  );
}
