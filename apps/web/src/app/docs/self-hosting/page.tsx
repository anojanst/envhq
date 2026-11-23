import Link from "next/link";
import { Callout, Code, CodeBlock, DocsHeader, H2, OL, P, Table, Td, Th, UL } from "@/components/docs-ui";

export const metadata = { title: "Self-hosting" };

export default function SelfHostingPage() {
  return (
    <div>
      <DocsHeader
        title="Self-hosting"
        lede="Run EnvHQ inside your own network: one container, a Postgres database, and your own sign-in provider. The CLI and the GitHub Action work against it unchanged."
      />

      <Callout>
        A self-hosted EnvHQ holds the same thing envhq.dev does: ciphertext. Values are encrypted in
        the browser and the CLI with keys only your people hold, so the server — and its database
        backups — can&rsquo;t read them. See the{" "}
        <Link href="/docs/security" className="underline underline-offset-2">security model</Link>.
      </Callout>

      <H2>What you need</H2>
      <UL>
        <li>A host that runs containers (Docker, Podman, Kubernetes).</li>
        <li>PostgreSQL 15 or newer. The included compose file runs one for you.</li>
        <li>
          An <strong>OpenID Connect</strong> provider: Microsoft Entra ID, Okta, Google Workspace,
          Keycloak, Authentik, or any other. EnvHQ only asks it who someone is.
        </li>
        <li>A TLS-terminating reverse proxy in front of the app (Caddy, nginx, a load balancer).</li>
      </UL>

      <H2>1. Register EnvHQ with your sign-in provider</H2>
      <P>Create a web application (sometimes called a confidential client) with:</P>
      <Table>
        <thead>
          <tr>
            <Th>Setting</Th>
            <Th>Value</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>Redirect URI</Td>
            <Td>
              <Code>https://envhq.example.com/auth/callback</Code> — your URL, exactly
            </Td>
          </tr>
          <tr>
            <Td>Grant type</Td>
            <Td>Authorization code, with PKCE</Td>
          </tr>
          <tr>
            <Td>Scopes</Td>
            <Td>
              <Code>openid email profile</Code>
            </Td>
          </tr>
          <tr>
            <Td>Post-logout redirect (optional)</Td>
            <Td>
              <Code>https://envhq.example.com/</Code>
            </Td>
          </tr>
        </tbody>
      </Table>
      <P>
        Note the issuer URL, client ID and client secret. With Entra ID the issuer is{" "}
        <Code>https://login.microsoftonline.com/&lt;tenant-id&gt;/v2.0</Code>; with Google it is{" "}
        <Code>https://accounts.google.com</Code>; with Okta and Keycloak it is shown on the app or
        realm page.
      </P>

      <H2>2. Configure and start</H2>
      <P>From a checkout of the EnvHQ repository:</P>
      <CodeBlock>{`cp deploy/envhq.env.example deploy/envhq.env     # fill it in
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > deploy/.env
docker compose -f deploy/docker-compose.yml up -d`}</CodeBlock>
      <Table>
        <thead>
          <tr>
            <Th>Setting</Th>
            <Th>What it is</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>
              <Code>ENVHQ_PUBLIC_URL</Code>
            </Td>
            <Td>The https URL people use. The redirect URI is built from it.</Td>
          </tr>
          <tr>
            <Td>
              <Code>OIDC_ISSUER</Code>, <Code>OIDC_CLIENT_ID</Code>, <Code>OIDC_CLIENT_SECRET</Code>
            </Td>
            <Td>From step 1. Leave the secret empty for a public (PKCE-only) client.</Td>
          </tr>
          <tr>
            <Td>
              <Code>OIDC_ALLOWED_EMAIL_DOMAINS</Code>
            </Td>
            <Td>
              Comma-separated. Only verified emails in these domains can sign in. Recommended — your
              provider may admit guests or personal accounts.
            </Td>
          </tr>
          <tr>
            <Td>
              <Code>SESSION_SECRET</Code>
            </Td>
            <Td>
              At least 32 random characters (<Code>openssl rand -base64 48</Code>). Encrypts session
              cookies; changing it signs everyone out.
            </Td>
          </tr>
          <tr>
            <Td>
              <Code>DATABASE_URL</Code>
            </Td>
            <Td>Set by the compose file. Point it at your own Postgres if you have one.</Td>
          </tr>
          <tr>
            <Td>
              <Code>ALERT_WEBHOOK_URL</Code>
            </Td>
            <Td>Optional. A Slack-compatible webhook that hears about new server errors.</Td>
          </tr>
        </tbody>
      </Table>
      <P>
        The container applies database migrations on start and then listens on port 3000. Its health
        check is <Code>GET /api/health</Code>.
      </P>

      <H2>3. Sign in and invite your team</H2>
      <OL>
        <li>Open your URL and choose Continue. The first sign-in creates your account.</li>
        <li>
          Under <strong>Teams</strong>, create a team and use <strong>Create invite link</strong>.
          Links are single-use and expire after 7 days.
        </li>
        <li>
          Each person sets up their encryption key under <strong>Settings → Security</strong> the first
          time, as on envhq.dev.
        </li>
      </OL>
      <P>
        Teams and roles live in EnvHQ&rsquo;s database, not in your provider. Removing someone from
        your provider stops them signing in; remove them from the team in EnvHQ too, which also revokes
        their project grants and marks those projects for key rotation.
      </P>

      <H2>Pointing the CLI and CI at it</H2>
      <CodeBlock>{`envhq login --url https://envhq.example.com`}</CodeBlock>
      <P>
        The CLI remembers the URL. For scripts and CI, set <Code>ENVHQ_URL</Code> instead. The GitHub
        Action reads <Code>ENVHQ_URL</Code> from the job&rsquo;s environment; the runner must be able to
        reach your server, which for a private network means a{" "}
        <a
          href="https://docs.github.com/actions/hosting-your-own-runners"
          className="underline underline-offset-2"
        >
          self-hosted runner
        </a>
        . See <Link href="/docs/ci" className="underline underline-offset-2">CI &amp; GitHub Actions</Link>.
      </P>

      <H2>Upgrades and backups</H2>
      <UL>
        <li>
          <strong>Upgrade</strong> by running a newer image: <Code>docker compose pull &amp;&amp; docker
          compose up -d</Code>. Migrations are forward-only and run on start; take a backup first.
        </li>
        <li>
          <strong>Back up</strong> the Postgres database (<Code>pg_dump</Code>, or your platform&rsquo;s
          snapshots). It contains ciphertext, variable names and account metadata — no plaintext
          values.
        </li>
        <li>
          <strong>Keys are your people&rsquo;s.</strong> If every member of a project loses their
          passphrase and recovery key, its values can&rsquo;t be recovered by anyone — on envhq.dev or
          on your own server.
        </li>
      </UL>

      <H2>Licence</H2>
      <P>
        The server is source-available under the Elastic License 2.0, which permits running it for your
        own organization. The CLI and the cryptography packages are MIT.
      </P>
    </div>
  );
}
