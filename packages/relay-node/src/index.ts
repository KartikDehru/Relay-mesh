import { createApp } from "./server.js";
import { loadConfig } from "./config.js";

const cfg = await loadConfig();
const app = createApp(cfg);

const server = app.listen(cfg.port, () => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "listen",
      role: cfg.role,
      port: cfg.port,
      allowedHops: cfg.allowedHopUrls.size,
      exitTargets: cfg.exitRpcAllowlist.size,
    }),
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
