import { Component, type ReactNode } from "react";

/**
 * React error boundaries must be class components — no hook equivalent
 * exists. Wraps the whole app so a render-time crash (e.g. `ClerkProvider`
 * throwing on a missing/malformed `VITE_CLERK_PUBLISHABLE_KEY`, which it
 * does synchronously) shows the actual error instead of unmounting to a
 * silent blank screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
          <h1 className="text-lg font-semibold text-destructive">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
