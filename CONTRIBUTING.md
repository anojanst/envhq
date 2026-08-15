# Contributing to EnvHQ

Thanks for your interest. Please read this before opening a pull request — the
licensing setup here is not the usual one.

## Licensing of contributions

EnvHQ is **source-available**, not open source, and different paths carry
different licenses. See [LICENSING.md](./LICENSING.md).

Your contribution is licensed under whichever license governs the path you are
touching:

- `apps/**` → Elastic License 2.0
- `packages/cli/**`, `packages/parser/**`, `packages/crypto/**` → MIT

## Contributor License Agreement

**Every contribution requires a signed CLA before it can be merged** — this
applies repo-wide, to `packages/**` as well as `apps/**`, even though MIT
(which governs the `packages/**` paths) doesn't itself require one. One
agreement, applied uniformly, is simpler to explain and enforce than two
regimes split by directory.

Why a CLA rather than the more common Developer Certificate of Origin (DCO):
the [Elastic License 2.0](./LICENSE) governing `apps/**` grants us a
license that is explicitly **non-sublicensable**. A DCO only certifies that
you have the right to contribute your code under the project's license — it
grants nothing beyond that. It would leave us permanently unable to offer
differing commercial terms on any contributed `apps/**` code, to anyone,
ever. A CLA closes exactly that gap by adding one clause: the right to
sublicense. See [ICLA.md](./ICLA.md) for the full agreement and the reasoning
behind it.

- **Contributing as an individual, on your own time?** Sign the
  [Individual CLA](./ICLA.md).
- **Contributing as part of your job, using your employer's time or
  resources?** Your employer needs to sign the [Corporate CLA](./CCLA.md)
  first — an individual's signature doesn't bind their employer, since work
  product is generally owned by the employer, not the employee. Reach out to
  the maintainer to get a CCLA in place before opening a PR.

**How signing works:** open your pull request as normal. A bot
([CLA Assistant Lite](https://github.com/contributor-assistant/github-action))
comments asking you to confirm you've read and agree to the CLA by replying
with the phrase it specifies. Until you do, a required status check blocks
the PR from merging; once you've signed, it unblocks automatically and your
signature is recorded for all your future contributions too — you only sign
once per GitHub account.

## Trademarks

Contributing does not grant any rights to the EnvHQ name or logo. See
[NOTICE](./NOTICE).

## Security issues

Please do **not** open a public issue for a security vulnerability. Report it
privately to the maintainer first.
