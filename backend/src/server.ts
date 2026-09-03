import { buildApp } from "./app.js";

const app = await buildApp();

try {
  await app.listen({ host: "0.0.0.0", port: app.config.port });
} catch (error) {
  app.log.fatal({ err: error }, "Kivisense CRM failed to start");
  process.exitCode = 1;
}
