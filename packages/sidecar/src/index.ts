import express from "express";
import * as path from "node:path";
import * as fs from "node:fs";
import { createSocketServer } from "./socket";
import { Aggregator } from "./aggregator";
import { getDb, closeDb } from "./db";
import apiRouter from "./routes/api";

const PORT = Number(process.env["DEXTER_PORT"]) || 4000;

// ── Init database ────────────────────────────────────────────────────────────
getDb();

// ── Unix-socket listener (SDK → sidecar) ─────────────────────────────────────
const socketServer = createSocketServer();

// ── Aggregator ───────────────────────────────────────────────────────────────
const aggregator = new Aggregator();
aggregator.start();

// ── HTTP dashboard ───────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Serve the React dashboard build.
const dashboardDist = path.resolve(__dirname, "../../dashboard/dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
} else {
  // Fallback: serve the legacy single-file dashboard.
  const legacyPath = path.resolve(__dirname, "dashboard.html");
  app.get("/", (_req, res) => {
    if (fs.existsSync(legacyPath)) {
      res.setHeader("Content-Type", "text/html");
      res.sendFile(legacyPath);
    } else {
      res.json({ name: "DexterJS Sidecar", status: "running", port: PORT });
    }
  });
}

// JSON health check.
app.get("/health", (_req, res) => {
  res.json({ name: "DexterJS Sidecar", status: "running", port: PORT });
});

app.use("/api", apiRouter);

// SPA fallback — must come after /api and /health.
if (fs.existsSync(dashboardDist)) {
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(dashboardDist, "index.html"));
    }
  });
}

const httpServer = app.listen(PORT, () => {
  console.log(`[dexter-sidecar] HTTP dashboard on http://localhost:${PORT}`);
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(): void {
  console.log("[dexter-sidecar] shutting down…");
  aggregator.stop();
  httpServer.close();
  socketServer.close();
  closeDb();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
