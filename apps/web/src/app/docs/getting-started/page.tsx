import Link from "next/link";
import { DocsHeader, H2, P, OL, UL, Code, CodeBlock, Callout } from "@/components/docs-ui";

export const metadata = { title: "Getting started" };

export default function GettingStartedPage() {
  return (
    <div>
      <DocsHeader
        title="Getting started"
        lede="From zero to your first envhq push, in the web app and the terminal."
      />

      <H2>1. Create an account</H2>
      <P>
        Go to the <Link href="/sign-up" className="underline underline-offset-2">sign-up page</Link> and
        create an account. Authentication is handled by Clerk (email/password or supported social
        logins, depending on how the deployment is configured).
      </P>

      <H2>2. Create your first project</H2>
      <P>
        From the <Code>Dashboard</Code>, click <Code>New project</Code> and give it a name.
        A <Code>dev</Code> environment is created for you automatically — you can add more
        environments (e.g. <Code>staging</Code>, <Code>prod</Code>) at any time.
      </P>

      <H2>3. Add variables</H2>
      <P>Open an environment and either:</P>
      <UL>
        <li>add keys and values one at a time in the editor, or</li>
        <li>
          use <Code>Paste .env</Code> to bulk-import a whole file — existing keys are updated,
          new keys are added (an upsert-merge; nothing already there is removed by an import).
        </li>
      </UL>
      <P>
        Values are shown masked by default; use the reveal toggle to view one, or{" "}
        <Code>Copy all as .env</Code> to copy the whole environment back out.
      </P>

      <H2>4. Install the CLI</H2>
      <CodeBlock>{`npm install -g envhq
# or run it without installing:
npx envhq <command>`}</CodeBlock>
      <P>Requires Node.js ≥ 18. You never need to know a server URL — it's baked into the CLI build.</P>

      <H2>5. Log in from the terminal</H2>
      <CodeBlock>{`envhq login`}</CodeBlock>
      <P>
        This opens your browser, asks you to approve the request while signed in to EnvHQ, and
        hands a token back to the CLI automatically — nothing to copy-paste. The token is stored
        in your OS keychain, not as a plaintext file, and is valid for 7 days (the CLI will
        transparently prompt you to re-authenticate after that).
      </P>
      <Callout>
        For CI or headless environments, create a personal access token in{" "}
        <Code>Settings → CLI Tokens</Code> and pass it with <Code>envhq login --token &lt;token&gt;</Code>{" "}
        or set the <Code>ENVHQ_TOKEN</Code> environment variable instead.
      </Callout>

      <H2>6. Link a project folder</H2>
      <P>
        In your project&apos;s local folder, either bootstrap a brand-new project or link to one
        that already exists:
      </P>
      <CodeBlock>{`# Option A — create a new project + link this folder in one step
envhq init                    # defaults the project name to the folder name
envhq init my-api --env dev,staging

# Option B — link this folder to an existing project
envhq link                    # pick a project, map every environment to a local file`}</CodeBlock>
      <P>
        Linking writes a <Code>.envhq/</Code> config folder (added to <Code>.gitignore</Code>{" "}
        automatically) that maps each environment to a local file — by default{" "}
        <Code>dev</Code> → <Code>.env</Code>, others → <Code>.env.&lt;name&gt;</Code>.
      </P>

      <H2>7. Push and pull</H2>
      <CodeBlock>{`envhq push            # upload the linked default environment's file
envhq push staging    # upload a specific environment
envhq pull --all      # write every linked environment to its mapped file`}</CodeBlock>
      <P>
        Pushing to an environment named <Code>prod</Code> or <Code>production</Code> asks for
        confirmation unless you pass <Code>--yes</Code>.
      </P>

      <OL>
        <li>
          Read the full <Link href="/docs/cli" className="underline underline-offset-2">CLI reference</Link>{" "}
          for every command and flag.
        </li>
        <li>
          Read the <Link href="/docs/security" className="underline underline-offset-2">security model</Link>{" "}
          before storing anything sensitive — EnvHQ is a free tool with real limitations today.
        </li>
      </OL>
    </div>
  );
}
