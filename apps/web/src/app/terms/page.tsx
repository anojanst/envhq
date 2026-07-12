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

const LAST_UPDATED = "July 12, 2026";

export default function TermsPage() {
  return (
    <main className="flex flex-1 flex-col">
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
              pulled from your terminal with the <code>envhq</code> CLI. As of today, EnvHQ is{" "}
              <strong>personal-use only</strong> — every project, environment, and variable is
              scoped to a single signed-in account. There is no team, organization, or
              shared-access functionality yet.
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
                <strong>Encryption at rest:</strong> every variable value is encrypted with
                AES-256-GCM before being written to the database, using a unique random
                initialization vector and authentication tag per value. The database never holds
                plaintext values.
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
                <strong>Ownership-scoped access:</strong> every record is tied to your account;
                the API enforces that you can only read or modify data you own.
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
                <strong>This is not end-to-end / zero-knowledge encryption.</strong> Encryption
                and decryption happen on our servers using a single master encryption key that we
                hold. This means EnvHQ&apos;s operator is technically capable of decrypting any
                value stored in the Service. We do not use your stored values for any purpose
                other than operating the Service, but you should not treat EnvHQ as a vault the
                operator itself cannot access. Zero-knowledge encryption is on our roadmap but is{" "}
                <strong>not implemented today</strong>.
              </li>
              <li>
                <strong>No independent security audit or certification.</strong> The Service has
                not undergone a third-party security audit and does not currently hold
                certifications such as SOC 2 or ISO 27001.
              </li>
              <li>
                <strong>No versioning, backups, or guaranteed recovery.</strong> Deleting or
                overwriting a variable, environment, or project is, as of today, effectively
                permanent — there is no user-facing history, snapshot, or &quot;undo&quot;. If it
                matters, keep a copy of it somewhere else.
              </li>
              <li>
                <strong>Personal-only access model.</strong> There is no team or role-based access
                control yet, so there is also no built-in way to safely share a project with
                collaborators today — sharing your login or a CLI token with someone else gives
                them full access within that token&apos;s scope.
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
              We may update these Terms as the Service evolves, particularly as security features
              (versioning, team access, zero-knowledge encryption) are built out. We will update
              the &quot;Last updated&quot; date above when we do. Continued use of the Service
              after a change constitutes acceptance of the revised Terms.
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
