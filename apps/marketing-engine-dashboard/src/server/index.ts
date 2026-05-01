import { createApp } from "./routes.ts";

const PORT = Number(process.env.PORT ?? 7878);
const app = createApp();

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  fetch: (req) => app.fetch(req),
});

console.log(
  `marketing-engine-dashboard server listening on http://${server.hostname}:${server.port}`,
);
