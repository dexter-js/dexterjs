import { Router, type Request, type Response } from "express";
import { Aggregator } from "../aggregator";
import { getDb } from "../db";

// Explicit type annotation avoids TS2742 portability error.
const router: ReturnType<typeof Router> = Router();

// ─── GET /api/overview ────────────────────────────────────────────────────────
router.get("/overview", (_req: Request, res: Response) => {
  try {
    const overview = Aggregator.getOverview();
    res.json(overview);
  } catch (err: any) {
    console.error("[dexter-sidecar] /api/overview error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/routes ──────────────────────────────────────────────────────────
router.get("/routes", (_req: Request, res: Response) => {
  try {
    const stats = Aggregator.getRouteStats();
    res.json(stats);
  } catch (err: any) {
    console.error("[dexter-sidecar] /api/routes error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/logs ────────────────────────────────────────────────────────────
router.get("/logs", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const limit = Math.min(Number(req.query["limit"]) || 100, 1000);
    const traceId = req.query["traceId"] as string | undefined;

    let rows;
    if (traceId) {
      rows = db
        .prepare(
          `SELECT * FROM logs WHERE traceId = ? ORDER BY timestamp DESC LIMIT ?`,
        )
        .all(traceId, limit);
    } else {
      rows = db
        .prepare(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?`)
        .all(limit);
    }

    // Parse metadata back from JSON strings.
    const logs = (rows as any[]).map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));

    res.json(logs);
  } catch (err: any) {
    console.error("[dexter-sidecar] /api/logs error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/spans ────────────────────────────────────────────────────────────
router.get("/spans", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const traceId = req.query["traceId"] as string | undefined;
    if (!traceId) {
      res.status(400).json({ error: "traceId query param is required" });
      return;
    }
    const rows = db
      .prepare(
        `SELECT * FROM spans WHERE traceId = ? ORDER BY timestamp ASC`,
      )
      .all(traceId);
    res.json(rows);
  } catch (err: any) {
    console.error("[dexter-sidecar] /api/spans error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/insights ────────────────────────────────────────────────────────
router.get("/insights", (_req: Request, res: Response) => {
  try {
    const insights = Aggregator.getInsights();
    res.json(insights);
  } catch (err: any) {
    console.error("[dexter-sidecar] /api/insights error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
