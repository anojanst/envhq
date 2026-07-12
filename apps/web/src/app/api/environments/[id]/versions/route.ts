import { getUserId, resolveDisplayNames } from "@/lib/auth";
import { getAccessibleEnvironment } from "@/lib/access";
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

  const owned = await getAccessibleEnvironment(userId, id, "viewer", scope);
  if (!owned) return notFound("Environment not found");

  const versions = await listVersions(id);
  const names = await resolveDisplayNames(versions.map((v) => v.createdBy));
  return json({
    versions: versions.map((v) => ({ ...v, createdByName: names[v.createdBy] })),
  });
}
