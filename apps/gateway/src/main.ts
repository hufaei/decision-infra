import { buildApp } from "./app.js";
import { createRegistry } from "./config.js";

const app = buildApp(createRegistry(process.env));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8080);

await app.listen({ host, port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

