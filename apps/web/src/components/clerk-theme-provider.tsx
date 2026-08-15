"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

/** Logged-out routes that commit to dark via the `.public-dark` scope. */
const PUBLIC_DARK_ROUTES = ["/sign-in", "/sign-up"];

/**
 * Wraps Clerk's provider so its hosted components (SignIn, SignUp, UserButton)
 * follow the emerald brand instead of Clerk's default light look. Must render
 * inside `ThemeProvider` (next-themes) so `useTheme` resolves.
 *
 * Clerk renders its own markup with its own variables, so it cannot inherit the
 * `.public-dark` CSS scope the way the rest of the page does. Left alone it
 * would put a light card in the middle of a dark auth page, so the auth routes
 * force dark here. Inside the app it still follows the user's chosen theme.
 */
export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  const onPublicDarkRoute = PUBLIC_DARK_ROUTES.some((route) =>
    pathname?.startsWith(route),
  );
  const dark = onPublicDarkRoute || resolvedTheme === "dark";

  return (
    <ClerkProvider
      appearance={{
        variables: {
          // emerald --brand, per theme
          colorPrimary: dark ? "oklch(0.74 0.15 162)" : "oklch(0.62 0.14 163)",
          borderRadius: "0.625rem",
          fontFamily: "var(--font-geist-sans)",
          ...(dark
            ? {
                // Mirrors the `.public-dark` tokens in globals.css: the cool
                // blue-black ground, not the neutral charcoal these used to be.
                colorBackground: "oklch(0.185 0.016 262)",
                colorInputBackground: "oklch(0.22 0.016 262)",
                colorText: "oklch(0.93 0.003 262)",
                colorInputText: "oklch(0.93 0.003 262)",
                colorTextSecondary: "oklch(0.71 0.024 265)",
                colorNeutral: "oklch(0.93 0.003 262)",
              }
            : {}),
        },
        elements: {
          // the app already frames the widget; drop Clerk's heavy card chrome
          cardBox: "shadow-lg border border-border",
          card: "shadow-none bg-transparent",
          headerTitle: "tracking-tight",
          socialButtonsBlockButton: "border-border",
          formButtonPrimary:
            "shadow-none hover:opacity-90 transition-opacity text-sm normal-case",
          footerActionLink: "text-brand hover:text-brand/80",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
