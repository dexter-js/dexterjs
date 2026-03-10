import express, { type Request, type Response } from "express";
import { Pool } from "pg";

// ─── Pattern 1: Logger only ──────────────────────────────────────────────────
import { createLogger } from "@dexter.js/logger";
const logger = createLogger({
  level: "debug",
  format: "pretty",
  transport: "terminal",
  redact: ["password", "token", "secret"],
  context: { service: "express-app", version: "0.1.0" },
});

// ─── Pattern 2 & 3: Monitor (with logger integration) ───────────────────────
import { monitor, expressMiddleware, instrumentPg } from "@dexter.js/monitor";

const app = express();
app.use(express.json());

app.use("/.well-known", (_req, res) => res.status(204).end());

// Initialize monitor — pass logger so logs flow through sidecar too.
monitor({
  app,
  logger,
  port: 4000,
  autoSpawn: true,
});

// Instrument database.
instrumentPg(Pool);

const pool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/dexterjs_demo",
  max: 10,
});

pool.on("error", (err) => {
  logger.warn("PostgreSQL pool error — routes will return mock data.", {
    error: err.message,
  });
});

// Auto-trace every request.
app.use(expressMiddleware());

// Child logger for request handlers.
const reqLog = logger.child({ module: "routes" });

app.get("/users", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users LIMIT 50",
    );
    reqLog.info("Fetched users list", { count: result.rows.length });
    res.json(result.rows);
  } catch {
    reqLog.warn("Returning mock users (PG unavailable)");
    res.json([
      { id: 1, name: "Alice", email: "alice@example.com" },
      { id: 2, name: "Bob", email: "bob@example.com" },
    ]);
  }
});

app.get("/users/:id", async (req: Request, res: Response) => {
  const userId = req.params["id"];
  try {
    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [userId],
    );
    if (result.rows.length === 0) {
      reqLog.info("User not found", { userId });
      res.status(404).json({ error: "User not found" });
      return;
    }
    reqLog.info("Fetched user", { userId });
    res.json(result.rows[0]);
  } catch {
    reqLog.warn("Returning mock user (PG unavailable)", { userId });
    res.json({
      id: Number(userId),
      name: "Mock User",
      email: "mock@example.com",
    });
  }
});

app.post("/users", async (req: Request, res: Response) => {
  const { name, email } = req.body ?? {};
  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }

  try {
    const result = await pool.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
      [name, email],
    );
    reqLog.info("Created user", { name, email });
    res.status(201).json(result.rows[0]);
  } catch {
    reqLog.warn("Returning mock created user (PG unavailable)", { name, email });
    res.status(201).json({ id: 999, name, email });
  }
});

const PORT = Number(process.env["PORT"]) || 3000;

app.listen(PORT, () => {
  logger.info("server started", { port: PORT, url: `http://localhost:${PORT}` });
  logger.info("dashboard available", { url: "http://localhost:4000" });
});
