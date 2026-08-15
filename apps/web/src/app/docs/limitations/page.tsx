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
          No. Values are encrypted and decrypted client-side (in your browser or the CLI) under a
          key derived from your passphrase — the server only ever stores and transmits ciphertext,
          and never holds a key capable of decrypting it. Key <em>names</em> (project, environment,
          variable names) aren&apos;t encrypted, only values. See the{" "}
          <Link href="/docs/security" className="underline underline-offset-2">Security model</Link>{" "}
          page for the full key hierarchy.
        </P>
      </QA>
      <QA q="What happens if I forget my passphrase?">
        <P>
          Use your recovery phrase (shown once, at setup) to unlock your account and set a new
          passphrase. If you&apos;ve lost <em>both</em> your passphrase and your recovery phrase,
          your data is permanently unrecoverable — not even the operator can decrypt it for you.
          There is no other reset path, by design.
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
          You can <em>cap</em> a grant per environment — e.g. Editor project-wide but Viewer-only
          on <Code>prod</Code> — from the expandable row under a grant on the project&apos;s
          &quot;Manage access&quot; page. There&apos;s no way to hide an environment from someone
          entirely while still granting the rest of the project; a cap restricts what they can{" "}
          <em>do</em> there, not whether they can see it exists.
        </P>
      </QA>
      <QA q="I think my CLI token leaked — what do I do?">
        <P>
          Go to <Code>Settings → CLI Tokens</Code> in the web app and revoke it immediately. Then
          create a new one and update wherever the old one was used (e.g. CI secrets).
        </P>
      </QA>
      <QA q="If someone loses access to a project, can they still read values they already saw?">
        <P>
          Not going forward through the app or CLI — their access is revoked immediately. But if
          they&apos;d already fetched the project&apos;s encryption key to their device before
          removal, that copy still works on its own until an admin rotates the key. From the
          project&apos;s <strong>Manage access</strong> page, the <strong>Encryption</strong>{" "}
          section re-encrypts every current value under a new key and re-wraps it only to people
          who currently have access — a banner there reminds you to do this right after a revoke.
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
          That&apos;s your call, but weigh it against the limitations on this page — especially
          that deleting an entire environment or project is still unrecoverable, and that losing
          both your passphrase and recovery phrase means permanently losing that data — before
          relying on it as your sole store for anything business-critical.
        </P>
      </QA>
      <QA q="What's actively being worked on?">
        <P>
          The three-way sync engine, version history with rollback, team/organization access
          control with per-environment role caps, and zero-knowledge end-to-end encryption
          described elsewhere on this page and the{" "}
          <Link href="/docs/security" className="underline underline-offset-2">Security model</Link>{" "}
          page have all shipped, including DEK rotation on revoke (2026-08-09). Key-name/metadata
          encryption (see the Security model page&apos;s &quot;what&apos;s not covered
          today&quot;) is the main security gap left open. This page will be updated as further
          pieces ship.
        </P>
      </QA>
    </div>
  );
}
