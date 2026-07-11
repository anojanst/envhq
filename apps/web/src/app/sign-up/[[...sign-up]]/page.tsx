import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start storing and syncing your environment variables in minutes."
    >
      <SignUp />
    </AuthShell>
  );
}
