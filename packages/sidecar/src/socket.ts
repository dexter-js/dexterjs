import * as net from "node:net";
import * as fs from "node:fs";
import type { EventBatch } from "@dexter.js/types";
import { ingestBatch } from "./ingest";

const SOCKET_PATH = "/tmp/dexter.sock";

/**
 * Creates a Unix domain socket server that receives newline-delimited JSON
 * batches from the DexterJS SDK and persists them via {@link ingestBatch}.
 */
export function createSocketServer(): net.Server {
  // Clean up stale socket file from a previous run.
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  const server = net.createServer((connection) => {
    let data = "";

    connection.on("data", (chunk) => {
      data += chunk.toString();
    });

    connection.on("end", () => {
      if (!data.trim()) return;

      try {
        const batch: EventBatch = JSON.parse(data.trim());
        ingestBatch(batch);
      } catch (err: any) {
        console.error("[dexter-sidecar] failed to parse batch:", err.message);
      }
    });

    connection.on("error", (err) => {
      console.error("[dexter-sidecar] connection error:", err.message);
    });
  });

  server.listen(SOCKET_PATH, () => {
    console.log(`[dexter-sidecar] listening on ${SOCKET_PATH}`);
  });

  server.on("error", (err) => {
    console.error("[dexter-sidecar] socket server error:", err.message);
  });

  return server;
}
