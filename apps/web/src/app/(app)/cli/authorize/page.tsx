import { ApproveCliLogin } from "./approve";

// Session-protected (it lives under the (app) group). Clerk guarantees a signed-
// in user here, so approving simply binds that user to the CLI's login request.
export default async function CliAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ port?: string; state?: string; challenge?: string }>;
}) {
  const { port, state, challenge } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center p-6">
      <ApproveCliLogin port={port} state={state} challenge={challenge} />
    </div>
  );
}
