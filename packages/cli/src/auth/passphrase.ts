import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

/** Ordinary visible-input prompt (paste-friendly — used for the recovery phrase). */
export async function promptVisible(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// Control characters, spelled out via char codes rather than escape literals
// to avoid any ambiguity about what's actually in this file.
const ENTER_LF = String.fromCharCode(10);
const ENTER_CR = String.fromCharCode(13);
const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const BACKSPACE_DEL = String.fromCharCode(127);
const BACKSPACE_BS = String.fromCharCode(8);

/**
 * Reads a line without echoing it to the terminal (best-effort — falls back
 * to visible input when stdin isn't a TTY, e.g. piped input).
 */
export async function promptHidden(question: string): Promise<string> {
  if (!stdin.isTTY) return promptVisible(question);

  return new Promise((resolve) => {
    stdout.write(question);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);

    let input = "";
    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === ENTER_LF || char === ENTER_CR || char === CTRL_D) {
          cleanup();
          stdout.write("\n");
          resolve(input.trim());
          return;
        }
        if (char === CTRL_C) {
          cleanup();
          stdout.write("\n");
          process.exit(130);
        }
        if (char === BACKSPACE_DEL || char === BACKSPACE_BS) {
          input = input.slice(0, -1);
          continue;
        }
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}
