import { createApp } from "./server.js";
import { loadConfig } from "./config.js";

const cfg = loadConfig();
const app = createApp(cfg);

const server = app.listen(cfg.port, () => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "listen",
      role: cfg.role,
      port: cfg.port,
    }),
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
