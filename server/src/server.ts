import { buildApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";

buildApp()
  .then((app) => app.listen({ port, host }))
  .then(() => {
    console.log(`Listening on http://${host}:${port}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
