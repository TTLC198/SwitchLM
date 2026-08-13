#!/usr/bin/env node

export type CliCommand = "start" | "status";

export function parseCommand(args: string[]): CliCommand | undefined {
  const command = args[0];
  return command === "start" || command === "status" ? command : undefined;
}

function main(): void {
  const command = parseCommand(process.argv.slice(2));

  if (!command) {
    console.error("Usage: switchlm <start|status>");
    process.exitCode = 1;
    return;
  }

  console.error(`SwitchLM ${command} is not implemented yet`);
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}
