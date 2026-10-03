---
"envhq": minor
---

Add `envhq run -- <command>` and `envhq export`, for CI. With `ENVHQ_TOKEN` and
`ENVHQ_DEPLOY_KEY` set, both decrypt on the runner with no `envhq login`, no
keychain and no passphrase prompt. `run` injects the values into one process
and writes nothing to disk. `export` writes them as dotenv or JSON, or into
GitHub Actions' job environment or step outputs. Inside GitHub Actions, every
value is registered with the log masker before anything can print it.
