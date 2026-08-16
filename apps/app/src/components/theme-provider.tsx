import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "envhq-theme";

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(
  null,
);

/**
 * Hand-rolled replacement for next-themes (no server runtime to coordinate
 * with here). No `enableSystem` support — matches today's
 * `enableSystem={false}` behavior, so there's no `resolvedTheme`/
 * `systemTheme` split to carry over.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "light",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = (next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
