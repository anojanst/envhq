import type { Metadata } from "next";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { DocsNav } from "@/components/docs-nav";

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s · EnvHQ Docs",
  },
  description: "Documentation for the EnvHQ web app and envhq CLI.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col">
      <PublicHeader />

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-6 pb-10 pt-4">
        <aside className="hidden w-48 shrink-0 sm:block">
          <div className="sticky top-24">
            <DocsNav />
          </div>
        </aside>

        <div className="min-w-0 flex-1 pb-12">{children}</div>
      </div>

      <PublicFooter />
    </main>
  );
}
