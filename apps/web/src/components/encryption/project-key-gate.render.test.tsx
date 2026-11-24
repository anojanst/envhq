import { describe, expect, test, vi } from "vitest";
import { useSyncExternalStore } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * The recovery phrase is the one screen that must never be skipped: it's
 * shown once, and without it a forgotten passphrase loses the data for good.
 *
 * `setup()` unlocks the session the moment the key is stored, before the
 * recovery steps have run. The gate has to hold the wizard open across that
 * change — including when it mounts with "not-set-up" already known (the
 * normal case: the session is loaded once for the whole app), where there is
 * no status *transition* for it to notice. That case used to drop straight
 * into the editor and the phrase was never shown.
 */

const session = vi.hoisted(() => {
  type State = { status: string; publicKey: string | null; privateKey: string | null };
  let state: State = { status: "not-set-up", publicKey: null, privateKey: null };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: Partial<State>) => {
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
});

vi.mock("@/components/crypto-session-provider", () => ({
  useCryptoSession: () => {
    const state = useSyncExternalStore(session.subscribe, session.get);
    return {
      ...state,
      setup: async () => {
        session.set({ status: "unlocked", publicKey: "pk", privateKey: "sk" });
        return { recoveryPhrase: "AAAAA-BBBBB-CCCCC-DDDDD" };
      },
      unlock: async () => {},
      unlockWithRecoveryPhrase: async () => {},
      lock: () => {},
    };
  },
}));
vi.mock("@/hooks/use-project-dek", () => ({
  useProjectDek: () => {
    const { status } = useSyncExternalStore(session.subscribe, session.get);
    return { status: status === "unlocked" ? "ready" : "locked", dek: new Uint8Array(32), refetch: () => {} };
  },
}));
vi.mock("@/lib/client", () => ({ api: async () => ({}) }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));

const { ProjectKeyGate } = await import("./project-key-gate");

describe("ProjectKeyGate first-time setup", () => {
  test("shows the recovery phrase even though setup unlocks the session first", async () => {
    render(
      <ProjectKeyGate projectId="p1" purpose="to see these values">
        {() => <p>EDITOR</p>}
      </ProjectKeyGate>,
    );

    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "a-long-enough-passphrase" } });
    fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "a-long-enough-passphrase" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });

    expect(await screen.findByText("AAAAA-BBBBB-CCCCC-DDDDD")).toBeTruthy();
    expect(screen.queryByText("EDITOR")).toBeNull();
  });

  test("only reaches the editor after the phrase is confirmed", async () => {
    session.set({ status: "not-set-up", publicKey: null, privateKey: null });
    render(
      <ProjectKeyGate projectId="p1" purpose="to see these values">
        {() => <p>EDITOR</p>}
      </ProjectKeyGate>,
    );
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "a-long-enough-passphrase" } });
    fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "a-long-enough-passphrase" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    fireEvent.click(await screen.findByRole("button", { name: /saved it/ }));

    // Two groups at random positions; answer whichever were asked.
    const groups = ["AAAAA", "BBBBB", "CCCCC", "DDDDD"];
    for (const input of screen.getAllByLabelText(/^Group \d$/)) {
      const n = Number((input as HTMLInputElement).labels?.[0]?.textContent?.replace(/\D/g, ""));
      fireEvent.change(input, { target: { value: groups[n - 1]!.toLowerCase() } });
    }
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    });

    expect(await screen.findByText("EDITOR")).toBeTruthy();
  });
});
