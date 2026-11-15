import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

function databaseIsListening() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 55432 });
    const finish = (available) => {
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function startExistingLocalDatabase() {
  const file = existsSync(".env.local")
    ? parseEnv(readFileSync(".env.local", "utf8"))
    : {};
  const settings = { ...file, ...process.env };
  let url;
  try {
    url = new URL(settings.DATABASE_URL);
  } catch {
    return;
  }
  if (
    settings.DATABASE_PROVIDER !== "supabase" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "55432" ||
    url.pathname !== "/mobile_store" ||
    !existsSync(".local-data/docker/database.env") ||
    (await databaseIsListening())
  )
    return;

  const explicitDocker = process.env.DOCKER_CONTEXT || process.env.DOCKER_HOST;
  const desktopSocket = join(homedir(), ".docker", "desktop", "docker.sock");
  if (
    !explicitDocker &&
    !existsSync(desktopSocket) &&
    platform() === "linux" &&
    existsSync("/usr/lib/systemd/user/docker-desktop.service")
  ) {
    console.log("Starting Docker Desktop for the existing local database…");
    const service = spawnSync(
      "systemctl",
      ["--user", "start", "docker-desktop"],
      { stdio: "pipe" },
    );
    if (service.status !== 0)
      throw Error(
        "Open Docker Desktop and run npm run dev again; the local database is offline.",
      );
    const deadline = Date.now() + 30000;
    while (!existsSync(desktopSocket) && Date.now() < deadline)
      await delay(500);
  }
  const context =
    !explicitDocker && existsSync(desktopSocket)
      ? ["--context", "desktop-linux"]
      : [];
  console.log("Starting the existing local database…");
  // `start` only reuses existing containers/volumes; it never creates an empty replacement.
  const database = spawnSync(
    "docker",
    [
      ...context,
      "compose",
      "--env-file",
      ".local-data/docker/database.env",
      "start",
      "--wait",
      "--wait-timeout",
      "60",
    ],
    { stdio: "inherit" },
  );
  if (database.status !== 0 || !(await databaseIsListening()))
    throw Error(
      "The existing local database could not start. Open Docker Desktop and check npm run db:status before retrying.",
    );
}

async function main() {
  await startExistingLocalDatabase();
  const require = createRequire(import.meta.url);
  const args = process.argv
    .slice(2)
    .filter((argument) => argument !== "--webpack");
  const next = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "dev", "--webpack", ...args],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => next.kill(signal));
  await new Promise((resolve, reject) => {
    next.once("error", reject);
    next.once("exit", (code, signal) => {
      process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
