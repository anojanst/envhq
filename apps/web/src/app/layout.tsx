import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ClerkThemeProvider } from "@/components/clerk-theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://envhq.dev"),
  title: {
    default: "EnvHQ — sync your environment variables",
    template: "%s · EnvHQ",
  },
  description:
    "Store, organize, and sync your environment variables. Group secrets by project and environment, encrypted at rest, and push or pull from your terminal.",
  applicationName: "EnvHQ",
  openGraph: {
    title: "EnvHQ — sync your environment variables",
    description:
      "Store, organize, and sync your environment variables. Encrypted at rest, CLI-native.",
    url: "https://envhq.dev",
    siteName: "EnvHQ",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EnvHQ — sync your environment variables",
    description: "Store, organize, and sync your environment variables. CLI-native.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ClerkThemeProvider>
            {children}
            <Toaster />
          </ClerkThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
