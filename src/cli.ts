#!/usr/bin/env node

import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { startServer } from "./server.js";

export type CliCommand = "start" | "status";

export function parseCommand(args: string[]): CliCommand | undefined {
  const command = args[0];
  return command === "start" || command === "status" ? command : undefined;
}

export function healthUrl(config: Pick<AppConfig, "host" | "port">): string {
  const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
  return `http://${host}:${config.port}/health`;
}

export async function runStatus(config: AppConfig): Promise<boolean> {
  try {
    const response = await fetch(healthUrl(config));
    return response.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));

  if (!command) {
    console.error("Usage: switchlm <start|status>");
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig();

  if (command === "start") {
    const address = await startServer(config);
    console.log(`SwitchLM listening at ${address}`);
    return;
  }

  const ok = await runStatus(config);
  console.log(ok ? "SwitchLM is healthy" : "SwitchLM is not healthy");
  process.exitCode = ok ? 0 : 1;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
