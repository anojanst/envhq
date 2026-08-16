---
"envhq": patch
---

Point CLI requests at the canonical, versioned `/api/v1` prefix (ADR-010). The server keeps answering unversioned paths identically as an alias, so this is not a breaking change for any consumer.
