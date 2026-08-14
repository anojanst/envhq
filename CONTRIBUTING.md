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

## Developer Certificate of Origin

All contributions require a sign-off certifying the Developer Certificate of
Origin, reproduced verbatim below. Add it by committing with `-s`:

```bash
git commit -s -m "Your commit message"
```

That appends a line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and an email address you can be reached at.

> **Note on wording:** the DCO text below refers to "the open source license
> indicated in the file". For this repository, read that as *the license
> governing that path* per [LICENSING.md](./LICENSING.md) — MIT for the client
> and crypto packages, Elastic License 2.0 for `apps/**`. The DCO may not be
> modified, so the wording is left exactly as published.

---

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

---

## Trademarks

Contributing does not grant any rights to the EnvHQ name or logo. See
[NOTICE](./NOTICE).

## Security issues

Please do **not** open a public issue for a security vulnerability. Report it
privately to the maintainer first.
