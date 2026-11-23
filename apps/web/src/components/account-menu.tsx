"use client";

import { useRef } from "react";
import { LogOut, Users } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AccountUser {
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

function initials(user: AccountUser): string {
  const source = user.name || user.email || "?";
  return (
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

/**
 * The signed-in person, and the way out. Sign-out is a POST (a GET would let
 * any page log you out with an <img>), so the menu item submits a real form.
 */
export function AccountMenu({ user }: { user: AccountUser }) {
  const signOut = useRef<HTMLFormElement>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Account"
        >
          <Avatar className="size-7">
            {user.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">{initials(user)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{user.name || "Signed in"}</span>
              {user.email ? <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span> : null}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/teams" />}>
            <Users className="size-4" /> Teams
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut.current?.requestSubmit()}>
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form ref={signOut} action="/auth/sign-out" method="post" hidden />
    </>
  );
}
