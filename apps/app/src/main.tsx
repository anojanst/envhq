import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import "./theme-init";
import "./globals.css";
import { ThemeProvider } from "./components/theme-provider";
import { ClerkThemeProvider } from "./components/clerk-theme-provider";
import { ErrorBoundary } from "./components/error-boundary";
import { Toaster } from "./components/ui/sonner";
import { router } from "./router";

/** Auth-gates and mounts the router once Clerk has resolved its session. */
function InnerApp() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <RouterProvider router={router} context={{ auth: { isLoaded, isSignedIn: !!isSignedIn } }} />
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ClerkThemeProvider>
          <InnerApp />
        </ClerkThemeProvider>
        <Toaster />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
