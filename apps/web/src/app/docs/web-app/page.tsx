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
      <P>
        Lists every project you can access across every organization you belong to (see{" "}
        <a href="#teams-and-sharing" className="underline underline-offset-2">Teams &amp; sharing</a>{" "}
        below) — your own, plus any a teammate has shared with you. An organization filter next
        to the search box narrows the list down to one org at a time; it only appears once
        you&apos;re in more than one. From here you can:
      </P>
      <UL>
        <li>create a new project (a <Code>dev</Code> environment is added automatically);</li>
        <li>open a project to manage its environments;</li>
        <li>rename or delete a project — deleting a project deletes all of its environments, variables, and version history, with no undo.</li>
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
        <li><strong>Paste .env</strong> — paste a whole file&apos;s contents to bulk add/update keys in one go (an upsert-merge: keys not present in the pasted text are left untouched).</li>
        <li><strong>Add / edit / delete</strong> a single key at a time.</li>
        <li><strong>Multiline values</strong> — fields auto-grow and support multi-line values (e.g. PEM-formatted keys); revealed values wrap instead of overflowing.</li>
      </UL>
      <Callout variant="warning">
        Deleting an entire environment or project has no undo. A deleted <em>variable</em>,
        though, can be brought back by rolling the environment back to an earlier version — see{" "}
        <strong>Version history</strong> below.
      </Callout>

      <H2>Version history &amp; rollback</H2>
      <P>
        Every change to an environment — an edit in the table, a <Code>Paste .env</Code> import,
        or a CLI <Code>push</Code> — creates a new numbered version. Click the{" "}
        <strong>History</strong> button on an environment to see every version with who made it
        and when, and to <strong>restore</strong> any earlier version. Restoring creates a new
        version rather than erasing what came after (like <Code>git revert</Code>, not{" "}
        <Code>git reset</Code>), so a restore can itself always be undone.
      </P>

      <H2 id="teams-and-sharing">Teams &amp; sharing</H2>
      <P>
        Every account gets a personal organization automatically. Create or join a{" "}
        <strong>team</strong> organization from <Code>Teams</Code> in the sidebar — invitations,
        pending status, member roles, and removal are handled entirely by Clerk&apos;s own
        organization UI there. When you belong to more than one org, a picker on that page lets
        you switch which one you&apos;re managing.
      </P>
      <UL>
        <li>
          <strong>Manage access</strong> — from a project&apos;s menu, grant an org member or a
          group one of three roles: <strong>Viewer</strong> (read-only), <strong>Editor</strong>{" "}
          (can edit variables and environments), or <strong>Admin</strong> (can also manage
          access and delete the project). Org admins/owners always have admin access to every
          project in the org, without needing an explicit grant.
        </li>
        <li>
          <strong>Groups</strong> (Settings → Groups, org admins only) — create named groups of
          org members and grant a group access to a project in one step instead of adding people
          one at a time.
        </li>
      </UL>
      <Callout>
        Access control is currently project-wide — a role applies to every environment in the
        project. Restricting a role to specific environments (e.g. Editor on <Code>dev</Code> but
        Viewer on <Code>prod</Code>) isn&apos;t enforced yet.
      </Callout>

      <H2>CLI tokens (Settings → CLI Tokens)</H2>
      <P>
        Personal access tokens authenticate the <Code>envhq</Code> CLI (mainly for CI/headless
        use — interactive <Code>envhq login</Code> uses a browser flow instead and doesn&apos;t
        need one of these). From this page you can:
      </P>
      <UL>
        <li>create a token — the plaintext value is shown <strong>once</strong>, at creation time only; copy it immediately;</li>
        <li>see each token&apos;s name and last-used time (never the token itself again);</li>
        <li>revoke a token instantly if it&apos;s no longer needed or may have leaked.</li>
      </UL>

      <H2>Theme</H2>
      <P>
        Toggle light/dark mode from the header. The app defaults to light mode; your choice is
        remembered on the device.
      </P>
    </div>
  );
}
