import { describe, test, expect, vi, beforeAll } from "vitest";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Profiler, type ProfilerOnRenderCallback, type ReactElement } from "react";
import { render, fireEvent, screen, act, cleanup } from "@testing-library/react";
import { encryptValue, generateDek } from "@envhq/crypto";

/**
 * RM-9's render profile, and the regression guard that came out of it.
 *
 * WHAT THE PROFILE FOUND. Decrypting 500 variables costs 3.4ms in total —
 * 6.7 microseconds each, measured against the real `@envhq/crypto`. Crypto is
 * not what makes this screen slow, so the ticket's "decrypt off the main
 * thread" option is not worth its own gotcha (moving the DEK across a worker
 * boundary) to save a single frame, once. Rendering is the cost, which is the
 * branch the ticket points at: "virtualise the list if the profile says
 * rendering — not crypto — is the cost."
 *
 * WHAT THIS ASSERTS. Not an absolute millisecond budget — that would measure
 * the machine as much as the code, and would flake in CI. The structural
 * claim instead: **a keystroke must not get more expensive as rows are
 * added.** Typing into the search box re-rendered every visible row before
 * this ticket, so the cost of one character scaled with the table. After, the
 * rows are memoised behind stable callbacks and a keystroke costs what it
 * costs at ten rows. Same shape as RM-6 and RM-7's per-org assertions: the
 * slope is the thing being pinned, not the constant.
 *
 * Measured here, before and after: a keystroke at 500 rows went 53.3ms to
 * 1.4ms, and the 500-vs-10 ratio 10.3x to flat. Mount went 451ms in two
 * commits to 368ms in one. The full table, and why the list is deliberately
 * not virtualised, are in docs/PERF_BASELINE.md.
 *
 * These are happy-dom timings, not browser timings — a real DOM is faster.
 * They are here to be compared with each other, not quoted as absolutes.
 */

const dek = await generateDek();

/** Every key contains "VAR", so typing it filters nothing out — what is measured is re-render cost alone, not a changed row set. */
async function makeRows(n: number) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const { ciphertext, nonce } = await encryptValue(dek, `value-${i}-${"x".repeat(40)}`);
    rows.push({
      id: `row-${i}`,
      key: `VAR_${String(i).padStart(4, "0")}`,
      ciphertext,
      iv: nonce,
      updatedAt: new Date(Date.now() - i * 1000).toISOString(),
    });
  }
  return rows;
}

vi.mock("@/components/crypto-session-provider", () => ({
  useCryptoSession: () => ({ publicKey: "test-public-key", unlocked: true, status: "unlocked" }),
}));
vi.mock("@/hooks/use-project-dek", () => ({
  useProjectDek: () => ({ status: "ready", dek, refetch: () => {} }),
}));
vi.mock("@/hooks/use-project-key-reconciliation", () => ({
  useProjectKeyReconciliation: () => {},
}));
// One instance, like Next's own: `useRouter()` returns the same router on
// every render, and the editor's handlers depend on it. A fresh object per
// render would hand every row a "new" handler and defeat the row memo.
const router = vi.hoisted(() => ({ push: () => {}, refresh: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, info: () => {} }),
}));
vi.mock("@/lib/client", () => ({ api: async () => ({ vars: [], pairs: [], count: 0 }) }));

const { EnvEditor } = await import("./env-editor");

/** Records every commit React makes under the tree, with React's own timing for it. */
function profiled(children: ReactElement, commits: number[]) {
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    commits.push(actualDuration);
  };
  return (
    <Profiler id="editor" onRender={onRender}>
      {children}
    </Profiler>
  );
}

/**
 * Mounts an editor of `n` rows, waits for decryption to land, then types
 * `chars` characters into the search box and returns the median commit cost
 * of a keystroke.
 */
async function keystrokeCost(n: number, chars = "VAR") {
  const rows = await makeRows(n);
  const commits: number[] = [];

  await act(async () => {
    render(
      profiled(
        <EnvEditor environmentId="env-1" projectId="proj-1" initialVars={rows} envName="staging" />,
        commits,
      ),
    );
  });
  const mountCost = commits.reduce((a, b) => a + b, 0);
  const mountCommits = [...commits];

  const search = screen.getByLabelText("Filter keys");
  const perKeystroke: number[] = [];
  let typed = "";
  for (const ch of chars) {
    typed += ch;
    commits.length = 0;
    await act(async () => {
      fireEvent.change(search, { target: { value: typed } });
    });
    perKeystroke.push(commits.reduce((a, b) => a + b, 0));
  }
  perKeystroke.sort((a, b) => a - b);
  const rowsVisible = screen.getAllByText(/^VAR_/).length;
  // Both sizes are measured inside one `beforeAll`, so the per-test cleanup
  // hasn't run yet — unmount here or the second render's queries match two
  // trees at once.
  cleanup();
  return { mountCost, mountCommits, keystroke: perKeystroke[Math.floor(perKeystroke.length / 2)], rowsVisible };
}

describe("environment editor at scale", () => {
  let small: Awaited<ReturnType<typeof keystrokeCost>>;
  let large: Awaited<ReturnType<typeof keystrokeCost>>;

  beforeAll(async () => {
    small = await keystrokeCost(10);
    large = await keystrokeCost(500);
    // Written to a file rather than logged: vitest's reporters swallow
    // console output on a passing run, and a JSON artifact is what actually
    // gets transcribed into docs/PERF_BASELINE.md. Same convention as the
    // RM-5 baseline harness.
    const out = process.env.RENDER_PROFILE_OUT ?? join(tmpdir(), "envhq-render-profile.json");
    await writeFile(
      out,
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          note: "happy-dom, not a browser: the ratios are the durable result, the absolute ms are environment-bound.",
          small: { rows: 10, mountMs: +small.mountCost.toFixed(1), mountCommits: small.mountCommits.map((c) => +c.toFixed(1)), keystrokeMs: +small.keystroke.toFixed(2) },
          large: { rows: 500, mountMs: +large.mountCost.toFixed(1), mountCommits: large.mountCommits.map((c) => +c.toFixed(1)), keystrokeMs: +large.keystroke.toFixed(2) },
          keystrokeRatio: +(large.keystroke / small.keystroke).toFixed(1),
        },
        null,
        2,
      ),
    );
  }, 120_000);

  test("the fixture actually renders every row", () => {
    // Vacuity guard. A search that filtered everything out, or a tree that
    // never mounted, would make every timing below trivially small.
    expect(small.rowsVisible).toBe(10);
    expect(large.rowsVisible).toBe(500);
  });

  test("mounting renders the table once, not twice", () => {
    // Decryption used to run for every row on mount and land as one state
    // update, re-rendering all 500 rows to fill in text that is masked. That
    // second commit cost 105ms and changed nothing on screen. Rows are now
    // decrypted only when something asks to see them, so mounting commits
    // once — and if eager decryption ever comes back, this is what says so.
    expect(large.mountCommits).toHaveLength(1);
    expect(small.mountCommits).toHaveLength(1);
  });

  test("a keystroke does not get more expensive as rows are added", () => {
    // The ticket's acceptance criterion — "typing in a 500-variable
    // environment stays responsive" — expressed as a slope rather than a
    // millisecond budget, so it means the same thing on CI as on a laptop.
    // Before this ticket the ratio was ~26x; the allowance below is loose
    // enough to absorb timer noise on a small absolute number and still
    // nowhere near a table that re-renders wholesale.
    expect(large.keystroke / small.keystroke).toBeLessThan(4);
  });
});


describe("revealing and editing pull values on demand", () => {
  async function mountEditor(n: number, initial?: Awaited<ReturnType<typeof makeRows>>) {
    const rows = initial ?? (await makeRows(n));
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <EnvEditor environmentId="env-1" projectId="proj-1" initialVars={rows} envName="staging" />,
      );
    });
    return { view, rows };
  }

  test("a value is hidden until revealed, then shows its plaintext", async () => {
    const { rows } = await mountEditor(3);
    expect(screen.getAllByText("••••••••••••")).toHaveLength(3);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(`Reveal ${rows[1].key}`));
    });

    expect(screen.getByText(`value-1-${"x".repeat(40)}`)).toBeTruthy();
    // Only the revealed one: the other two were never decrypted.
    expect(screen.getAllByText("••••••••••••")).toHaveLength(2);
  });

  test("editing a row that was never revealed starts from its real value", async () => {
    // The trap in making decryption lazy: the edit box used to be seeded
    // from a `value` prop that, for an unrevealed row, is now permanently
    // "". Saving would then have written an empty value over a real secret.
    const { rows } = await mountEditor(3);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(`Edit ${rows[2].key}`));
    });

    const textarea = screen.getByDisplayValue(`value-2-${"x".repeat(40)}`);
    expect(textarea).toBeTruthy();
  });

  test("a revealed row still shows its value after the table reloads", async () => {
    // A reload replaces every row object, which drops the plaintext cache —
    // correct, because the ciphertext may have moved under it. What must not
    // happen is the revealed row quietly rendering as empty afterwards.
    const rows = await makeRows(3);
    const { view } = await mountEditor(3, rows);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(`Reveal ${rows[0].key}`));
    });
    expect(screen.getByText(`value-0-${"x".repeat(40)}`)).toBeTruthy();

    await act(async () => {
      view.rerender(
        <EnvEditor environmentId="env-1" projectId="proj-1" initialVars={[...rows]} envName="staging" />,
      );
    });

    expect(screen.getByText(`value-0-${"x".repeat(40)}`)).toBeTruthy();
  });

  test("reveal all decrypts every row", async () => {
    await mountEditor(4);
    await act(async () => {
      fireEvent.click(screen.getByText("Reveal values"));
    });
    expect(screen.queryAllByText("••••••••••••")).toHaveLength(0);
    expect(screen.getByText(`value-3-${"x".repeat(40)}`)).toBeTruthy();
  });
});
