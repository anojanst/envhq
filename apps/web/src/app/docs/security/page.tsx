import Link from "next/link";
import { DocsHeader, H2, P, UL, Code, Callout } from "@/components/docs-ui";

export const metadata = { title: "Security model" };

export default function SecurityDocsPage() {
  return (
    <div>
      <DocsHeader
        title="Security model"
        lede="A plain-language explanation of how EnvHQ protects your data today, and what it doesn't do yet. This page is a technical companion to the security sections of the Terms & Conditions."
      />

      <Callout variant="warning">
        EnvHQ is a free tool under active development. Read this whole page before
        storing anything you cannot afford to lose or have exposed — also see{" "}
        <Link href="/terms" className="underline underline-offset-2">Terms &amp; Conditions</Link>{" "}
        and <Link href="/docs/limitations" className="underline underline-offset-2">Limitations &amp; FAQ</Link>.
      </Callout>

      <H2>Encryption at rest — zero-knowledge, end-to-end</H2>
      <P>
        Every variable value is encrypted and decrypted <strong>client-side</strong> — in your
        browser, or in the <Code>envhq</Code> CLI on your machine — using{" "}
        <strong>XChaCha20-Poly1305</strong>. The server only ever stores and transmits ciphertext;
        it never sees a plaintext value, and never holds a key capable of decrypting one.
      </P>
      <P>The key hierarchy, all derived and held client-side:</P>
      <UL>
        <li>
          Your <strong>passphrase</strong> runs through <strong>Argon2id</strong> to derive a{" "}
          <strong>Master Key</strong>, which unwraps your personal <strong>User Keypair</strong>{" "}
          (X25519, generated once at setup).
        </li>
        <li>
          Each <strong>project</strong> has its own randomly generated{" "}
          <strong>Data Encryption Key (DEK)</strong>. The DEK is sealed to the public key of every
          member with access — anyone who can decrypt one variable in a project can decrypt all
          of them, but a DEK sealed to you is useless to anyone without your private key.
        </li>
        <li>
          A separately generated <strong>Recovery Key</strong> (shown once, as a printable
          recovery phrase) wraps your User Keypair a second, independent way — the only other way
          in if you forget your passphrase. See the{" "}
          <Link href="/docs/limitations" className="underline underline-offset-2">Limitations &amp; FAQ</Link>{" "}
          page for what happens if you lose both.
        </li>
      </UL>
      <P>
        This means EnvHQ&apos;s operator <strong>cannot decrypt your values</strong> — not by
        choice, but because we never hold a usable key. A database leak alone exposes only
        ciphertext.
      </P>

      <H2>Encryption in transit</H2>
      <P>The web app and CLI both talk to the server exclusively over HTTPS.</P>

      <H2>Authentication</H2>
      <UL>
        <li>
          <strong>Web sessions</strong> are handled by Clerk (identity, session cookies, login
          UI).
        </li>
        <li>
          <strong>CLI sessions</strong> use a browser-based login: the CLI opens a local loopback
          listener and a PKCE code challenge, you approve the request while signed in to EnvHQ in
          your browser, and a one-time code is exchanged for a token — the token itself never
          appears in a URL. Interactive logins are stored in your OS keychain, never as a
          plaintext file on disk.
        </li>
        <li>
          <strong>CI/headless use</strong> uses a personal access token created from{" "}
          <Code>Settings → CLI Tokens</Code>. The plaintext value is shown once, at creation, and
          only its SHA-256 hash is stored server-side — a database leak alone cannot be used to
          reconstruct a working token.
        </li>
        <li>
          Interactive tokens expire after <strong>7 days</strong>; the CLI detects expiry and
          re-runs the browser login automatically. Personal access tokens can be scoped to a
          single project and to read-only access, and are revocable at any time from the web app.
        </li>
      </UL>

      <H2>Authorization / access control</H2>
      <P>
        Every project belongs to an organization (every account gets a personal one
        automatically; you can also create or be invited to team organizations). Every API
        request is checked against the acting user&apos;s resolved role in that project&apos;s
        org — from either the Clerk session or a bearer token. A request for a project you have
        no access to returns &quot;not found&quot;, not &quot;forbidden&quot; — it doesn&apos;t
        reveal whether the resource exists, and a Viewer probing something they can see but
        can&apos;t edit doesn&apos;t learn more than a stranger would.
      </P>
      <P>
        Within an org, access to a specific project is <strong>role-based</strong>: an org
        admin/owner automatically has admin access to every project in the org; anyone else needs
        an explicit grant (to them directly, or to a group they&apos;re in) of{" "}
        <strong>Viewer</strong>, <strong>Editor</strong>, or <strong>Admin</strong>. A grant can
        also be capped per environment — e.g. Editor on <Code>dev</Code> but Viewer-only on{" "}
        <Code>prod</Code> — from the same &quot;Manage access&quot; dialog. Org invitations,
        membership, and roles are managed entirely by Clerk&apos;s own hosted UI.
      </P>
      <P>
        Being <em>authorized</em> for a project and being able to <em>decrypt</em> it are separate
        things: a grant (or org-admin status) controls access through the API, but decrypting a
        value additionally requires holding a copy of that project&apos;s DEK, sealed to your
        public key. Granting access wraps a copy for the new member right away; if that doesn&apos;t
        land immediately (e.g. they hadn&apos;t finished their own key setup yet), any client that
        already holds the DEK delivers it the next time they open the project — usually within
        seconds, never more than the next visit.
      </P>
      <P>
        Revoking someone&apos;s access removes their ability to decrypt anything{" "}
        <em>going forward</em>, but the project&apos;s key isn&apos;t replaced automatically — a
        former member could still hold a working copy of it from before you revoked them. Any
        project admin can close that gap from the project&apos;s &quot;Manage access&quot; page:
        its <strong>Encryption</strong> section re-encrypts every current value under a brand-new
        key and re-wraps it only to people who currently have access, so a lingering old copy no
        longer opens anything current. A banner appears there whenever a revoke has left this
        pending. Version history from before a rotation stays under its original key and can no
        longer be rolled back to, by design, rather than being silently re-encrypted.
      </P>

      <H2>Version history</H2>
      <P>
        Every commit to an environment — a web edit, a CLI <Code>push</Code>, or a rollback —
        is stored as a full, immutable, append-only version. You can restore any earlier version
        at any time, which recovers a deleted or overwritten variable. This does not extend to
        deleting an entire environment or project, which remains permanent with no recovery path.
      </P>

      <H2>What&apos;s not covered today</H2>
      <UL>
        <li>
          <strong>No key-name / metadata encryption.</strong> Only variable values are end-to-end
          encrypted — project, environment, and variable-key names are visible to the operator.
        </li>
        <li>
          <strong>No passphrase-recovery beyond the Recovery Kit.</strong> Losing both your
          passphrase and your recovery phrase means permanently losing access to that data — there
          is no operator-side reset that preserves it.
        </li>
        <li>No independent third-party security audit or certification (e.g. SOC 2, ISO 27001).</li>
        <li>
          No undo for deleting an entire environment or project (individual variable changes are
          recoverable via version history — see above). See{" "}
          <Link href="/docs/limitations" className="underline underline-offset-2">Limitations &amp; FAQ</Link>.
        </li>
        <li>No published rate-limiting or formal abuse-protection policy.</li>
        <li>No formal SLA for uptime or support response time.</li>
      </UL>

      <H2>Reporting a vulnerability</H2>
      <P>
        If you believe you&apos;ve found a security issue, please report it responsibly to{" "}
        <a href="mailto:security@envhq.dev" className="underline underline-offset-2">
          security@envhq.dev
        </a>{" "}
        rather than testing it against other users&apos; data. We&apos;ll do our best to
        acknowledge and address reports promptly, though — consistent with the rest of this
        page — we do not currently offer a formal SLA around response time.
      </P>
    </div>
  );
}
