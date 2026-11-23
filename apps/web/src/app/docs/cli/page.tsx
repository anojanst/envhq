import { DocsHeader, H2, P, UL, Code, CodeBlock, Callout, Table, Th, Td } from "@/components/docs-ui";

export const metadata = { title: "CLI reference" };

export default function CliDocsPage() {
  return (
    <div>
      <DocsHeader
        title="CLI reference"
        lede="Every envhq command, its options, and the config files it reads and writes."
      />

      <H2>Install</H2>
      <CodeBlock>{`npm install -g envhq
# or run without installing
npx envhq <command>`}</CodeBlock>

      <H2>Authentication</H2>
      <Table>
        <thead>
          <tr>
            <Th>Command</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td><Code>envhq login</Code></Td>
            <Td>Authenticate via your browser (opens a loopback PKCE flow). Add <Code>--token &lt;token&gt;</Code> to use a personal access token instead (headless/CI), and <Code>--url &lt;url&gt;</Code> to target a non-default server.</Td>
          </tr>
          <tr>
            <Td><Code>envhq logout</Code></Td>
            <Td>Remove stored credentials from the OS keychain.</Td>
          </tr>
          <tr>
            <Td><Code>envhq whoami</Code></Td>
            <Td>Show the authenticated user.</Td>
          </tr>
          <tr>
            <Td><Code>envhq status</Code></Td>
            <Td>Show login and link state for the current folder, plus the target server URL.</Td>
          </tr>
        </tbody>
      </Table>
      <P>
        Browser logins mint a token that expires after 7 days; expired sessions trigger the
        browser flow again automatically on the next <Code>push</Code>/<Code>pull</Code> (this
        auto-relogin is skipped for tokens sourced from <Code>--token</Code> or{" "}
        <Code>ENVHQ_TOKEN</Code> — those just report the error with guidance to rotate).
      </P>

      <H2>Projects</H2>
      <Table>
        <thead>
          <tr>
            <Th>Command</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td><Code>envhq orgs</Code></Td>
            <Td>List the organizations you belong to (your personal org plus any teams you&apos;ve been invited to).</Td>
          </tr>
          <tr>
            <Td><Code>envhq projects</Code></Td>
            <Td>List your projects. <Code>--org &lt;name&gt;</Code> lists a specific org&apos;s projects instead of your personal org.</Td>
          </tr>
          <tr>
            <Td><Code>envhq init [name]</Code></Td>
            <Td>Bootstrap the current folder: create a project (name defaults to the folder name), create environment(s), and link the folder. Idempotent — no-ops if already linked. <Code>-e, --env &lt;names&gt;</Code> comma-separated environments (default <Code>dev</Code>). <Code>--org &lt;name&gt;</Code> creates it in a team org instead of your personal org.</Td>
          </tr>
          <tr>
            <Td><Code>projects create &lt;name&gt;</Code></Td>
            <Td>Create a new project (and its environment(s)) and link this folder to it. <Code>-e, --env &lt;names&gt;</Code> (default <Code>dev</Code>), <Code>--org &lt;name&gt;</Code>, <Code>--no-link</Code> to skip linking.</Td>
          </tr>
          <tr>
            <Td><Code>envhq link</Code></Td>
            <Td>Link this folder to an existing project, mapping every environment to a local file. <Code>-p, --project &lt;name&gt;</Code> to skip the picker, <Code>--org &lt;name&gt;</Code> to pick from a team org instead of your personal org.</Td>
          </tr>
        </tbody>
      </Table>
      <P>
        <Code>--org</Code> matches an org by name, case-insensitively. Omitting it always
        defaults to your personal org — existing scripts and CI behave exactly as before.
      </P>

      <H2>Environments</H2>
      <Table>
        <thead>
          <tr>
            <Th>Command</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td><Code>env create &lt;name&gt;</Code></Td>
            <Td>Create an environment in a project. <Code>--from &lt;env&gt;</Code> clones another environment&apos;s variables server-side. <Code>-p, --project &lt;name&gt;</Code> targets a project other than the linked one. <Code>--link</Code> links this folder to the new environment.</Td>
          </tr>
          <tr>
            <Td><Code>env list</Code></Td>
            <Td>List environments in a project (shows the linked file mapping when applicable). <Code>-p, --project &lt;name&gt;</Code>.</Td>
          </tr>
          <tr>
            <Td><Code>env map &lt;env&gt; &lt;file&gt;</Code></Td>
            <Td>Change which local file an environment maps to.</Td>
          </tr>
        </tbody>
      </Table>

      <H2>Sync</H2>
      <Table>
        <thead>
          <tr>
            <Th>Command</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td><Code>envhq push [env]</Code></Td>
            <Td>Three-way sync a local file to the remote: adds new keys, updates changed ones, and <strong>propagates deletions</strong> (a key you removed locally, and that hasn&apos;t changed remotely, is deleted remotely too) — computed against a local sync record written by the last <Code>push</Code>/<Code>pull</Code>, not a blind overwrite. <Code>[env]</Code> defaults to the link&apos;s default environment. <Code>-f, --file &lt;path&gt;</Code> overrides the mapped file. <Code>--all</Code> pushes every linked environment (mutually exclusive with an explicit env/file). <Code>--yes</Code> skips the prod and deletion confirmations. <Code>-m, --message &lt;msg&gt;</Code> tags the resulting version with a commit message.</Td>
          </tr>
          <tr>
            <Td><Code>envhq pull [env]</Code></Td>
            <Td>Write remote variables to a local file. Cloud wins for every key it already knows about; a local key you added since the last sync (not yet on the remote) is merged forward instead of discarded. The previous file contents are always backed up to <Code>&lt;file&gt;.bak</Code> first. Same <Code>[env]</Code> / <Code>-f, --file</Code> / <Code>--all</Code> / <Code>--yes</Code> semantics as <Code>push</Code>, plus <Code>--force</Code> to overwrite without the confirmation prompt.</Td>
          </tr>
          <tr>
            <Td><Code>envhq diff [env]</Code></Td>
            <Td>Preview exactly what <Code>push</Code> would add, update, or delete, without applying it. Same <Code>[env]</Code> / <Code>-f, --file</Code> / <Code>--all</Code> as <Code>push</Code>.</Td>
          </tr>
        </tbody>
      </Table>
      <Callout variant="warning">
        <Code>push</Code>/<Code>pull</Code>/<Code>rollback</Code> targeting an environment named{" "}
        <Code>prod</Code> or <Code>production</Code> ask for confirmation unless you pass{" "}
        <Code>--yes</Code>; a <Code>push</Code> that would delete remote keys asks separately.
        Deleting an entire environment or project (from the web app) is still permanent — there&apos;s
        no undo for that. See{" "}
        <a href="/docs/limitations" className="underline underline-offset-2">Limitations &amp; FAQ</a>.
      </Callout>

      <H2>Run and export</H2>
      <P>
        For scripts and CI. Neither command prompts. Both take <Code>-p, --project &lt;name|id&gt;</Code>{" "}
        and <Code>-e, --env &lt;name&gt;</Code>, which default to the linked folder, or to{" "}
        <Code>ENVHQ_PROJECT</Code>/<Code>ENVHQ_ENVIRONMENT</Code> when those are set. Both also take{" "}
        <Code>--require &lt;names&gt;</Code>: the variables you can&apos;t do without, comma-separated.
        If any is missing or empty, the command stops before writing anything or starting your
        command, and names each one.
      </P>
      <Table>
        <thead>
          <tr>
            <Th>Command</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td><Code>envhq run -- &lt;command&gt;</Code></Td>
            <Td>Run a command with the environment&apos;s variables set. Nothing is written to disk, and the command doesn&apos;t receive <Code>ENVHQ_TOKEN</Code> or <Code>ENVHQ_DEPLOY_KEY</Code>. EnvHQ&apos;s values replace any variable already set with the same name. Exits with the command&apos;s exit code.</Td>
          </tr>
          <tr>
            <Td><Code>envhq export</Code></Td>
            <Td>Print the decrypted variables. <Code>--format</Code> takes <Code>dotenv</Code> (default), <Code>json</Code>, <Code>github-env</Code> or <Code>github-output</Code>. <Code>-o, --output &lt;file&gt;</Code> writes a file readable only by you, instead of printing. Inside GitHub Actions it won&apos;t print values to the log; use <Code>--output</Code> or a <Code>github-*</Code> format there.</Td>
          </tr>
        </tbody>
      </Table>
      <P>
        Inside GitHub Actions, both commands register every value with the log masker before
        printing anything. <Code>--no-mask</Code> turns that off for <Code>export</Code>. See{" "}
        <a href="/docs/ci" className="underline underline-offset-2">CI &amp; GitHub Actions</a>.
      </P>

      <H2>Version history</H2>
      <Table>
        <thead>
          <tr>
            <Th>Command</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td><Code>envhq history [env]</Code></Td>
            <Td>List every version of an environment: version number, timestamp, who committed it, and its message. <Code>--all</Code> shows history for every linked environment.</Td>
          </tr>
          <tr>
            <Td><Code>envhq rollback &lt;version&gt; [env]</Code></Td>
            <Td>Restore an environment to a previous version&apos;s exact set of keys and values. This creates a <strong>new</strong> version rather than rewriting history (like <Code>git revert</Code>, not <Code>git reset</Code>) — nothing is lost, and you can always roll back the rollback. <Code>-m, --message &lt;msg&gt;</Code> sets the new version&apos;s commit message; <Code>--yes</Code> skips confirmation.</Td>
          </tr>
        </tbody>
      </Table>
      <P>
        Every commit — a CLI <Code>push</Code>, a web edit, an import, or a rollback — creates a
        new version. Concurrent pushes are conflict-checked: if the environment moved since you
        last read it, <Code>push</Code>/<Code>rollback</Code> fails with the conflicting keys and
        their server-side values instead of silently overwriting them; run <Code>pull</Code> and
        try again.
      </P>

      <H2>Config files</H2>
      <UL>
        <li><Code>~/.envhq/config.json</Code> — global config: the server <Code>url</Code> (your token lives in the OS keychain, never in this file).</li>
        <li><Code>./.envhq/config.json</Code> — per-folder link: project id/name, the <Code>environments</Code> → file map, and the default environment. Gitignored automatically.</li>
      </UL>
      <P>
        Older <Code>.envsync/</Code> config (or the legacy single-env <Code>.envsync.json</Code>)
        from before the project&apos;s rebrand from <Code>envsync</Code> to EnvHQ is auto-migrated the
        first time you run a command in a folder that has it, including any OS-keychain session
        stored under the old service name.
      </P>

      <H2>Environment variables</H2>
      <Table>
        <thead>
          <tr>
            <Th>Variable</Th>
            <Th>Purpose</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td><Code>ENVHQ_URL</Code></Td>
            <Td>Override the server URL for a single command or session (also settable per-command with <Code>--url</Code>/<Code>-u</Code> on <Code>login</Code>).</Td>
          </tr>
          <tr>
            <Td><Code>ENVHQ_TOKEN</Code></Td>
            <Td>Use a token from the environment instead of the OS keychain. This is the standard way to authenticate in CI, and no <Code>envhq login</Code> is needed.</Td>
          </tr>
          <tr>
            <Td><Code>ENVHQ_DEPLOY_KEY</Code></Td>
            <Td>A deploy key. <Code>run</Code> and <Code>export</Code> use it to decrypt with no keychain and no passphrase prompt. Issue one in the web app (project → Deploy keys). On a CI runner (<Code>CI=true</Code>), these commands fail straight away without it, instead of waiting for a passphrase.</Td>
          </tr>
          <tr>
            <Td><Code>ENVHQ_PROJECT</Code>, <Code>ENVHQ_ENVIRONMENT</Code></Td>
            <Td>Defaults for <Code>--project</Code> and <Code>--env</Code> on <Code>run</Code> and <Code>export</Code>.</Td>
          </tr>
          <tr>
            <Td><Code>ENVHQ_REQUIRE</Code></Td>
            <Td>Same as <Code>--require</Code> on <Code>run</Code> and <Code>export</Code>.</Td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
}
