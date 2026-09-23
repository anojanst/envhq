import { describe, test, expect, vi, beforeEach } from "vitest";
import { generateDek, decodeBase64, unsealWithPrivateKey, encodeBase64 } from "@envhq/crypto";

/**
 * RM-11's second acceptance criterion, in the form the ticket demands:
 * "the private key is never sent to the server — assert it in a test against
 * the request payload, not by reading the code."
 *
 * So this stubs the network at the boundary `issueDeployKey` actually uses,
 * lets it run for real, and then examines every byte it tried to send. A
 * comment claiming the private half stays local is not evidence; this is.
 */

const sent: { path: string; init: unknown }[] = [];

vi.mock("@/lib/client", () => ({
  api: async (path: string, init: unknown) => {
    sent.push({ path, init });
    return { id: "deploy-key-id", token: "envhq_stub_token" };
  },
}));

const { issueDeployKey, formatDeployKeySecret, parseDeployKeySecret } = await import("./deploy-key-client");

beforeEach(() => {
  sent.length = 0;
});

describe("issueDeployKey", () => {
  test("never transmits the private half, in any field", async () => {
    const dek = await generateDek();
    const result = await issueDeployKey({
      projectId: "proj-1",
      label: "GitHub Actions",
      environmentId: null,
      dek,
    });

    const { privateKey, publicKey } = parseDeployKeySecret(result.deployKeySecret);
    expect(privateKey.length).toBeGreaterThan(0);

    // The whole request, serialized — path, method, headers, body. Searching
    // the serialized form rather than named fields is deliberate: a future
    // field that happened to carry the key would still be caught.
    expect(sent).toHaveLength(1);
    const wire = JSON.stringify(sent[0]);
    expect(wire).not.toContain(privateKey);

    // And the guard is not vacuous: the public half IS in there, so a
    // substring search over this payload does find a key when one is present.
    expect(wire).toContain(publicKey);
  });

  test("sends a DEK the new key can actually open, and nothing the server could", async () => {
    const dek = await generateDek();
    const result = await issueDeployKey({
      projectId: "proj-1",
      label: "GitHub Actions",
      environmentId: null,
      dek,
    });
    const { privateKey, publicKey } = parseDeployKeySecret(result.deployKeySecret);

    const body = (sent[0]!.init as { body: { wrappedDek: string; publicKey: string } }).body;
    // The sealed blob is what the server stores. It opens with the private
    // half the customer just took away, and with nothing else.
    const opened = await unsealWithPrivateKey(body.wrappedDek, publicKey, privateKey);
    expect(decodeBase64(opened)).toEqual(dek);
    expect(body.wrappedDek).not.toContain(encodeBase64(dek));
  });

  test("passes an environment cap through when one is chosen", async () => {
    const dek = await generateDek();
    await issueDeployKey({ projectId: "proj-1", label: "staging only", environmentId: "env-9", dek });
    const body = (sent[0]!.init as { body: { environmentId: string | null } }).body;
    expect(body.environmentId).toBe("env-9");
  });
});

describe("the deploy key secret format", () => {
  test("round-trips", () => {
    expect(parseDeployKeySecret(formatDeployKeySecret("pub", "priv"))).toEqual({
      publicKey: "pub",
      privateKey: "priv",
    });
  });

  test.each(["", "nonsense", "envhq_dk_v2.a.b", "envhq_dk_v1.onlyonepart"])(
    "refuses %j with a readable error rather than failing later at decrypt",
    (bad) => {
      expect(() => parseDeployKeySecret(bad)).toThrow(/EnvHQ deploy key/);
    },
  );
});
