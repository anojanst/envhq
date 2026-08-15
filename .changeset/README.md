# Changesets

This directory manages EnvHQ's release notes and version bumps via
[Changesets](https://github.com/changesets/changesets). See
[docs/RELEASE_POLICY.md](../docs/RELEASE_POLICY.md) for the full release
policy — semver rationale, tagging convention, support window, and the
enterprise-tag soak gate.

## Adding a changeset

When your PR changes `packages/cli`, `packages/crypto`, or `packages/parser`
in a way that should show up in a changelog or bump a version, run:

```bash
pnpm changeset
```

and follow the prompts. Commit the generated `.changeset/*.md` file with your
PR. `@envhq/web` is excluded (see `.changeset/config.json`'s `ignore` list)
— it's the deployed app, not a consumed package, so per-change semver
doesn't apply to it the same way.

`packages/crypto` and `packages/parser` are `"private": true` and never
published to npm, but are still versioned and changelogged by Changesets —
they're real internal libraries `envhq` (the CLI) depends on, and a
changelog is useful even without a public release.
