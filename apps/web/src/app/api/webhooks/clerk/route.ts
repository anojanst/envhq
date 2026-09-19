import { eq } from "drizzle-orm";
import { Webhook } from "svix";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { deleteUserProfile, upsertUserProfile } from "@/lib/user-profiles";

/**
 * Clerk → EnvHQ user sync (RM-6). Keeps `user_profiles` fresh so display
 * names are served locally instead of costing a Clerk call per id per render.
 *
 * AUTHENTICATION IS THE SIGNATURE, NOT A SESSION. This is the one route under
 * `src/app/api` that does not call `getUserId` — there is no user on a
 * webhook. Every request is rejected unless it carries a valid Svix signature
 * over the *raw* body, which is why the body is read with `req.text()` and
 * parsed only after verification. Parsing first and verifying later would mean
 * acting on an attacker's JSON.
 *
 * `CLERK_WEBHOOK_SIGNING_SECRET` is the signing secret from the Clerk
 * dashboard's webhook endpoint. Absent, the route refuses every delivery
 * rather than trusting unsigned input.
 *
 * Nothing here is an authorization input — see the note on `userProfiles` in
 * `db/schema.ts`. The worst a forged-but-somehow-verified payload could do is
 * mislabel a name in a history view.
 */

/** Svix headers on every delivery. */
const SVIX_ID = "svix-id";
const SVIX_TIMESTAMP = "svix-timestamp";
const SVIX_SIGNATURE = "svix-signature";

interface ClerkUserEvent {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    username?: string | null;
    image_url?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: { id: string; email_address: string }[];
    deleted?: boolean;
  };
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error("clerk webhook: CLERK_WEBHOOK_SIGNING_SECRET is unset — rejecting delivery");
    return json({ error: "Webhook not configured" }, 500);
  }

  const svixId = req.headers.get(SVIX_ID);
  const svixTimestamp = req.headers.get(SVIX_TIMESTAMP);
  const svixSignature = req.headers.get(SVIX_SIGNATURE);
  if (!svixId || !svixTimestamp || !svixSignature) {
    return json({ error: "Missing signature headers" }, 400);
  }

  // Raw body: the signature is computed over these exact bytes.
  const payload = await req.text();

  try {
    // Verifies the HMAC *and* rejects timestamps outside Svix's tolerance
    // window, which is the first half of replay protection. Throws on any
    // failure; in svix 2.x it validates only and returns nothing, so the
    // payload is parsed separately below — after verification, never before.
    new Webhook(secret).verify(payload, {
      [SVIX_ID]: svixId,
      [SVIX_TIMESTAMP]: svixTimestamp,
      [SVIX_SIGNATURE]: svixSignature,
    });
  } catch {
    return json({ error: "Invalid signature" }, 401);
  }

  let event: ClerkUserEvent;
  try {
    event = JSON.parse(payload) as ClerkUserEvent;
  } catch {
    return json({ error: "Malformed payload" }, 400);
  }
  if (typeof event?.type !== "string" || typeof event?.data?.id !== "string") {
    return json({ error: "Malformed payload" }, 400);
  }

  // Second half of replay protection, and the part that matters for retries:
  // Svix re-delivers on any non-2xx, reusing the same `svix-id`. Insert first
  // and let the primary key decide — `onConflictDoNothing ... returning` is
  // atomic, so two concurrent retries cannot both win. A check-then-act read
  // would let both through.
  const claimed = await db
    .insert(webhookEvents)
    .values({ id: svixId, eventType: event.type })
    .onConflictDoNothing({ target: webhookEvents.id })
    .returning({ id: webhookEvents.id });
  if (claimed.length === 0) {
    // Already processed. 200 so Svix stops retrying.
    return json({ ok: true, duplicate: true }, 200);
  }

  try {
    await handle(event);
  } catch (error) {
    // Give the row back so Svix's retry can actually retry, rather than
    // hitting the duplicate guard and silently succeeding forever.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, svixId));
    console.error("clerk webhook: handler failed", { type: event.type, error });
    return json({ error: "Handler failed" }, 500);
  }

  return json({ ok: true }, 200);
}

async function handle(event: ClerkUserEvent): Promise<void> {
  const { type, data } = event;
  if (type === "user.deleted") {
    await deleteUserProfile(data.id);
    return;
  }
  if (type !== "user.created" && type !== "user.updated") return; // Not ours; acknowledged above.

  const email =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ??
    data.email_addresses?.[0]?.email_address ??
    null;
  await upsertUserProfile({
    userId: data.id,
    name: data.first_name || data.username || null,
    email,
    imageUrl: data.image_url ?? null,
  });
}
