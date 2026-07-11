# envsync

Command-line client for [env-sync](https://envsync.dev) — push and pull your
environment variables between a local `.env` file and your projects.

```bash
npm install -g @envsyncdev/cli   # installs the `envsync` command
# or: npx @envsyncdev/cli <command>
```

## Usage

1. Create a personal token at **https://envsync.dev → CLI Tokens**.
2. Log in and link a project folder:

```bash
envsync login --token <token>
cd ~/code/my-project
envsync link                 # pick a project + environment (writes .envsync.json)
```

3. Sync:

```bash
envsync pull                 # write remote variables to ./.env
envsync push                 # upload ./.env to the remote (upsert / merge)
envsync status               # show login + link state
```

## Commands

| Command | Description |
|---|---|
| `login --token <t> [--url <u>]` | Authenticate and store credentials (`~/.envsync/config.json`). |
| `logout` | Remove stored credentials. |
| `whoami` | Show the authenticated user. |
| `projects` | List your projects. |
| `link [--project <n>] [--env <n>]` | Link this folder to a project + environment. |
| `pull [--env <n>] [--file <p>] [--force]` | Write remote variables to a local file (default `.env`). |
| `push [--env <n>] [--file <p>]` | Upload a local `.env` to the remote (upsert/merge). |
| `status` | Show login and link status. |

## Configuration

- **`--url` / `ENVSYNC_URL`** — override the server (defaults to
  `https://envsync.dev`). Useful for local development or self-hosting.
- **`.envsync/`** — per-folder CLI state (link + sync baseline) created by
  `envsync link`. Gitignored — do not commit it. `link` adds this entry to your
  project's `.gitignore` automatically.

## Notes

`push`/`pull` operate on the linked environment by default; pass `--env <name>`
to target another environment in the same project. Values are encrypted at rest
on the server.

MIT © Anojan ST
