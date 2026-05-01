import { createApp } from "./routes.ts";

const PORT = Number(process.env.PORT ?? 7878);
const app = createApp();

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  // SSE streams (/api/renders/:id/events) stay open for the full render
  // duration (~30-60s for shayari-reel). Bun's default idleTimeout of 10s
  // would cut them off mid-render. 255 is the max.
  idleTimeout: 255,
  fetch: (req) => app.fetch(req),
});

console.log(
  `marketing-engine-dashboard server listening on http://${server.hostname}:${server.port}`,
);
