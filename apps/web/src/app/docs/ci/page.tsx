import Link from "next/link";
import { DocsHeader, H2, P, UL, OL, Code, CodeBlock, Callout, Table, Th, Td } from "@/components/docs-ui";

export const metadata = { title: "CI & GitHub Actions" };

/**
 * RM-12's worked example. Static on purpose — no session read here, or the
 * page stops being prerendered (see "Public pages are static" in CLAUDE.md).
 */
export default function CiDocsPage() {
  return (
    <div>
      <DocsHeader
        title="CI & GitHub Actions"
        lede="Load an environment into a pipeline. Values are decrypted on the runner with a deploy key only you hold, and masked before they can reach a log."
      />

      <H2>How a pipeline decrypts</H2>
      <P>
        Your values are encrypted with keys EnvHQ doesn&rsquo;t have, so a pipeline needs a key of
        its own. That key is a <strong>deploy key</strong>. You issue it in the web app, and its
        private half is shown to you once and never sent to EnvHQ. A pipeline holds two secrets:
      </P>
      <UL>
        <li>
          <Code>ENVHQ_TOKEN</Code> fetches the encrypted values. On its own it can also see variable
          names, but it can&rsquo;t decrypt anything.
        </li>
        <li>
          <Code>ENVHQ_DEPLOY_KEY</Code> decrypts them. On its own it can&rsquo;t fetch anything.
        </li>
      </UL>
      <P>
        To get both, open the project, go to <strong>Deploy keys</strong> and choose{" "}
        <strong>Issue deploy key</strong>. Save both values as secrets in your CI provider.
      </P>

      <H2>GitHub Actions</H2>
      <CodeBlock>{`- uses: actions/setup-node@v5
  with: { node-version: 24 }
- uses: anojanst/envhq-action@v1
  with:
    token: \${{ secrets.ENVHQ_TOKEN }}
    key: \${{ secrets.ENVHQ_DEPLOY_KEY }}
    project: shop
    environment: staging
- run: npm test   # every variable in shop/staging is set`}</CodeBlock>

      <Table>
        <thead>
          <tr>
            <Th>Input</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td><Code>token</Code>, <Code>key</Code></Td>
            <Td>The deploy key&rsquo;s two secrets. Both are required.</Td>
          </tr>
          <tr>
            <Td><Code>project</Code>, <Code>environment</Code></Td>
            <Td>What to load. The project can be a name or an id.</Td>
          </tr>
          <tr>
            <Td><Code>format</Code></Td>
            <Td>
              <Code>env</Code> (default): environment variables for every later step.{" "}
              <Code>outputs</Code>: step outputs, read as <Code>steps.&lt;id&gt;.outputs.NAME</Code>.{" "}
              <Code>dotenv</Code>: a file at <Code>path</Code> (default <Code>.env</Code>).
            </Td>
          </tr>
          <tr>
            <Td><Code>mask</Code></Td>
            <Td>
              Default <Code>true</Code>. Turn it off only for values that aren&rsquo;t secret.
            </Td>
          </tr>
        </tbody>
      </Table>

      <H2>Worked example: build, test and deploy</H2>
      <P>
        All three jobs below read the same environment. Each job is a fresh runner, so each one
        loads the values again. The values aren&rsquo;t passed between jobs as artifacts, because an
        artifact would store them in plaintext outside EnvHQ.
      </P>
      <CodeBlock>{`name: ship
on:
  push:
    branches: [main]

env:
  ENVHQ_PROJECT: shop
  ENVHQ_ENVIRONMENT: production

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 24 }
      - uses: anojanst/envhq-action@v1
        with:
          token: \${{ secrets.ENVHQ_TOKEN }}
          key: \${{ secrets.ENVHQ_DEPLOY_KEY }}
          project: \${{ env.ENVHQ_PROJECT }}
          environment: \${{ env.ENVHQ_ENVIRONMENT }}
      - run: npm ci && npm run build

  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 24 }
      - run: npm ci
      # Scoped to this one command: nothing reaches GITHUB_ENV or the disk.
      - run: npx envhq run -- npm test
        env:
          ENVHQ_TOKEN: \${{ secrets.ENVHQ_TOKEN }}
          ENVHQ_DEPLOY_KEY: \${{ secrets.ENVHQ_DEPLOY_KEY }}

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 24 }
      - uses: anojanst/envhq-action@v1
        id: envhq
        with:
          token: \${{ secrets.ENVHQ_TOKEN }}
          key: \${{ secrets.ENVHQ_DEPLOY_KEY }}
          project: \${{ env.ENVHQ_PROJECT }}
          environment: \${{ env.ENVHQ_ENVIRONMENT }}
          format: outputs
      # Only this step gets the database URL.
      - run: npm run migrate
        env:
          DATABASE_URL: \${{ steps.envhq.outputs.DATABASE_URL }}`}</CodeBlock>

      <H2>Choosing how values reach your job</H2>
      <P>Each option exposes the values to less of the job than the one before it.</P>
      <OL>
        <li>
          <Code>format: env</Code> is the simplest. Every later step sees every value, including
          third-party actions you didn&rsquo;t write.
        </li>
        <li>
          <Code>format: outputs</Code> sets nothing by default. You pass each value to the steps
          that need it.
        </li>
        <li>
          <Code>envhq run -- &lt;command&gt;</Code> gives the values to one process only, and
          writes nothing to disk. This is the safest option.
        </li>
      </OL>
      <P>
        <Code>format: dotenv</Code> writes a file that stays on the runner until the job ends.
        Anything that caches or uploads that directory can pick it up. Use it only for tools that
        must read a file.
      </P>

      <H2>Masking</H2>
      <P>
        Before any value is written anywhere, it is registered with GitHub&rsquo;s log masker, so a
        stray <Code>echo $SECRET</Code> prints <Code>***</Code>. Masking covers the value in full,
        each line of a multi-line value, and the value&rsquo;s base64 and JSON-escaped forms.
      </P>
      <Callout variant="warning">
        GitHub masks literal strings only. A value that is transformed any other way (URL-encoded,
        sliced, hashed for a cache key) prints as-is. Masking is a safety net, so still avoid
        printing secrets, and don&rsquo;t dump the environment with <Code>env</Code> or{" "}
        <Code>printenv</Code> in debug steps.
      </Callout>

      <H2>When it fails</H2>
      <P>
        If the action can&rsquo;t load the environment, the step fails and nothing is exported. Later
        steps never run with only some of the variables set. The log explains why:
      </P>
      <UL>
        <li>
          <strong>Revoked or unknown key.</strong> Issue a new deploy key and update{" "}
          <em>both</em> secrets. Revoking a key also revokes its token.
        </li>
        <li>
          <strong>Key issued for a different environment.</strong> A deploy key can be limited to
          one environment. Point the job at that environment, or issue a key for this one.
        </li>
        <li>
          <strong>The project key rotated while the job was running.</strong> Re-run the job.
        </li>
      </UL>
      <P>
        A deploy key that is limited to one environment is enforced by EnvHQ&rsquo;s server, not by
        encryption: the key itself can decrypt every environment in the project. See{" "}
        <Link href="/docs/security" className="underline underline-offset-2">Security model</Link>.
      </P>

      <H2>Other CI providers</H2>
      <P>
        The action wraps the CLI. Anywhere that can run <Code>npx</Code> can do the same thing. Set{" "}
        <Code>ENVHQ_TOKEN</Code> and <Code>ENVHQ_DEPLOY_KEY</Code> as secret variables, then run:
      </P>
      <CodeBlock>{`npx envhq@0.10.0 run -p shop -e staging -- ./deploy.sh`}</CodeBlock>
      <P>
        To use a server other than envhq.dev, set <Code>ENVHQ_URL</Code>. For every command and
        flag, see the <Link href="/docs/cli" className="underline underline-offset-2">CLI reference</Link>.
      </P>
    </div>
  );
}
