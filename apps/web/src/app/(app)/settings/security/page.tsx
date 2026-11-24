import { requireSessionUserId } from "@/lib/identity";
import { SecurityManager } from "./security-manager";

export default async function SecurityPage() {
  await requireSessionUserId();

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Your encryption key. It&rsquo;s created and unlocked in this browser; your passphrase and
        private key never reach EnvHQ.
      </p>
      <SecurityManager />
    </div>
  );
}
