# envsync

Command-line client for [env-sync](https://envsync.dev) — push and pull your
environment variables between a local `.env` file and your projects.

```bash
npm install -g @envsyncdev/cli   # installs the `envsync` command
# or: npx @envsyncdev/cli <command>
```

## Usage

1. Create a personal token at **https://envsync.dev → CLI Tokens**.
2. Log in, then either bootstrap a brand-new project or link an existing one:

```bash
envsync login --token <token>
cd ~/code/my-project

envsync init                  # new project named after this folder, linked
# — or, for a project that already exists on envsync.dev —
envsync link                  # pick a project, maps every environment to a file
```

Every environment in the project gets linked in one go: the default
environment (`dev`, or the first one) maps to `.env`, the rest map to
`.env.<name>` (e.g. `.env.staging`). Adjust a mapping with
`envsync env map <env> <file>`, or add another environment later with
`envsync env create <name> [--from <env>] --link`.

3. Sync:

```bash
envsync pull                 # pull the default environment to its mapped file
envsync push staging         # push a specific environment
envsync push --all           # push every linked environment to its mapped file
envsync status                # show login + link state
```

## Commands

| Command | Description |
|---|---|
| `login --token <t> [--url <u>]` | Authenticate and store credentials (`~/.envsync/config.json`). |
| `logout` | Remove stored credentials. |
| `whoami` | Show the authenticated user. |
| `init [name] [--env <list>]` | Bootstrap this folder: create a project (default name = folder name) + environment(s), link it, write `.gitignore`. No-ops if already linked. |
| `projects` | List your projects. |
| `projects create <name> [--env <list>] [--no-link]` | Create a project + environment(s); links this folder unless `--no-link`. |
| `link [--project <n>]` | Link this folder to an existing project, mapping every environment to a file. |
| `env create <name> [--from <env>] [--project <n>] [--link]` | Create an environment, optionally cloning another's variables server-side; `--link` maps it into this folder. |
| `env list [--project <n>]` | List a project's environments (and their linked file, if this folder is linked to it). |
| `env map <env> <file>` | Change which local file an environment maps to. |
| `pull [env] [--file <p>] [--all] [--force] [--yes]` | Write remote variables to a local file (defaults to the linked default environment). |
| `push [env] [--file <p>] [--all] [--yes]` | Upload a local file to the remote (upsert/merge). |
| `status` | Show login and link status. |

`--env <list>` on `init`/`projects create` is a comma-separated list (default
`dev`). `env create`/`env list` default to the linked project; pass
`--project <name>` to target a different one without linking to it.

`env`/positional arguments default to the link's default environment;
`--file` overrides the linked mapping for a single run; `--all` acts on every
linked environment at once (mutually exclusive with an explicit env or
`--file`). Pushing/pulling an environment named `prod`/`production` asks for
confirmation unless you pass `--yes`.

## Configuration

- **`--url` / `ENVSYNC_URL`** — override the server (defaults to
  `https://envsync.dev`). Useful for local development or self-hosting.
- **`.envsync/config.json`** — per-folder CLI state (project + environment →
  file map) created by `envsync link`. Gitignored — do not commit it. A
  pre-M2 `.envsync.json` from an older CLI version is migrated automatically
  on first use.

## Notes

Values are encrypted at rest on the server.

MIT © Anojan ST
