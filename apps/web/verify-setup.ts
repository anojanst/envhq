import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { projects, environments, apiTokens } = await import("@/db/schema");
  const { generateToken, hashToken } = await import("@/lib/crypto");

  const userId = "verify-m4-pr4-user";
  const [project] = await db
    .insert(projects)
    .values({ userId, name: `verify-m4-pr4-${Date.now()}` })
    .returning();
  const [environment] = await db
    .insert(environments)
    .values({ projectId: project.id, name: "dev" })
    .returning();

  const token = generateToken();
  await db.insert(apiTokens).values({
    userId,
    name: "verify-script",
    tokenHash: hashToken(token),
    kind: "pat",
    capability: "write",
  });

  console.log(JSON.stringify({ projectId: project.id, environmentId: environment.id, token }));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
