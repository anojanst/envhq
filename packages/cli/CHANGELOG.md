# envhq

## 0.12.0

### Minor Changes

- [`8ae0995`](https://github.com/envhq/envhq/commit/8ae09959a2641c55600d2e3cc5cb7ccdff371428) Thanks [@anojanst](https://github.com/anojanst)! - Encryption now uses only approved algorithms, run by Node's own crypto module: AES-256-GCM for values, ECDH P-256 for keypairs, and PBKDF2-HMAC-SHA256 for your passphrase. The CLI tells the server it speaks the new format, and EnvHQ refuses older CLIs with an instruction to update.
  
  This is a clean break. Encryption set up before this release can't be read, so set it up again in the web app (Settings → Security) and issue new deploy keys. A deploy key from before this release now fails with a message saying to reissue it.

## 0.11.0

### Minor Changes

- [`b376039`](https://github.com/envhq/envhq/commit/b3760396ee13ec72680707620cd71ce005da5f6f) Thanks [@anojanst](https://github.com/anojanst)! - Add `--require <names>` (or `ENVHQ_REQUIRE`) to `envhq run` and `envhq export`.
  List the variables a job can't work without; if any is missing or empty, the
  command fails before writing anything or starting the child, names each one,
  and suggests the closest existing name when it looks like a typo. Without it, a
  misspelled or deleted variable just reaches the job unset.

## 0.10.0

### Minor Changes

- [`f5d973a`](https://github.com/envhq/envhq/commit/f5d973a6ce791db967a1e79b3bdcf41a52d9541f) Thanks [@anojanst](https://github.com/anojanst)! - Add `envhq run -- <command>` and `envhq export`, for CI. With `ENVHQ_TOKEN` and
  `ENVHQ_DEPLOY_KEY` set, both decrypt on the runner with no `envhq login`, no
  keychain and no passphrase prompt. `run` injects the values into one process
  and writes nothing to disk. `export` writes them as dotenv or JSON, or into
  GitHub Actions' job environment or step outputs. Inside GitHub Actions, every
  value is registered with the log masker before anything can print it.
