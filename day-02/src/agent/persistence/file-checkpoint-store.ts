import fs from "node:fs/promises";
import path from "node:path";
import type { AgentState } from "../../config/types.js";
import type { CheckpointStore } from "./checkpoint-store.js";

export class FileCheckpointStore implements CheckpointStore {
  private readonly dirPath: string;

  constructor(dirPath: string = "./.checkpoints") {
    this.dirPath = path.resolve(dirPath);
  }

  private getFilePath(runId: string): string {
    return path.join(this.dirPath, `${runId}.checkpoint.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dirPath, { recursive: true });
  }

  async save(state: AgentState): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(state.runId);
    const serialized = JSON.stringify(state, null, 2);
    // Write atomically via temporary file to prevent corruption during mid-write crash
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, serialized, "utf-8");
    await fs.rename(tempPath, filePath);
  }

  async load(runId: string): Promise<AgentState | null> {
    const filePath = this.getFilePath(runId);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as AgentState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async delete(runId: string): Promise<void> {
    const filePath = this.getFilePath(runId);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async list(): Promise<string[]> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(this.dirPath);
      return files
        .filter(f => f.endsWith(".checkpoint.json"))
        .map(f => f.replace(".checkpoint.json", ""));
    } catch {
      return [];
    }
  }
}
