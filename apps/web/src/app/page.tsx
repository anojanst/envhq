import Image from "next/image";
import Link from "next/link";
// Imported rather than referenced from /public so the emitted URL carries a
// content hash: swapping the artwork changes the URL, which busts the Next
// image cache and any browser or CDN copy. A fixed /public path does not, and
// silently keeps serving the previous render.
import heroArtwork from "@/assets/hero-encrypted-secrets.jpg";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  ClipboardPaste,
  FolderTree,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { CopyCommand } from "@/components/landing/copy-command";
import { EnvPreview } from "@/components/landing/env-preview";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Hero quickstart: nothing to a pushed environment in three commands. This is
// the only place on the page that lists commands to run.
const HERO_QUICKSTART = [
  {
    command: "npm install -g envhq",
    description: "Node 20 or newer.",
  },
  {
    command: "envhq login",
    description: "Approve once in your browser.",
  },
  {
    command: "envhq push prod",
    description: "Encrypt locally, upload as a version.",
  },
];

// A diff-then-push session. Both output formats are the CLI's own, taken from
// packages/cli/src/index.ts, including the ~ / + / - markers diff prints.
const SESSION = `$ envhq diff prod
prod:
  ~ DATABASE_URL
  + SENTRY_DSN
  - LEGACY_API_KEY
  2 to push, 1 to delete.

$ envhq push prod
✔ Pushed to prod (v9): 1 new, 1 updated, 1 deleted.`;

// The refusal path, in the CLI's own wording (the 409 branch of push).
const CONFLICT = `$ envhq push prod
✖ prod has moved to version 9 since your last read. Conflicting keys:
  DATABASE_URL: yours="…:5432/orders", server="…:5433/orders"`;

// The three things that make a sync tool safe to point at production. All
// three are real behaviours in packages/cli/src/index.ts, not reassurances.
const PUSH_GUARANTEES = [
  {
    term: "Nothing disappears quietly",
    detail:
      "A key is only dropped remotely if you deleted it locally and nobody changed it since. Even then, push stops and asks.",
  },
  {
    term: "Prod asks twice",
    detail:
      "Any environment named prod gets its own confirmation before anything lands, because the blast radius is not the same everywhere.",
  },
  {
    term: "Pull keeps what it replaced",
    detail:
      "Your previous file is written to .env.bak before a pull overwrites it, and local keys the server has never seen are merged forward rather than dropped.",
  },
];

// The vars table as the server holds it. Six rows rather than one field list:
// it makes the same point six times, and it gives the panel enough height to
// stand beside a four-line headline instead of leaving a void underneath.
// Every ciphertext is truncated to one line, so none of them orphan a stray
// character onto a second.
const SERVER_ROWS = [
  { key: "DATABASE_URL", cipher: "qF8xK2mQ9vTn4pLc7W…" },
  { key: "REDIS_URL", cipher: "bW9cH3vAe8Nk2QtL6y…" },
  { key: "SENTRY_DSN", cipher: "8nR4dLp2XwYh6BsjN0…" },
  { key: "SESSION_SECRET", cipher: "mT7yUq1KeGf0VdRxP5…" },
  { key: "SMTP_PASSWORD", cipher: "zC5oJ9fBi3Hu7MwEa2…" },
  { key: "STRIPE_SECRET_KEY", cipher: "vD6sN8gYr4Ol1PjXt9…" },
];

// Six facts in three groups rather than nine flat tiles. Framed around what a
// database leak would actually yield, so each one is evidence for a question
// instead of an item on a spec sheet. Client-side storage details (OS keychain,
// loopback PKCE) were cut as off-frame: this section is about the server.
const SECURITY_GROUPS = [
  {
    label: "Encryption",
    facts: [
      {
        term: "XChaCha20-Poly1305",
        detail:
          "Every value is sealed client-side under a key belonging to its project. The server is never handed plaintext to store.",
      },
      {
        term: "Argon2id",
        detail:
          "Your passphrase derives the key that unwraps your X25519 keypair, and that derivation happens on your device every time.",
      },
    ],
  },
  {
    label: "Access",
    facts: [
      {
        term: "Scoped grants",
        detail:
          "Viewer, Editor or Admin on a project, capped per environment. Being authorized and being able to decrypt stay separate problems.",
      },
      {
        term: "Not found, not forbidden",
        detail:
          "A project you cannot reach returns not found. A stranger and a Viewer probing it learn exactly the same amount about what exists.",
      },
    ],
  },
  {
    label: "Credentials",
    facts: [
      {
        term: "Hashed tokens",
        detail:
          "CLI tokens are stored as a SHA-256 hash, so a copy of the database cannot be turned back into a working one.",
      },
      {
        term: "Recovery phrase",
        detail:
          "A printable phrase wraps your keypair a second, independent way. Lose it and your passphrase and the data is gone for everyone, us included.",
      },
    ],
  },
];

// The close is where the limits belong. Every one of these is unanswered
// elsewhere on the page, and the "no" answers stay "no" because volunteering
// them is what makes the rest of the page believable.
const FAQ = [
  {
    q: "Is it actually free?",
    a: "Yes, today. Paid plans may arrive as it grows, but nothing is behind a wall right now and no card is asked for.",
  },
  {
    q: "How do I get my secrets back out?",
    a: "Run envhq pull to write an environment to a file, or copy a whole environment out as .env from the app. Nothing is locked in.",
  },
  {
    q: "What if I forget my passphrase?",
    a: "Unlock with the recovery phrase shown once at setup. Lose both and the data is gone for good, including for us. That is the cost of holding no usable key.",
  },
  {
    q: "If I delete a whole environment or project?",
    a: "That one is permanent. Version history covers changes to variables inside an environment, not deleting the container they live in.",
  },
  {
    q: "Is there an uptime or support guarantee?",
    a: "No. EnvHQ is offered best effort today, with no SLA. Keep an independent backup of anything you genuinely cannot lose.",
  },
  {
    q: "Where is my data hosted?",
    a: "A managed Postgres database on Neon, with authentication handled by Clerk. Values sit there encrypted, as ciphertext.",
  },
];

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="landing-dark flex flex-1 flex-col bg-background text-foreground">
      <PublicHeader />

      {/* Hero: copy on the left, the brand artwork on the right.
          Sized against the header so header plus hero is exactly one screen. */}
      <section className="relative flex min-h-[calc(100dvh-5rem)] flex-col justify-center overflow-x-clip py-12">
        {/* Two lights, not one. The ambient wash sits behind the artwork at top
            right; a second, tighter source under the command rail lifts it off
            the ground so the hero reads as layers rather than one flat plane. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-[-14rem] right-[-8rem] -z-10 size-[38rem] rounded-full bg-brand/10 blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[-6rem] left-[-4rem] -z-10 size-[26rem] rounded-full bg-brand/[0.07] blur-[100px]"
        />

        <div className="mx-auto grid w-full max-w-[1320px] items-center gap-12 px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            {/* The headline names the reader's actual habit rather than a
                security abstraction. The trust argument then lands in the
                first clause of the subhead, where it answers the question the
                headline provokes: why give a free tool your prod secrets. */}
            {/* Both tags stay quiet: the hero's emerald budget is already spent
                on the headline payoff, the CTA and every command in the rail,
                so a filled accent tag here would be the fourth thing competing
                for the same attention. */}
            <div className="flex flex-wrap items-center gap-2 motion-safe:animate-rise">
              <span className="notch inline-flex items-center bg-white/[0.06] px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-foreground/80 uppercase">
                CLI-first
              </span>
              <span className="notch inline-flex items-center bg-brand/10 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-brand uppercase">
                Zero-knowledge encryption
              </span>
            </div>

            {/* Two blocks rather than one wrapped line, so the payoff always
                gets its own line instead of trailing after "thread". Balancing
                is applied per block, which keeps the setup evenly split. */}
            <h1
              className="display-type mt-6 text-[2.5rem] sm:text-[3.25rem] lg:text-[4.25rem] motion-safe:animate-rise"
              style={{ animationDelay: "60ms" }}
            >
              <span className="block">Losing your .env in a Slack thread</span>
              <span className="block text-brand">ends now</span>
            </h1>

            <p
              className="mt-6 max-w-[52ch] text-base text-pretty text-muted-foreground sm:text-lg motion-safe:animate-rise"
              style={{ animationDelay: "120ms" }}
            >
              Encrypted on your machine, so we only ever store ciphertext. One{" "}
              <code className="font-mono text-foreground">envhq pull</code> and your whole team
              is in sync.
            </p>

            <div
              className="mt-8 flex flex-wrap items-center gap-3 motion-safe:animate-rise"
              style={{ animationDelay: "180ms" }}
            >
              <Button
                size="lg"
                className="notch h-11 px-5 focus-visible:ring-inset"
                nativeButton={false}
                render={<Link href="/sign-up" />}
              >
                Create your first project
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 px-5"
                nativeButton={false}
                render={<Link href="/docs/security" />}
              >
                See how the encryption works
              </Button>
            </div>
          </div>

          {/* Desktop only. Below lg the hero is the headline, the CTAs and the
              quickstart, which is the stronger small-screen story anyway. */}
          <div
            className="hidden motion-safe:animate-rise lg:block lg:pl-4"
            style={{ animationDelay: "240ms" }}
          >
            {/* Edges are masked rather than butted against the page: the
                artwork carries its own ground, and a hard square meeting the
                surface reads as a pasted-in box however close the two blacks
                are. Corners drop entirely, outer labels stay opaque.

                `sizes` falls to 1px below the same 1024px breakpoint that
                hides it. `priority` emits a preload link that CSS cannot
                cancel, so without this a phone would download an image it
                never shows. Desktop is unaffected: the first condition wins
                there and still preloads the real thing. */}
            <Image
              src={heroArtwork}
              alt="A glowing padlock and key at the centre of a circuit board, with environment variable names such as DB_PASSWORD, SECRET_TOKEN_V3 and CERT_PEM traced into it along wire paths."
              priority
              placeholder="blur"
              sizes="(min-width: 1024px) 53vw, 1px"
              className="h-auto w-full lg:scale-[1.15] [mask-image:radial-gradient(closest-side,black_82%,transparent_100%)]"
            />
          </div>
        </div>

        {/* The quickstart, anchoring the bottom of the hero. Three commands is
            the whole arc from nothing to a pushed environment, and it is the
            one thing a developer can act on without signing up first. Each
            tile carries an inner top highlight so it reads as a lit surface
            sitting above the page rather than a hole cut into it. */}
        <ul
          className="mx-auto mt-14 grid w-full max-w-[1320px] gap-3 px-6 motion-safe:animate-rise sm:grid-cols-3"
          style={{ animationDelay: "300ms" }}
        >
          {HERO_QUICKSTART.map(({ command, description }) => (
            <li
              key={command}
              className="lift rounded-xl bg-white/[0.04]"
            >
              <CopyCommand
                command={command}
                description={description}
                className="rounded-xl hover:bg-white/[0.03]"
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Terminal: not another command list. The hero already showed what to
          type; this section answers the thing that actually stops people from
          pointing a sync tool at production, which is "what will it destroy". */}
      <section className="relative flex min-h-dvh flex-col justify-center overflow-x-clip py-12">
        {/* A large ground plane. Bigger cells than the security section's grid
            and masked toward the right, so it is densest behind the two lifted
            code panels: that is what makes them read as floating above
            something rather than sitting on a flat void.

            The line colour is set directly rather than inherited from
            --color-border, which is white at 9% and was being multiplied down
            to roughly 5% by a wrapper opacity. Tune the 17% here. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.17)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.17)_1px,transparent_1px)] [background-size:154px_154px] [mask-image:radial-gradient(75%_65%_at_68%_50%,black,transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-[-6rem] -z-10 size-[30rem] -translate-y-1/2 rounded-full bg-brand/[0.07] blur-[110px]"
        />

        <div className="relative mx-auto grid w-full max-w-[1320px] items-start gap-12 px-6 lg:grid-cols-12 lg:gap-14">
          <div className="reveal lg:col-span-6">
            <h2 className="display-type text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
              Push without holding your breath
            </h2>
            <p className="mt-6 max-w-[52ch] text-lg text-pretty text-muted-foreground">
              Sync is a three-way merge against the last state you and the server agreed on. It
              adds, it updates, and it stops to ask before it removes.
            </p>

            <dl className="mt-14 space-y-12">
              {PUSH_GUARANTEES.map(({ term, detail }) => (
                <div key={term}>
                  <dt className="text-lg font-medium">{term}</dt>
                  <dd className="mt-2.5 max-w-[52ch] text-pretty text-muted-foreground">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="reveal [--reveal-start:13%] space-y-4 lg:col-span-6">
            <pre className="lift rounded-xl bg-white/[0.04] p-8 font-mono text-sm leading-8 whitespace-pre-wrap text-brand">
              <code>{SESSION}</code>
            </pre>
            <pre className="lift rounded-xl bg-white/[0.04] p-8 font-mono text-sm leading-8 whitespace-pre-wrap text-muted-foreground">
              <code>{CONFLICT}</code>
            </pre>
            <p className="text-sm text-muted-foreground">
              Both are the CLI&apos;s own output. The second wrote nothing: your file and the
              server stay untouched until you decide.
            </p>
          </div>
        </div>
      </section>

      {/* Security: the section a security-minded reader actually stops on.
          Framed as a threat model rather than a feature list, so the facts read
          as an answer to "what would a breach get you" instead of a spec sheet. */}
      <section className="relative flex min-h-dvh flex-col justify-center py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.17)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.17)_1px,transparent_1px)] [background-size:154px_154px] [mask-image:radial-gradient(70%_65%_at_50%_10%,black,transparent)]"
        />

        <div className="relative mx-auto w-full max-w-[1320px] px-6">
          <div className="reveal flex flex-wrap items-start justify-between gap-10">
            <div>
              {/* A statement of capability, not a hypothetical. An earlier
                  draft opened "assume the database leaks", which made the
                  threat the subject and asked the reader to picture a breach
                  before hearing the answer. This states what is true and
                  extends it to an attacker, so the confidence comes first.
                  The subhead still volunteers the limitation: key names are
                  readable, and saying so is what makes the rest credible. */}
              <h2 className="display-type max-w-[20ch] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
                <span className="block">We cannot read your values</span>
                <span className="block text-brand">Neither can anyone who takes them</span>
              </h2>
              <p className="mt-6 max-w-[60ch] text-lg text-pretty text-muted-foreground">
                A copy of the database holds ciphertext, SHA-256 token hashes, and the names of
                your projects and variables. Not one value anyone can open.
              </p>

              <Link
                href="/docs/security"
                className="group/link mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Read the security model
                <ArrowRight className="size-4 transition-transform duration-200 ease-fluid group-hover/link:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            </div>

            {/* Fills the space beside the headline with evidence rather than a
                decorative glyph: the reader can see for themselves which
                columns are legible and which one is not. */}
            <div className="lift w-full max-w-md rounded-xl bg-white/[0.04] p-6">
              <p className="font-mono text-xs">
                <span className="text-foreground">orders-api</span>
                <span className="text-muted-foreground"> / prod</span>
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Names legible, values not. This is the whole row.
              </p>
              <dl className="mt-6 space-y-4 font-mono text-sm">
                {SERVER_ROWS.map(({ key, cipher }) => (
                  <div key={key} className="flex items-baseline gap-4">
                    <dt className="w-40 shrink-0 truncate text-foreground">{key}</dt>
                    <dd className="min-w-0 truncate text-brand">{cipher}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="reveal [--reveal-start:13%] mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY_GROUPS.map(({ label, facts }) => (
              <div key={label}>
                <h3 className="text-sm font-medium">{label}</h3>
                <dl className="mt-4 space-y-4">
                  {facts.map(({ term, detail }) => (
                    <div
                      key={term}
                      className="lift rounded-xl bg-white/[0.04] p-7 transition-colors duration-200 ease-fluid hover:bg-white/[0.06]"
                    >
                      <dt className="font-mono text-sm font-medium text-brand">{term}</dt>
                      <dd className="mt-3 text-[0.9375rem] text-pretty text-muted-foreground">
                        {detail}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities: four tiles, sized by how much each has to show. Sequenced
          off the previous section, because the argument here is that there is a
          product around the CLI rather than a sync script. */}
      <section className="relative flex min-h-dvh flex-col justify-center py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.17)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.17)_1px,transparent_1px)] [background-size:154px_154px] [mask-image:radial-gradient(70%_60%_at_50%_100%,black,transparent)]"
        />

        <div className="relative mx-auto w-full max-w-[1320px] px-6">
          <div className="reveal">
            <h2 className="display-type max-w-[20ch] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
              Everything after the first push
            </h2>
            <p className="mt-6 max-w-[62ch] text-lg text-pretty text-muted-foreground">
              A project holds environments, an environment holds versions, and nothing you did
              last month is unrecoverable.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <div className="reveal lg:col-span-2">
              <article className="relative h-full overflow-hidden rounded-xl bg-white/[0.04] bg-linear-to-br from-brand/15 via-transparent to-transparent lift p-6 transition-colors duration-200 ease-fluid hover:bg-white/[0.06]">
                <div className="flex items-start gap-2.5">
                  <FolderTree className="size-7 shrink-0 text-brand" aria-hidden />
                  <h3 className="text-xl font-medium">
                    Unlimited environments under every project
                  </h3>
                </div>
                <p className="mt-3 max-w-[46ch] text-[0.9375rem] text-muted-foreground">
                  dev, qa, staging, uat, prod, and whatever else your team actually runs.
                </p>
                {/* The real editor, not a picture of it: switching environment
                    and revealing a value both work. */}
                <EnvPreview className="mt-6" />
              </article>
            </div>

            <div className="reveal [--reveal-start:11%]">
              <article className="h-full rounded-xl bg-white/[0.04] lift p-6 transition-colors duration-200 ease-fluid hover:bg-white/[0.06]">
                <div className="flex items-start gap-2.5">
                  <ArrowUpFromLine className="size-7 shrink-0 text-brand" aria-hidden />
                  <h3 className="text-xl font-medium">Every push is a version</h3>
                </div>
                <p className="mt-3 text-[0.9375rem] text-muted-foreground">
                  Commits are append-only. Restore an earlier one to recover a variable
                  somebody overwrote.
                </p>
                <ul className="mt-6 space-y-2.5 text-xs tabular-nums">
                  {[
                    { version: "v9", note: "1 new, 1 updated, 1 deleted" },
                    { version: "v8", note: "2 new, 1 updated" },
                    { version: "v7", note: "rolled back to v5" },
                    { version: "v6", note: "4 updated" },
                    { version: "v5", note: "1 new" },
                    { version: "v4", note: "12 new" },
                    { version: "v3", note: "2 updated" },
                    { version: "v2", note: "1 new, 3 updated" },
                  ].map(({ version, note }) => (
                    <li key={version} className="flex items-baseline gap-3">
                      <span className="font-mono font-medium text-brand">{version}</span>
                      <span className="text-muted-foreground">{note}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <div className="reveal [--reveal-start:17%]">
              <article className="h-full rounded-xl bg-white/[0.04] lift p-6 transition-colors duration-200 ease-fluid hover:bg-white/[0.06]">
                <div className="flex items-start gap-2.5">
                  <ClipboardPaste className="size-7 shrink-0 text-brand" aria-hidden />
                  <h3 className="text-xl font-medium">Paste a whole .env</h3>
                </div>
                <p className="mt-3 text-[0.9375rem] text-muted-foreground">
                  Bulk-import a file into an environment. It upserts, so an import can only
                  ever add or update.
                </p>
                {/* Same +/~/- vocabulary the CLI diff uses, so the two surfaces
                    describe a change the same way. */}
                <ul className="mt-6 space-y-2 font-mono text-xs">
                  {[
                    { mark: "+", note: "new keys appear", accent: true },
                    { mark: "~", note: "existing keys update", accent: true },
                    { mark: "-", note: "nothing is removed", accent: false },
                  ].map(({ mark, note, accent }) => (
                    <li key={mark} className="flex items-baseline gap-3">
                      <span
                        className={accent ? "w-3 shrink-0 text-brand" : "w-3 shrink-0 text-muted-foreground"}
                      >
                        {mark}
                      </span>
                      <span className="text-muted-foreground">{note}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <div className="reveal [--reveal-start:23%] lg:col-span-2">
              <article className="relative h-full overflow-hidden rounded-xl bg-white/[0.04] lift p-6 transition-colors duration-200 ease-fluid hover:bg-white/[0.06]">
                <div className="relative">
                  <div className="flex items-start gap-2.5">
                    <ArrowDownToLine className="size-7 shrink-0 text-brand" aria-hidden />
                    <h3 className="text-xl font-medium">Tokens made for CI</h3>
                  </div>
                  <p className="mt-3 max-w-[46ch] text-[0.9375rem] text-muted-foreground">
                    Create a token scoped to one project and read-only, drop it into your
                    pipeline, and revoke it whenever you like.
                  </p>
                  <div className="mt-6 inline-flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 font-mono text-xs ring-1 ring-white/8">
                    <span className="text-muted-foreground">ENVHQ_TOKEN=</span>
                    <span>envhq_pat_••••••••••••</span>
                    <Badge variant="outline" className="font-sans">
                      read-only
                    </Badge>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* Close: the CTA earns its screen by carrying the questions a careful
          reader would otherwise leave to go find. */}
      <section className="relative flex min-h-dvh flex-col justify-center overflow-clip py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.17)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.17)_1px,transparent_1px)] [background-size:154px_154px] [mask-image:radial-gradient(65%_60%_at_25%_50%,black,transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[-16rem] left-[-6rem] -z-10 size-[34rem] rounded-full bg-brand/10 blur-[120px]"
        />

        <div className="relative mx-auto grid w-full max-w-[1320px] items-start gap-12 px-6 lg:grid-cols-12 lg:gap-14">
          <div className="reveal lg:col-span-5">
            <h2 className="display-type text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
              Start with one project
            </h2>
            <p className="mt-6 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              Create a project, push your first environment, and pull it back on another
              machine a minute later.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="notch h-11 px-5 focus-visible:ring-inset"
                nativeButton={false}
                render={<Link href="/sign-up" />}
              >
                Create your first project
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 px-5"
                nativeButton={false}
                render={<Link href="/docs/limitations" />}
              >
                Read the limitations
              </Button>
            </div>

            <p className="mt-8 max-w-[46ch] text-xs text-muted-foreground">
              EnvHQ is a free tool. Read the{" "}
              <Link href="/docs/security" className="underline hover:text-foreground">
                security model
              </Link>{" "}
              and the{" "}
              <Link href="/terms" className="underline hover:text-foreground">
                Terms and Conditions
              </Link>{" "}
              before you store production secrets.
            </p>
          </div>

          {/* One open at a time: it keeps the section close to a single screen
              as the reader expands things, and it is what people expect of an
              FAQ. Collapsed, the six rows also sit level with the CTA column
              beside them, which the old open list did not. */}
          <Accordion
            className="reveal [--reveal-start:13%] lg:col-span-7"
            multiple={false}
            defaultValue={[]}
          >
            {FAQ.map(({ q, a }) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-lg font-medium">{q}</AccordionTrigger>
                <AccordionPanel>
                  <p className="max-w-[68ch] text-[0.9375rem] text-pretty text-muted-foreground">
                    {a}
                  </p>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <PublicFooter bordered={false} />
    </main>
  );
}
