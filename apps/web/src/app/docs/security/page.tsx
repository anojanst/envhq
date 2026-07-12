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
        EnvHQ is a free, personal-use tool under active development. Read this whole page before
        storing anything you cannot afford to lose or have exposed — also see{" "}
        <Link href="/terms" className="underline underline-offset-2">Terms &amp; Conditions</Link>{" "}
        and <Link href="/docs/limitations" className="underline underline-offset-2">Limitations &amp; FAQ</Link>.
      </Callout>

      <H2>Encryption at rest</H2>
      <P>
        Every variable value is encrypted with <strong>AES-256-GCM</strong> before it's written to
        the database, using a random 96-bit initialization vector and a GCM authentication tag
        generated per value. The database only ever stores ciphertext — never plaintext.
      </P>
      <P>
        Encryption and decryption happen entirely on the server, using a single master key
        (<Code>ENV_ENCRYPTION_KEY</Code>) that the EnvHQ operator holds. This is a deliberate
        current trade-off: it keeps the web UI simple (values can be revealed and edited straight
        in the browser) and makes key recovery possible, but it also means:
      </P>
      <UL>
        <li>
          <strong>This is not zero-knowledge / end-to-end encryption.</strong> The operator is
          technically capable of decrypting any stored value.
        </li>
        <li>
          If the master key were ever compromised, every stored value would be at risk — there is
          no per-user or per-project key isolation today.
        </li>
      </UL>
      <P>
        Zero-knowledge encryption (client-side encryption with a key the server never sees) is on
        the roadmap but <strong>not implemented today</strong>.
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
        Every project, environment, and variable is scoped to the account that owns it, and every
        API request is checked against the acting user (from either the Clerk session or a bearer
        token). A request for data you don&apos;t own returns &quot;not found&quot;, not
        &quot;forbidden&quot; — it doesn&apos;t reveal whether the resource exists.
      </P>
      <P>
        EnvHQ is currently <strong>personal-only</strong>: there is no concept of a team,
        organization, or shared project yet, and therefore no role-based permissions (viewer /
        editor / admin) either. Team access control is planned for a future release.
      </P>

      <H2>What's not covered today</H2>
      <UL>
        <li>No independent third-party security audit or certification (e.g. SOC 2, ISO 27001).</li>
        <li>No client-side / zero-knowledge encryption — see above.</li>
        <li>No team or role-based sharing — see above.</li>
        <li>
          No version history, soft-delete, or backups exposed to users — a deleted or overwritten
          value is not currently recoverable through the product. See{" "}
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
