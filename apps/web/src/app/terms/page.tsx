import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Terms & Conditions for EnvHQ, including the current security measures in place and the limitations of the free tool.",
};

const LAST_UPDATED = "July 17, 2026";

export default function TermsPage() {
  return (
    <main className="public-dark flex flex-1 flex-col bg-background text-foreground">
      <PublicHeader />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Terms &amp; Conditions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="mt-6 flex gap-3 rounded-lg border border-brand/30 bg-brand/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand" />
          <p>
            EnvHQ is currently offered as a <strong>free tool</strong>. Sections 5 and 6 below
            describe, in plain language, exactly what security measures are in place today and
            what they don&apos;t cover. Please read them before storing anything sensitive.
          </p>
        </div>

        <div className="prose-terms mt-8 space-y-8 text-sm leading-relaxed text-foreground">
          <Section n="1" title="Acceptance of these terms">
            <p>
              By creating an account, accessing the EnvHQ web application, or using the{" "}
              <code>envhq</code> command-line tool (together, the &quot;Service&quot;), you agree
              to be bound by these Terms &amp; Conditions (&quot;Terms&quot;). If you do not
              agree, do not use the Service.
            </p>
          </Section>

          <Section n="2" title="What the Service is">
            <p>
              EnvHQ lets you store, organize, and sync environment variables. Values are grouped
              by project and environment, can be edited in the web app, and can be pushed to or
              pulled from your terminal with the <code>envhq</code> CLI. Every project belongs to
              an organization — every account gets a personal one automatically, and you can also
              create or be invited to team organizations. Within an org, project access is
              role-based (Viewer, Editor, Admin), grantable to individual members or groups, and
              can be capped per environment (e.g. Editor on <code>dev</code> but Viewer-only on{" "}
              <code>prod</code>). Org membership and invites are handled by our identity
              provider&apos;s (Clerk) own hosted UI.
            </p>
          </Section>

          <Section n="3" title="Free tool, no cost, no promises of continuity">
            <p>
              The Service is currently provided <strong>free of charge</strong>. We may introduce
              paid plans in the future, change or remove features, impose usage limits, or
              discontinue the Service at any time, with or without notice. Being free means we
              make no commitment to uptime, response time, data durability, or long-term
              availability beyond what is stated in this document.
            </p>
          </Section>

          <Section n="4" title="Accounts and your responsibilities">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Accounts are authenticated through our identity provider (Clerk). You are
                responsible for keeping your login credentials and any recovery methods secure.
              </li>
              <li>
                CLI access uses personal access tokens generated from{" "}
                <strong>Settings → CLI Tokens</strong>. A token is shown to you only once, in
                plaintext, at creation time — we store only a one-way hash of it. Anyone who
                obtains a valid token can act as you within its scope, so treat it like a
                password: don&apos;t commit it, paste it into chat tools, or share it. Revoke a
                token immediately if you suspect it has leaked.
              </li>
              <li>
                You are responsible for the content of the environment variables you store. Don&apos;t
                use the Service to store unlawful content, or credentials/data you do not have the
                right to store.
              </li>
              <li>
                Because of the data-loss limitations described in Section 6, you are responsible
                for keeping your own independent backup of any secret you cannot afford to lose.
              </li>
            </ul>
          </Section>

          <Section n="5" title="Security measures currently in place">
            <p>We take reasonable, currently-implemented measures to protect your data:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Zero-knowledge, end-to-end encryption:</strong> every variable value is
                encrypted and decrypted <strong>in your browser or the CLI on your machine</strong>{" "}
                — never on our servers. Your passphrase derives a key that unlocks your personal
                keypair, which in turn unwraps a per-project encryption key; values are encrypted
                with that key using XChaCha20-Poly1305 before they&apos;re ever sent to us. We
                only ever store and transmit ciphertext — EnvHQ&apos;s operator cannot decrypt
                your values, with or without database access.
              </li>
              <li>
                <strong>Mandatory Recovery Kit:</strong> alongside your passphrase, we generate a
                one-time recovery phrase as an independent way to unlock your key if you forget
                your passphrase. See Section 6 for what happens if you lose both.
              </li>
              <li>
                <strong>Encryption in transit:</strong> the web app and CLI communicate with our
                servers over HTTPS.
              </li>
              <li>
                <strong>Hashed CLI tokens:</strong> personal access tokens are stored as SHA-256
                hashes, never in plaintext; a leaked database cannot be used to recover a working
                token.
              </li>
              <li>
                <strong>Scoped, expiring tokens:</strong> CLI logins use a short-lived,
                PKCE-verified browser authorization flow producing tokens that expire after 7
                days; tokens can also be scoped to a single project and to read-only access.
              </li>
              <li>
                <strong>Role-based, ownership-scoped access:</strong> every project belongs to an
                org, and the API enforces your resolved role (Viewer, Editor, Admin) on every
                request — you can only read or modify data you have a role on.
              </li>
              <li>
                <strong>Versioned history:</strong> every change to an environment is stored as a
                full, immutable version you can review or roll back to at any time.
              </li>
            </ul>
          </Section>

          <Section n="6" title="Important security limitations of the free tool">
            <p>
              This section exists so you can make an informed decision about what to store in
              EnvHQ. By using the Service you acknowledge and accept the following:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>
                  Losing both your passphrase and your recovery phrase means permanently losing
                  access to your data.
                </strong>{" "}
                Because decryption happens client-side under a key only you hold, there is no
                &quot;forgot password&quot; reset that preserves your data — the operator cannot
                recover it for you, by design. Store your recovery phrase somewhere safe and
                independent of your passphrase (e.g. a password manager or a printed copy in a
                safe place).
              </li>
              <li>
                <strong>Key names are not encrypted.</strong> Only variable <em>values</em> are
                end-to-end encrypted — environment, project, and variable-key names are visible to
                the operator, since the sync/diff logic that powers <code>push</code>/
                <code>pull</code> currently operates on names server-side.
              </li>
              <li>
                <strong>Revoking access doesn&apos;t retroactively revoke what was already seen.</strong>{" "}
                Removing someone&apos;s access to a project stops them from decrypting anything{" "}
                <em>going forward</em>, but we do not rotate the underlying encryption key on
                revoke — a former collaborator who already fetched values before being removed
                could still have a local copy of what they saw.
              </li>
              <li>
                <strong>No independent security audit or certification.</strong> The Service has
                not undergone a third-party security audit and does not currently hold
                certifications such as SOC 2 or ISO 27001.
              </li>
              <li>
                <strong>No undo for deleting an entire environment or project.</strong>{" "}
                Variable-level changes are versioned and recoverable (see Section 5), but deleting
                an environment or project outright is still permanent — there is no trash or
                &quot;undo&quot; for that. If it matters, keep a copy of it somewhere else.
              </li>
              <li>
                <strong>No formal SLA.</strong> We do not guarantee uptime, a support response
                time, or that any given feature will keep working without change.
              </li>
              <li>
                <strong>Software in active development.</strong> Data model, APIs, and CLI
                behavior may change as the Service evolves; we&apos;ll try to avoid breaking
                changes but cannot promise none will occur.
              </li>
            </ul>
            <p>
              For a more detailed, plain-language explanation of how encryption and access control
              work today, see the{" "}
              <Link href="/docs/security" className="underline underline-offset-2">
                Security documentation
              </Link>
              .
            </p>
          </Section>

          <Section n="7" title="No warranty">
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot;, without
              warranties of any kind, express or implied, including but not limited to
              merchantability, fitness for a particular purpose, non-infringement, or that the
              Service will be uninterrupted, secure, or error-free.
            </p>
          </Section>

          <Section n="8" title="Limitation of liability">
            <p>
              To the fullest extent permitted by law, the operator of EnvHQ will not be liable for
              any indirect, incidental, special, consequential, or punitive damages, or any loss
              of data, secrets, or revenue, arising from your use of (or inability to use) the
              Service — including, without limitation, loss caused by the absence of versioning or
              backups described in Section 6. Because the Service is provided free of charge, our
              total aggregate liability for any claim relating to the Service is limited to zero.
            </p>
          </Section>

          <Section n="9" title="Data retention and deletion">
            <p>
              Deleting a project deletes its environments and variables; deleting an environment
              deletes its variables. These actions cascade immediately and, as described in
              Section 6, are not currently recoverable by us on your behalf. If you close your
              account, we will delete your data within a reasonable period, except where retention
              is required by law.
            </p>
          </Section>

          <Section n="10" title="Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>attempt to bypass, probe, or attack the Service&apos;s authentication or access controls other than through an authorized responsible-disclosure process;</li>
              <li>use the Service to store or transmit unlawful content, or credentials you are not authorized to hold;</li>
              <li>abuse or overload shared infrastructure (e.g. automated scraping, excessive API calls) in a way that degrades the Service for others;</li>
              <li>resell, sublicense, or provide the Service to third parties as your own product.</li>
            </ul>
          </Section>

          <Section n="11" title="Termination">
            <p>
              You may stop using the Service and delete your account at any time. We may suspend
              or terminate access to the Service, for any account, at our discretion — including
              for violation of these Terms, suspected abuse, or if we discontinue the free tier.
            </p>
          </Section>

          <Section n="12" title="Changes to these terms">
            <p>
              We may update these Terms as the Service evolves. We will update the &quot;Last
              updated&quot; date above when we do. Continued use of the Service after a change
              constitutes acceptance of the revised Terms.
            </p>
          </Section>

          <Section n="13" title="Contact">
            <p>
              Questions about these Terms, or a security concern you&apos;d like to report
              responsibly, can be sent to{" "}
              <a href="mailto:security@envhq.dev" className="underline underline-offset-2">
                security@envhq.dev
              </a>
              .
            </p>
          </Section>
        </div>
      </div>

      <PublicFooter />
    </main>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">
        {n}. {title}
      </h2>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
