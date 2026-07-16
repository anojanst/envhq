import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SecurityManager } from "./security-manager";

export default async function SecurityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">
          Your end-to-end encryption identity. Everything below happens in your browser — your
          passphrase and private key are never sent to EnvHQ.
        </p>
      </div>
      <SecurityManager />
    </div>
  );
}
