import { spawn } from "node:child_process";
import { credentialMasks, plan, readInputs } from "./action.ts";

/**
 * Entry point GitHub runs. The CLI writes masks, GITHUB_ENV and
 * GITHUB_OUTPUT itself — it inherits this process's stdout and the runner's
 * file-command paths — so this only launches it and reports the outcome.
 */
const inputs = readInputs(process.env);
for (const line of credentialMasks(inputs)) console.log(line);

const invocation = plan(inputs, process.env, process.platform);
if ("errors" in invocation) {
  for (const e of invocation.errors) console.log(`::error::${e}`);
  process.exit(1);
}

const child = spawn(invocation.command, invocation.args, {
  stdio: "inherit",
  env: invocation.env,
  shell: invocation.shell,
});

child.on("error", (err) => {
  console.log(`::error::Couldn't start npx (${err.message}). This action needs Node.js and npm on the runner — add actions/setup-node first.`);
  process.exit(1);
});

child.on("exit", (code) => {
  if (code !== 0) {
    // Loud on purpose: the CLI's own message is in the log above; this puts
    // a failure annotation on the run summary so nobody misses it.
    console.log(
      `::error::EnvHQ couldn't load ${inputs.project}/${inputs.environment}. The step's log says why. ` +
        "No variables were exported, so later steps would have run without them.",
    );
  }
  process.exit(code ?? 1);
});
