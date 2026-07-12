import { DocsHeader, H2, P, UL, Code, Callout } from "@/components/docs-ui";

export const metadata = { title: "Using the web app" };

export default function WebAppDocsPage() {
  return (
    <div>
      <DocsHeader
        title="Using the web app"
        lede="Everything you can do from the browser, without touching the CLI."
      />

      <H2>Dashboard</H2>
      <P>Lists every project you own. From here you can:</P>
      <UL>
        <li>create a new project (a <Code>dev</Code> environment is added automatically);</li>
        <li>open a project to manage its environments;</li>
        <li>rename or delete a project — deleting a project deletes all of its environments and variables.</li>
      </UL>

      <H2>Environments</H2>
      <P>
        Inside a project you&apos;ll see its environments (e.g. <Code>dev</Code>,{" "}
        <Code>staging</Code>, <Code>prod</Code>). Create as many as you need — names must be
        unique within a project. Open an environment to manage its variables.
      </P>

      <H2>The variable editor</H2>
      <UL>
        <li><strong>Masked by default</strong> — values are hidden until you click the reveal toggle for a row.</li>
        <li><strong>Per-row copy</strong> — copy a single value without revealing it on screen for long.</li>
        <li><strong>Copy all as .env</strong> — copies the whole environment, formatted as a <Code>.env</Code> file, to your clipboard.</li>
        <li><strong>Paste .env</strong> — paste a whole file's contents to bulk add/update keys in one go (an upsert-merge: keys not present in the pasted text are left untouched).</li>
        <li><strong>Add / edit / delete</strong> a single key at a time.</li>
        <li><strong>Multiline values</strong> — fields auto-grow and support multi-line values (e.g. PEM-formatted keys); revealed values wrap instead of overflowing.</li>
      </UL>
      <Callout variant="warning">
        Deleting a variable, environment, or project currently has no undo, trash, or version
        history — see{" "}
        <a href="/docs/limitations" className="underline underline-offset-2">Limitations &amp; FAQ</a>.
      </Callout>

      <H2>CLI tokens (Settings → CLI Tokens)</H2>
      <P>
        Personal access tokens authenticate the <Code>envhq</Code> CLI (mainly for CI/headless
        use — interactive <Code>envhq login</Code> uses a browser flow instead and doesn&apos;t
        need one of these). From this page you can:
      </P>
      <UL>
        <li>create a token — the plaintext value is shown <strong>once</strong>, at creation time only; copy it immediately;</li>
        <li>see each token's name and last-used time (never the token itself again);</li>
        <li>revoke a token instantly if it's no longer needed or may have leaked.</li>
      </UL>

      <H2>Theme</H2>
      <P>
        Toggle light/dark mode from the header. The app defaults to light mode; your choice is
        remembered on the device.
      </P>
    </div>
  );
}
