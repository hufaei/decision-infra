import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export type ModelEntry = {
  id: string;
  provider: string;
  runtime: string;
  source: string;
  sourceRevision?: string;
  license: string;
  download: null | {
    kind: "huggingface";
    repo: string;
    revision: string;
    include?: string;
  };
};

export type ModelRegistry = { version: number; models: ModelEntry[] };

const registryPath = fileURLToPath(
  new URL("../../../models/registry.json", import.meta.url),
);

export async function loadRegistry(): Promise<ModelRegistry> {
  return JSON.parse(await readFile(registryPath, "utf8")) as ModelRegistry;
}

type Io = {
  stdout(message: string): void;
  stderr(message: string): void;
};

const defaultIo: Io = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

export async function runCli(args: string[], io: Io = defaultIo): Promise<number> {
  const registry = await loadRegistry();
  const [action] = args;

  if (action === "list") {
    for (const model of registry.models) {
      io.stdout(`${model.id}\t${model.runtime}\t${model.source}`);
    }
    return 0;
  }

  io.stderr("usage: pnpm models list");
  return 2;
}
