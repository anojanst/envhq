"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { useTheme } from "next-themes";

/**
 * Wraps Clerk's provider so its hosted components (SignIn, SignUp, UserButton)
 * follow the app's active theme and emerald brand instead of Clerk's default
 * light look. Values mirror the design tokens in `globals.css`. Must render
 * inside `ThemeProvider` (next-themes) so `useTheme` resolves.
 */
export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <ClerkProvider
      appearance={{
        variables: {
          // emerald --brand, per theme
          colorPrimary: dark ? "oklch(0.72 0.15 162)" : "oklch(0.62 0.14 163)",
          borderRadius: "0.625rem",
          fontFamily: "var(--font-geist-sans)",
          ...(dark
            ? {
                colorBackground: "oklch(0.205 0 0)",
                colorInputBackground: "oklch(0.269 0 0)",
                colorText: "oklch(0.985 0 0)",
                colorInputText: "oklch(0.985 0 0)",
                colorTextSecondary: "oklch(0.708 0 0)",
                colorNeutral: "oklch(0.985 0 0)",
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
