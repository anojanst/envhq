import { getUserId } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/access";
import { getRotationStatus } from "@/lib/project-keys";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Current DEK generation + whether a rotation is recommended/in progress (DEK rotation on revoke). Admin-only, same surface as the rest of `/keys/*`. */
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const status = await getRotationStatus(id);
  if (!status) return notFound("Project not found");

  return json(status);
}
