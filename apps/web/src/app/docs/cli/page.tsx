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
            <Td><Code>envhq projects</Code></Td>
            <Td>List your projects.</Td>
          </tr>
          <tr>
            <Td><Code>envhq init [name]</Code></Td>
            <Td>Bootstrap the current folder: create a project (name defaults to the folder name), create environment(s), and link the folder. Idempotent — no-ops if already linked. <Code>-e, --env &lt;names&gt;</Code> comma-separated environments (default <Code>dev</Code>).</Td>
          </tr>
          <tr>
            <Td><Code>projects create &lt;name&gt;</Code></Td>
            <Td>Create a new project (and its environment(s)) and link this folder to it. <Code>-e, --env &lt;names&gt;</Code> (default <Code>dev</Code>), <Code>--no-link</Code> to skip linking.</Td>
          </tr>
          <tr>
            <Td><Code>envhq link</Code></Td>
            <Td>Link this folder to an existing project, mapping every environment to a local file. <Code>-p, --project &lt;name&gt;</Code> to skip the picker.</Td>
          </tr>
        </tbody>
      </Table>

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
            <Td>Create an environment in a project. <Code>--from &lt;env&gt;</Code> clones another environment's variables server-side. <Code>-p, --project &lt;name&gt;</Code> targets a project other than the linked one. <Code>--link</Code> links this folder to the new environment.</Td>
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
            <Td>Upload a local file to the remote (upsert/merge — existing remote keys not present in the file are left alone). <Code>[env]</Code> defaults to the link's default environment. <Code>-f, --file &lt;path&gt;</Code> overrides the mapped file. <Code>--all</Code> pushes every linked environment (mutually exclusive with an explicit env/file). <Code>--yes</Code> skips the prod confirmation.</Td>
          </tr>
          <tr>
            <Td><Code>envhq pull [env]</Code></Td>
            <Td>Write remote variables to a local file, overwriting it. Same <Code>[env]</Code> / <Code>-f, --file</Code> / <Code>--all</Code> / <Code>--yes</Code> semantics as <Code>push</Code>, plus <Code>--force</Code> to overwrite without prompting.</Td>
          </tr>
        </tbody>
      </Table>
      <Callout variant="warning">
        <Code>push</Code>/<Code>pull</Code> targeting an environment named <Code>prod</Code> or{" "}
        <Code>production</Code> ask for confirmation unless you pass <Code>--yes</Code>. There is
        no three-way diff yet — <Code>pull</Code> overwrites the target file outright, and{" "}
        <Code>push</Code> never deletes a remote key that's missing from your local file. See{" "}
        <a href="/docs/limitations" className="underline underline-offset-2">Limitations &amp; FAQ</a>.
      </Callout>

      <H2>Config files</H2>
      <UL>
        <li><Code>~/.envhq/config.json</Code> — global config: the server <Code>url</Code> (your token lives in the OS keychain, never in this file).</li>
        <li><Code>./.envhq/config.json</Code> — per-folder link: project id/name, the <Code>environments</Code> → file map, and the default environment. Gitignored automatically.</li>
      </UL>
      <P>
        Older <Code>.envsync/</Code> config (or the legacy single-env <Code>.envsync.json</Code>)
        from before the project's rebrand from <Code>envsync</Code> to EnvHQ is auto-migrated the
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
            <Td>Use a personal access token from the environment instead of the OS keychain — the standard way to authenticate in CI.</Td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
}
