# EnvHQ GitHub Action

Load an [EnvHQ](https://envhq.dev) environment into a GitHub Actions job. The
values are decrypted **on the runner**, with a deploy key that only you hold.
EnvHQ can't decrypt them, and every value is masked before it can reach a log.

```yaml
- uses: actions/setup-node@v5
  with: { node-version: 24 }
- uses: envhq/envhq-action@v1
  with:
    token: ${{ secrets.ENVHQ_TOKEN }}
    key: ${{ secrets.ENVHQ_DEPLOY_KEY }}
    project: shop
    environment: staging
- run: npm test   # sees every variable in shop/staging
```

## Setup

1. In EnvHQ, open the project → **Deploy keys** → **Issue deploy key**.
2. Save both values it shows (it shows them once) as repository secrets:
   `ENVHQ_DEPLOY_KEY` and `ENVHQ_TOKEN`.
3. Add the step above.

The token fetches the encrypted values and the key decrypts them. Either one
alone is useless.

## Inputs

| Input | Required | Default | |
|---|---|---|---|
| `token` | yes | | The deploy key's API token. |
| `key` | yes | | The deploy key. |
| `project` | yes | | Project name or id. |
| `environment` | yes | | Environment name. |
| `format` | no | `env` | `env`: environment variables for every later step. `outputs`: step outputs (`steps.<id>.outputs.<NAME>`). `dotenv`: a file at `path`. |
| `mask` | no | `true` | Register every value with the log masker. Turn off only for values that aren't secret. |
| `path` | no | `.env` | Where `format: dotenv` writes. |

Set `ENVHQ_URL` in the job's `env` to use a server other than envhq.dev.

## Choosing a format

- **`env`** is the default. Every later step in the job sees the values,
  including third-party actions.
- **`outputs`** keeps them out of the environment. Pass each value only to the
  steps that need it.
- **`dotenv`** writes a file that stays on the runner for the rest of the job,
  where a cache or artifact upload can pick it up. Use it only for tools that
  must read a file.

To limit the values to a single command, skip this action and wrap that
command in `npx envhq run -- <command>`, with `ENVHQ_TOKEN` and
`ENVHQ_DEPLOY_KEY` in the step's `env`. Nothing is written anywhere.

## Masking

Masking covers each value in full, each line of a multi-line value, and the
value's base64 and JSON-escaped forms. GitHub matches literal strings only, so
a value that is transformed any other way (URL-encoded, split up, reversed)
will print as-is. Don't echo secrets just because the log masks them.

## If it fails

The step fails, and no variables are exported. Later steps never run with
half an environment. The log says why. A revoked deploy key, for example,
tells you to issue a new one and update both secrets.

## How it works

This action runs a pinned release of the `envhq` CLI (`envhq export`), so it
uses the same decryption code as everywhere else. See
[how CI decrypts](https://github.com/envhq/envhq/blob/main/docs/DEPLOY_KEYS.md).

## Releasing (maintainers)

This directory is developed in the EnvHQ monorepo. The published action is a
mirror of it, with `action.yml` at the repository root.

1. Publish the `envhq` CLI release that `CLI_VERSION` in `src/action.ts` pins.
   The action calls `npx envhq@<that version>`, so it can't ship first.
2. `pnpm --filter @envhq/github-action build`, then commit `dist/`. CI fails
   if it's stale.
3. Copy this directory to the action repository, tag `v1.x.y`, and move the
   `v1` tag.
