"use strict";

// src/index.ts
var import_node_child_process = require("child_process");

// src/action.ts
var CLI_VERSION = "0.11.0";
var FORMATS = { env: "github-env", outputs: "github-output", dotenv: "dotenv" };
function readInputs(env) {
  const get = (name) => (env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
  return {
    token: get("token"),
    key: get("key"),
    project: get("project"),
    environment: get("environment"),
    format: get("format") || "env",
    mask: get("mask") || "true",
    path: get("path") || ".env",
    required: get("required")
  };
}
function plan(inputs2, base, platform) {
  const errors = [];
  if (!inputs2.token) errors.push("`token` is required \u2014 pass the deploy key's API token, e.g. ${{ secrets.ENVHQ_TOKEN }}.");
  if (!inputs2.key) errors.push("`key` is required \u2014 pass the deploy key, e.g. ${{ secrets.ENVHQ_DEPLOY_KEY }}.");
  if (!inputs2.project) errors.push("`project` is required.");
  if (!inputs2.environment) errors.push("`environment` is required.");
  if (!(inputs2.format in FORMATS)) errors.push(`\`format\` must be one of: ${Object.keys(FORMATS).join(", ")}.`);
  const mask = inputs2.mask.toLowerCase();
  if (mask !== "true" && mask !== "false") errors.push("`mask` must be true or false.");
  if (inputs2.format === "dotenv" && !/^[\w./\\:-]+$/.test(inputs2.path)) {
    errors.push("`path` may only contain letters, digits and . / \\ : _ -");
  }
  if (errors.length > 0) return { errors };
  const args = ["--yes", `envhq@${CLI_VERSION}`, "export", "--format", FORMATS[inputs2.format]];
  if (inputs2.format === "dotenv") args.push("--output", inputs2.path);
  if (mask === "false") args.push("--no-mask");
  return {
    command: platform === "win32" ? "npx.cmd" : "npx",
    args,
    // Everything user-supplied travels as environment, never as a command
    // line: nothing in a project name can be interpreted by a shell, and
    // the secrets never appear in a process listing.
    env: {
      ...base,
      ENVHQ_TOKEN: inputs2.token,
      ENVHQ_DEPLOY_KEY: inputs2.key,
      ENVHQ_PROJECT: inputs2.project,
      ENVHQ_ENVIRONMENT: inputs2.environment,
      // Only when given: an ENVHQ_REQUIRE set on the job still applies otherwise.
      ...inputs2.required ? { ENVHQ_REQUIRE: inputs2.required } : {},
      npm_config_update_notifier: "false",
      npm_config_fund: "false"
    },
    shell: platform === "win32"
  };
}
function credentialMasks(inputs2) {
  return [inputs2.token, inputs2.key].filter(Boolean).map((v) => `::add-mask::${v}`);
}

// src/index.ts
var inputs = readInputs(process.env);
for (const line of credentialMasks(inputs)) console.log(line);
var invocation = plan(inputs, process.env, process.platform);
if ("errors" in invocation) {
  for (const e of invocation.errors) console.log(`::error::${e}`);
  process.exit(1);
}
var child = (0, import_node_child_process.spawn)(invocation.command, invocation.args, {
  stdio: "inherit",
  env: invocation.env,
  shell: invocation.shell
});
child.on("error", (err) => {
  console.log(`::error::Couldn't start npx (${err.message}). This action needs Node.js and npm on the runner \u2014 add actions/setup-node first.`);
  process.exit(1);
});
child.on("exit", (code) => {
  if (code !== 0) {
    console.log(
      `::error::EnvHQ couldn't load ${inputs.project}/${inputs.environment}. The step's log says why. No variables were exported, so later steps would have run without them.`
    );
  }
  process.exit(code ?? 1);
});
