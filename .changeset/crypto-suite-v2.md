---
"envhq": minor
---

Encryption now uses only approved algorithms, run by Node's own crypto module: AES-256-GCM for values, ECDH P-256 for keypairs, and PBKDF2-HMAC-SHA256 for your passphrase. The CLI tells the server it speaks the new format, and EnvHQ refuses older CLIs with an instruction to update.

This is a clean break. Encryption set up before this release can't be read, so set it up again in the web app (Settings → Security) and issue new deploy keys. A deploy key from before this release now fails with a message saying to reissue it.
