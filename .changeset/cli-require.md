---
"envhq": minor
---

Add `--require <names>` (or `ENVHQ_REQUIRE`) to `envhq run` and `envhq export`.
List the variables a job can't work without; if any is missing or empty, the
command fails before writing anything or starting the child, names each one,
and suggests the closest existing name when it looks like a typo. Without it, a
misspelled or deleted variable just reaches the job unset.
