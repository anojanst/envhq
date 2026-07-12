# envhq

Command-line client for [EnvHQ](https://envhq.dev) — push and pull your
environment variables between a local `.env` file and your projects.

```bash
npm install -g envhq   # installs the `envhq` command
# or: npx envhq <command>
```

## Usage

1. Create a personal token at **https://envhq.dev → CLI Tokens**.
2. Log in, then either bootstrap a brand-new project or link an existing one:

```bash
envhq login --token <token>
cd ~/code/my-project

envhq init                  # new project named after this folder, linked
# — or, for a project that already exists on envhq.dev —
envhq link                  # pick a project, maps every environment to a file
```

Every environment in the project gets linked in one go: the default
environment (`dev`, or the first one) maps to `.env`, the rest map to
`.env.<name>` (e.g. `.env.staging`). Adjust a mapping with
`envhq env map <env> <file>`, or add another environment later with
`envhq env create <name> [--from <env>] --link`.

3. Sync:

```bash
envhq pull                 # pull the default environment to its mapped file
envhq push staging         # push a specific environment
envhq push --all           # push every linked environment to its mapped file
envhq status                # show login + link state
```

## Commands

| Command | Description |
|---|---|
| `login --token <t> [--url <u>]` | Authenticate and store credentials (`~/.envhq/config.json`). |
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

- **`--url` / `ENVHQ_URL`** — override the server (defaults to
  `https://envhq.dev`). Useful for local development or self-hosting.
- **`ENVHQ_TOKEN`** — supply a token directly (headless / CI). Never persisted
  to disk.
- **`.envhq/config.json`** — per-folder CLI state (project + environment →
  file map) created by `envhq link`. Gitignored — do not commit it. Older
  `.envsync/config.json` (or the pre-M2 single-file `.envsync.json`) is
  migrated automatically on first use, including moving any stored keychain
  session across.

## Notes

Values are encrypted at rest on the server.

This CLI was previously published as `@envsyncdev/cli` (command `envsync`)
under the project's old name, envsync — see the note in the main
[repo README](https://github.com/anojanst/envhq#readme).

MIT © Anojan ST
