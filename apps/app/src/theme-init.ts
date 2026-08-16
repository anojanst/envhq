/**
 * Imported first in main.tsx, runs before React mounts. Applies the
 * persisted theme class ahead of first paint to avoid a flash of the wrong
 * theme. Deliberately an external module rather than an inline <script> in
 * index.html (the usual next-themes pattern) — an inline script would need
 * `unsafe-inline` in the CSP.
 */
const theme = localStorage.getItem("envhq-theme");
if (theme === "dark") {
  document.documentElement.classList.add("dark");
}
