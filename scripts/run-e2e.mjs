import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const host = "127.0.0.1";
const port = 8080;
const url = `http://${host}:${port}/`;
const readinessTimeoutMs = 60_000;
const pollIntervalMs = 500;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const vitePath = resolve("node_modules/vite/bin/vite.js");
const playwrightPath = resolve("node_modules/@playwright/test/cli.js");

let previewProcess;
let cleanedUp = false;
const serverOutput = [];

function recordOutput(chunk, stream) {
  const text = chunk.toString();
  serverOutput.push(`[${stream}] ${text}`);
  if (serverOutput.length > 80) serverOutput.shift();
}

function stopPreview() {
  if (cleanedUp) return;
  cleanedUp = true;

  if (!previewProcess || previewProcess.exitCode !== null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(previewProcess.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else {
    previewProcess.kill("SIGTERM");
  }
}

function failWithServerOutput(message) {
  console.error(`\n${message}`);
  if (serverOutput.length > 0) {
    console.error("--- Vite preview output ---");
    console.error(serverOutput.join(""));
    console.error("--- End Vite preview output ---");
  }
  stopPreview();
  process.exitCode = 1;
}

async function checkServer() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    return response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer() {
  const deadline = Date.now() + readinessTimeoutMs;

  while (Date.now() < deadline) {
    if (await checkServer()) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, pollIntervalMs));
  }

  return false;
}

async function main() {
  if (!existsSync(vitePath) || !existsSync(playwrightPath)) {
    failWithServerOutput("E2E dependencies are not installed. Run npm install first.");
    return;
  }

  const buildResult = spawnSync(npmCommand, ["run", "build"], {
    stdio: "inherit",
    shell: false,
  });
  if (buildResult.error || buildResult.status !== 0) {
    process.exitCode = buildResult.status ?? 1;
    return;
  }

  previewProcess = spawn(process.execPath, [
    vitePath,
    "preview",
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  previewProcess.stdout.on("data", (chunk) => recordOutput(chunk, "stdout"));
  previewProcess.stderr.on("data", (chunk) => recordOutput(chunk, "stderr"));
  previewProcess.on("error", (error) => recordOutput(`${error}\n`, "process"));

  if (!(await waitForServer())) {
    failWithServerOutput(`Vite preview did not become ready at ${url} within ${readinessTimeoutMs / 1000} seconds.`);
    return;
  }

  const playwrightArgs = [playwrightPath, "test", ...process.argv.slice(2)];
  const testResult = spawnSync(process.execPath, playwrightArgs, {
    stdio: "inherit",
    shell: false,
  });
  process.exitCode = testResult.error ? 1 : (testResult.status ?? 1);
}

process.on("exit", stopPreview);
process.on("SIGINT", () => {
  stopPreview();
  process.exitCode = 130;
});
process.on("SIGTERM", () => {
  stopPreview();
  process.exitCode = 143;
});

try {
  await main();
} finally {
  stopPreview();
}
