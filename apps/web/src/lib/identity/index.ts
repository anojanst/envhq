/**
 * Identity answers exactly one question: who is this person, and did they
 * sign in? Server-only.
 *
 * It is the seam the self-hosting plan builds on (docs/SELF_HOSTING_PLAN.md,
 * phase 1): today Clerk's SDK sits behind it; phase 3 puts OIDC behind it,
 * with Clerk as envhq.dev's OIDC provider and the customer's own IdP when
 * self-hosted. Callers never import `@clerk/*` for identity.
 *
 * Deliberately NOT here: organizations, memberships and roles. Those live in
 * `lib/orgs.ts` and move into Postgres in phase 2. If this module ever grows a
 * function about orgs or roles, it is wrong — an identity provider says who
 * someone is, never what they may do, and OIDC can't carry org roles anyway.
 *
 * Bearer tokens (CLI, deploy keys) are not identity-provider sessions and are
 * resolved in `lib/auth.ts`, which calls `sessionUserId` only when no token
 * was presented.
 */

/** What an identity provider can tell us about a person. Display-only. */
export interface DirectoryUser {
  /** The stable subject. What every `user_id` column holds. */
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

export { sessionUserId, requireSessionUserId, getDirectoryUser, lookupDirectoryUsers } from "./clerk";
