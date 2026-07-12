import { getUserId } from "@/lib/auth";
import { getOwnedEnvironment } from "@/lib/access";
import { listVersions } from "@/lib/version-store";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Version history (CLI `envhq history`) — a read, same as export, no isReadOnly gate.
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id, scope);
  if (!owned) return notFound("Environment not found");

  const versions = await listVersions(id);
  return json({ versions });
}
