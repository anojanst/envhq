# Licensing

EnvHQ is **source-available**, not open source. Different parts of this repository
are licensed differently, deliberately: the clients and cryptography are permissive
so they can be inspected, embedded, and vendored freely; the server is protected.

| Path | License | Why |
| --- | --- | --- |
| `apps/**` | [Elastic License 2.0](./LICENSE) | The server, access control, and entitlement logic — the part that is licensed commercially. |
| `packages/cli/**` | [MIT](./packages/cli/LICENSE) | A client. It should be frictionless to install, embed in CI, and vendor. |
| `packages/parser/**` | [MIT](./packages/parser/LICENSE) | A general-purpose `.env` parser. Not the product; reuse is welcome. |
| `packages/crypto/**` | [MIT](./packages/crypto/LICENSE) | Auditability is the whole trust argument for a zero-knowledge product. This code must be inspectable and independently verifiable. |

Where a directory contains its own `LICENSE` file, that file governs it. Everything
else is governed by the Elastic License 2.0 at the repository root.

## What the Elastic License 2.0 means in practice

You may read, modify, self-host, and run EnvHQ. Three things you may not do:

1. **Offer it to third parties as a hosted or managed service** that provides a
   substantial set of EnvHQ's features.
2. **Circumvent, disable, or remove the license key functionality**, or unlock
   features it protects.
3. **Remove or obscure licensing and copyright notices.**

Running EnvHQ for your own organization — including self-hosting it for your own
employees and contractors — is explicitly permitted and is the intended use.

## History

This repository was licensed under the MIT License until 2026-08-11. Commits made
before that change remain available under the MIT License; the terms above apply
from that point forward.

## Trademarks

The licenses here grant no trademark rights. See [NOTICE](./NOTICE).

## Contributing

Contributions are accepted under a signed [Contributor License Agreement](./CONTRIBUTING.md)
— required repo-wide, because the Elastic License 2.0's grant is non-sublicensable and a
CLA is what restores that right for contributed code. See [ICLA.md](./ICLA.md) and
[CCLA.md](./CCLA.md).
