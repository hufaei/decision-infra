import { runCli } from "./registry.js";

process.exitCode = await runCli(process.argv.slice(2));

