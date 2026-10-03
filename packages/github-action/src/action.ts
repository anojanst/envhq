/**
 * The EnvHQ GitHub Action (RM-12) — deliberately thin.
 *
 * Everything that touches a secret value — fetching, unsealing the DEK with
 * the deploy key, decrypting, masking, writing GITHUB_ENV — happens in the
 * published `envhq` CLI's `export` command, at a pinned version. ADR-018:
 * every pipeline integration is a wrapper around one CLI primitive, so the
 * decrypt path exists once and is reviewed once. This file only turns action
 * inputs into that one invocation.
 *
 * Pure apart from `index.ts`, so the tests assert the exact command line.
 */

/**
 * The CLI release this action runs. Exact, never a range: an action version
 * has to mean one specific decrypt implementation, and a compromised or
 * broken `envhq` publish must not reach every pipeline on its next run.
 */
export const CLI_VERSION = "0.10.0";

const FORMATS = { env: "github-env", outputs: "github-output", dotenv: "dotenv" } as const;
type Format = keyof typeof FORMATS;

export interface Inputs {
  token: string;
  key: string;
  project: string;
  environment: string;
  format: string;
  mask: string;
  path: string;
}

/** Action inputs as the runner passes them: `INPUT_<NAME>`, uppercased. */
export function readInputs(env: NodeJS.ProcessEnv): Inputs {
  const get = (name: string) => (env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
  return {
    token: get("token"),
    key: get("key"),
    project: get("project"),
    environment: get("environment"),
    format: get("format") || "env",
    mask: get("mask") || "true",
    path: get("path") || ".env",
  };
}

export interface Invocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  shell: boolean;
}

/**
 * The single `npx envhq@<pinned> export …` call, or the list of problems
 * with the inputs. Nothing runs if any input is wrong: a half-configured
 * pull that "succeeds" leaves a later deploy step running with missing
 * variables, which is worse than a red job.
 */
export function plan(inputs: Inputs, base: NodeJS.ProcessEnv, platform: NodeJS.Platform): Invocation | { errors: string[] } {
  const errors: string[] = [];
  if (!inputs.token) errors.push("`token` is required — pass the deploy key's API token, e.g. ${{ secrets.ENVHQ_TOKEN }}.");
  if (!inputs.key) errors.push("`key` is required — pass the deploy key, e.g. ${{ secrets.ENVHQ_DEPLOY_KEY }}.");
  if (!inputs.project) errors.push("`project` is required.");
  if (!inputs.environment) errors.push("`environment` is required.");
  if (!(inputs.format in FORMATS)) errors.push(`\`format\` must be one of: ${Object.keys(FORMATS).join(", ")}.`);
  const mask = inputs.mask.toLowerCase();
  if (mask !== "true" && mask !== "false") errors.push("`mask` must be true or false.");
  // The one user-supplied value that has to be an argument. Windows starts
  // npx through a shell, so it is held to characters a shell can't act on.
  if (inputs.format === "dotenv" && !/^[\w./\\:-]+$/.test(inputs.path)) {
    errors.push("`path` may only contain letters, digits and . / \\ : _ -");
  }
  if (errors.length > 0) return { errors };

  const args = ["--yes", `envhq@${CLI_VERSION}`, "export", "--format", FORMATS[inputs.format as Format]];
  if (inputs.format === "dotenv") args.push("--output", inputs.path);
  if (mask === "false") args.push("--no-mask");

  return {
    command: platform === "win32" ? "npx.cmd" : "npx",
    args,
    // Everything user-supplied travels as environment, never as a command
    // line: nothing in a project name can be interpreted by a shell, and
    // the secrets never appear in a process listing.
    env: {
      ...base,
      ENVHQ_TOKEN: inputs.token,
      ENVHQ_DEPLOY_KEY: inputs.key,
      ENVHQ_PROJECT: inputs.project,
      ENVHQ_ENVIRONMENT: inputs.environment,
      npm_config_update_notifier: "false",
      npm_config_fund: "false",
    },
    shell: platform === "win32",
  };
}

/**
 * Masks for the two credentials themselves. `secrets.*` are masked by the
 * runner already; this covers a token passed some other way (a variable,
 * an earlier step's output) at no cost.
 */
export function credentialMasks(inputs: Inputs): string[] {
  return [inputs.token, inputs.key].filter(Boolean).map((v) => `::add-mask::${v}`);
}
