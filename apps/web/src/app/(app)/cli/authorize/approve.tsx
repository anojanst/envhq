"use client";

import { useState } from "react";
import { Terminal, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { api } from "@/lib/client";

/**
 * Approval step of the CLI browser-login. On approve we ask the server for a
 * one-time code, then redirect the browser to the CLI's loopback listener so it
 * can exchange the code (with its PKCE verifier) for a real token. The token
 * itself never touches the browser.
 */
export function ApproveCliLogin({
  port,
  state,
  challenge,
}: {
  port?: string;
  state?: string;
  challenge?: string;
}) {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const portNum = Number(port);
  const valid =
    Number.isInteger(portNum) && portNum > 0 && portNum <= 65535 && !!state && !!challenge;

  function redirectToLoopback(params: Record<string, string>) {
    const url = new URL(`http://127.0.0.1:${portNum}/callback`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    window.location.href = url.toString();
  }

  async function approve() {
    setStatus("working");
    try {
      const { code } = await api<{ code: string }>("/api/cli/authorize", {
        method: "POST",
        body: { port: portNum, state, codeChallenge: challenge },
      });
      setStatus("done");
      redirectToLoopback({ code, state: state! });
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function deny() {
    redirectToLoopback({ error: "access_denied", state: state ?? "" });
  }

  if (!valid) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Invalid login request</CardTitle>
          <CardDescription>
            This link is missing required parameters. Re-run{" "}
            <code className="rounded bg-muted px-1 py-0.5">envhq login</code> from your terminal.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Terminal className="size-5" />
        </div>
        <CardTitle>Authorize the EnvHQ CLI</CardTitle>
        <CardDescription>
          A CLI on this machine is requesting access to your EnvHQ account. Approve it only if
          you just started <code className="rounded bg-muted px-1 py-0.5">envhq login</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          <span>Grants a token that expires in 7 days.</span>
        </div>
        <div className="flex items-center gap-2">
          <Terminal className="size-4 shrink-0" />
          <span>
            Listening on <code className="rounded bg-muted px-1 py-0.5">127.0.0.1:{portNum}</code>
          </span>
        </div>
        {status === "done" && (
          <p className="pt-1 text-primary">Approved — return to your terminal.</p>
        )}
        {status === "error" && message && <p className="pt-1 text-destructive">{message}</p>}
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={approve} disabled={status === "working" || status === "done"}>
          {status === "working" ? "Authorizing…" : "Authorize"}
        </Button>
        <Button variant="outline" onClick={deny} disabled={status === "working"}>
          Cancel
        </Button>
      </CardFooter>
    </Card>
  );
}
