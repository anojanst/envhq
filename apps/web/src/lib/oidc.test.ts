import { describe, expect, test } from "vitest";
import { SignInRefused, toSignedInUser } from "./oidc";

const open = { allowedEmailDomains: [] as string[] };
const corp = { allowedEmailDomains: ["corp.example"] };

describe("toSignedInUser", () => {
  test("reads sub, name, email and picture", () => {
    expect(
      toSignedInUser({ sub: "u1", name: "Ada Lovelace", email: "ada@x.example", picture: "https://img" }, open),
    ).toEqual({ userId: "u1", name: "Ada Lovelace", email: "ada@x.example", imageUrl: "https://img" });
  });

  test("builds a name from given/family name, then preferred_username", () => {
    expect(toSignedInUser({ sub: "u1", given_name: "Ada", family_name: "L" }, open).name).toBe("Ada L");
    expect(toSignedInUser({ sub: "u1", preferred_username: "ada" }, open).name).toBe("ada");
    expect(toSignedInUser({ sub: "u1" }, open).name).toBeNull();
  });

  test("no subject, no sign-in", () => {
    expect(() => toSignedInUser({ email: "a@b.c" }, open)).toThrow(SignInRefused);
  });

  test("the domain allow-list admits only verified emails in listed domains", () => {
    expect(toSignedInUser({ sub: "u1", email: "ada@corp.example", email_verified: true }, corp).userId).toBe("u1");
    expect(toSignedInUser({ sub: "u1", email: "Ada@CORP.example" }, corp).userId).toBe("u1");
    expect(() => toSignedInUser({ sub: "u1", email: "ada@other.example" }, corp)).toThrow(/domain/);
    expect(() => toSignedInUser({ sub: "u1", email: "ada@corp.example.evil" }, corp)).toThrow(/domain/);
    expect(() => toSignedInUser({ sub: "u1" }, corp)).toThrow(/domain/);
    expect(() => toSignedInUser({ sub: "u1", email: "ada@corp.example", email_verified: false }, corp)).toThrow(/unverified/);
  });
});
