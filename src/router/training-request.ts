import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ProviderRequest } from "../providers/provider.js";

export type TrainingRequestCollectorOptions = {
  enabled?: boolean;
  filePath?: string;
  maxRequestBytes?: number;
  retentionDays?: number;
  hmacKey?: string;
};

export class TrainingRequestCollector {
  private readonly enabled: boolean;
  private readonly filePath: string;
  private readonly maxRequestBytes: number;
  private readonly retentionDays: number;
  private readonly hmacKey: string;

  constructor(options: TrainingRequestCollectorOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.filePath = resolve(options.filePath ?? join(homedir(), ".switchlm", "routing-requests.jsonl"));
    this.maxRequestBytes = options.maxRequestBytes ?? 256 * 1024;
    this.retentionDays = options.retentionDays ?? 30;
    this.hmacKey = options.hmacKey ?? process.env.SWITCHLM_TRAINING_HMAC_KEY ?? "";
  }

  async record(request: ProviderRequest, now = Date.now()): Promise<boolean> {
    if (!this.enabled || !this.hmacKey) return false;

    const serializedRequest = JSON.stringify(request);
    const requestId = createHmac("sha256", this.hmacKey).update(serializedRequest).digest("hex");
    const record = { id: requestId, requestId, collectedAt: new Date(now).toISOString(), request };
    const line = JSON.stringify(record) + "\n";
    if (Buffer.byteLength(line, "utf8") > this.maxRequestBytes) return false;

    await mkdir(dirname(this.filePath), { recursive: true });
    await this.cleanup(now);
    await appendFile(this.filePath, line, "utf8");
    return true;
  }

  private async cleanup(now: number): Promise<void> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }

    const cutoff = now - this.retentionDays * 24 * 60 * 60 * 1_000;
    const retained = content.split("\n").filter((line) => {
      if (!line.trim()) return false;
      try {
        const record = JSON.parse(line) as { collectedAt?: string };
        return typeof record.collectedAt === "string" && Date.parse(record.collectedAt) >= cutoff;
      } catch {
        return false;
      }
    });
    const cleaned = retained.length ? retained.join("\n") + "\n" : "";
    if (cleaned === content) return;

    const temporaryPath = this.filePath + ".tmp";
    await writeFile(temporaryPath, cleaned, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
