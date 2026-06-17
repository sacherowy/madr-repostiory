import Fastify from "fastify";
import { config } from "./config.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  sourceOfTruth: "git",
  repo: config.repoPath,
}));

// TODO: zarejestruj moduły: adr, relations, folders, history, compare, similarity, search, auth(OIDC)

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => app.log.info(`ADR Manager API :${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
