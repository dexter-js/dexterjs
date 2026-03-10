import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import type { LogEntry, FileOptions, Transport } from "../types";

// ─── Size Parsing ────────────────────────────────────────────────────────────

function parseSize(size: string): number {
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|b)?$/);
  if (!match) return 10 * 1024 * 1024; // default 10mb

  const value = parseFloat(match[1]!);
  const unit = match[2] ?? "b";

  switch (unit) {
    case "kb":
      return value * 1024;
    case "mb":
      return value * 1024 * 1024;
    case "gb":
      return value * 1024 * 1024 * 1024;
    default:
      return value;
  }
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

function dateString(): string {
  return new Date().toISOString().split("T")[0]!;
}

function fileAge(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    return (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
  } catch {
    return Infinity;
  }
}

// ─── File Writer ─────────────────────────────────────────────────────────────

class FileWriter {
  private stream: fs.WriteStream;
  private filePath: string;
  private currentSize: number;
  private maxSize: number;
  private maxFiles: number;
  private compress: boolean;
  private dir: string;
  private baseName: string;

  constructor(filePath: string, options: FileOptions["rotation"]) {
    this.filePath = filePath;
    this.maxSize = parseSize(options.maxSize);
    this.maxFiles = options.maxFiles;
    this.compress = options.compress;
    this.dir = path.dirname(filePath);
    this.baseName = path.basename(filePath, path.extname(filePath));

    // Ensure directory exists.
    fs.mkdirSync(this.dir, { recursive: true });

    // Get current file size or start fresh.
    try {
      const stat = fs.statSync(filePath);
      this.currentSize = stat.size;
    } catch {
      this.currentSize = 0;
    }

    this.stream = fs.createWriteStream(filePath, { flags: "a" });
  }

  write(line: string): void {
    const data = line + "\n";
    const byteLength = Buffer.byteLength(data, "utf8");

    // Check if rotation is needed before writing.
    if (this.currentSize + byteLength > this.maxSize) {
      this.rotate();
    }

    this.stream.write(data);
    this.currentSize += byteLength;
  }

  flush(): void {
    // Node.js WriteStream handles flushing internally.
    // Cork/uncork for batching if needed.
  }

  close(): void {
    this.stream.end();
  }

  private rotate(): void {
    // Close current stream.
    this.stream.end();

    // Rename current file with date stamp.
    const ext = path.extname(this.filePath);
    const rotatedName = `${this.baseName}.${dateString()}-${Date.now()}${ext}`;
    const rotatedPath = path.join(this.dir, rotatedName);

    try {
      fs.renameSync(this.filePath, rotatedPath);
    } catch {
      // If rename fails, continue with current file.
    }

    // Compress rotated file if enabled.
    if (this.compress) {
      this.compressFile(rotatedPath);
    }

    // Clean up old files.
    this.cleanup();

    // Open new stream.
    this.currentSize = 0;
    this.stream = fs.createWriteStream(this.filePath, { flags: "a" });
  }

  private compressFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath);
      const compressed = zlib.gzipSync(content);
      fs.writeFileSync(filePath + ".gz", compressed);
      fs.unlinkSync(filePath);
    } catch {
      // Non-critical — skip if compression fails.
    }
  }

  private cleanup(): void {
    try {
      const files = fs.readdirSync(this.dir);
      for (const file of files) {
        const filePath = path.join(this.dir, file);
        if (
          file.startsWith(this.baseName + ".") &&
          file !== path.basename(this.filePath)
        ) {
          if (fileAge(filePath) > this.maxFiles) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch {
      // Non-critical.
    }
  }
}

// ─── File Transport ──────────────────────────────────────────────────────────

export class FileTransport implements Transport {
  private writers: Map<string, FileWriter> = new Map();
  private defaultWriter: FileWriter | null = null;
  private split: boolean;
  private buffer: Array<{ level: string; line: string }> = [];
  private bufferSize: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private useAsync: boolean;

  constructor(options: FileOptions & { async?: boolean; bufferSize?: number }) {
    this.split = options.split;
    this.useAsync = options.async ?? true;
    this.bufferSize = options.bufferSize ?? 100;

    const dir = options.path;

    if (options.split) {
      const filenames = {
        error: options.filenames?.error ?? "error.log",
        warn: options.filenames?.warn ?? "warn.log",
        info: options.filenames?.info ?? "info.log",
        debug: options.filenames?.debug ?? "debug.log",
      };

      for (const [level, filename] of Object.entries(filenames)) {
        this.writers.set(
          level,
          new FileWriter(path.join(dir, filename), options.rotation),
        );
      }
    } else {
      this.defaultWriter = new FileWriter(
        path.join(dir, "app.log"),
        options.rotation,
      );
    }

    if (this.useAsync) {
      this.timer = setInterval(() => this.flush(), 100);
      this.timer.unref();
    }
  }

  write(entry: LogEntry): void {
    const line = JSON.stringify(entry);

    if (this.useAsync) {
      this.buffer.push({ level: entry.level, line });
      if (this.buffer.length >= this.bufferSize) {
        this.flush();
      }
    } else {
      this.writeLine(entry.level, line);
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    for (const { level, line } of batch) {
      this.writeLine(level, line);
    }
  }

  close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
    for (const writer of this.writers.values()) {
      writer.close();
    }
    this.defaultWriter?.close();
  }

  private writeLine(level: string, line: string): void {
    if (this.split) {
      const writer = this.writers.get(level);
      if (writer) {
        writer.write(line);
      }
    } else {
      this.defaultWriter?.write(line);
    }
  }
}
