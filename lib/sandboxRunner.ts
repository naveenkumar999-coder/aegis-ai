import { exec, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  blockedBySafety?: boolean;
}

export type SupportedLanguage = "powershell" | "node" | "python" | "batch";

const DANGEROUS_PATTERNS = [
  /\bformat\s+[c-z]:/i,
  /\bdiskpart\b/i,
  /\brmdir\s+\/[sq]\s+[c-z]:\\(?:windows|system32)/i,
  /\bdel\s+\/[sqf]\s+[c-z]:\\(?:windows|system32)/i,
  /\bRemove-Item\s+.*?(?:-Recurse|-r).*?(?:Windows|System32)/i,
  /\b(?:%0\s*\|\s*%0)\b/,
  /\b:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
];

export class SandboxRunner {
  /**
   * Validates script content against destructive commands.
   */
  public static isSafe(code: string): { safe: boolean; reason?: string } {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        return {
          safe: false,
          reason: `Code blocked by safety guard matching dangerous pattern: ${pattern.toString()}`,
        };
      }
    }
    return { safe: true };
  }

  /**
   * Executes code dynamically in an isolated subprocess with timeout and output capture.
   */
  public static async executeCode(
    code: string,
    language: SupportedLanguage = "powershell",
    timeoutMs = 15000
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // 1. Safety check
    const safety = this.isSafe(code);
    if (!safety.safe) {
      return {
        success: false,
        stdout: "",
        stderr: safety.reason || "Blocked by safety filter",
        exitCode: -1,
        executionTimeMs: Date.now() - startTime,
        blockedBySafety: true,
      };
    }

    // 2. Prepare temp script file
    const tempDir = path.join(process.cwd(), "scratch");
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch {}

    const fileId = `monday_exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let fileName = "";
    let cmd = "";
    let args: string[] = [];

    switch (language) {
      case "powershell":
        fileName = `${fileId}.ps1`;
        cmd = "powershell";
        args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"];
        break;
      case "node":
        fileName = `${fileId}.js`;
        cmd = "node";
        args = [];
        break;
      case "python":
        fileName = `${fileId}.py`;
        cmd = "python";
        args = [];
        break;
      case "batch":
        fileName = `${fileId}.bat`;
        cmd = "cmd";
        args = ["/c"];
        break;
    }

    const scriptPath = path.join(tempDir, fileName);

    try {
      await fs.writeFile(scriptPath, code, "utf8");

      return await new Promise<ExecutionResult>((resolve) => {
        let stdout = "";
        let stderr = "";
        let isTimedOut = false;

        const childArgs = [...args, scriptPath];
        const child = spawn(cmd, childArgs, {
          cwd: process.cwd(),
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });

        const timer = setTimeout(() => {
          isTimedOut = true;
          child.kill();
          resolve({
            success: false,
            stdout,
            stderr: `Execution timed out after ${timeoutMs}ms`,
            exitCode: -2,
            executionTimeMs: Date.now() - startTime,
          });
        }, timeoutMs);

        child.stdout?.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr?.on("data", (data) => {
          stderr += data.toString();
        });

        child.on("close", (exitCode) => {
          clearTimeout(timer);
          if (isTimedOut) return;

          const duration = Date.now() - startTime;
          resolve({
            success: exitCode === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
            executionTimeMs: duration,
          });
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          if (isTimedOut) return;

          resolve({
            success: false,
            stdout,
            stderr: err.message,
            exitCode: -3,
            executionTimeMs: Date.now() - startTime,
          });
        });
      });
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(scriptPath);
      } catch {}
    }
  }
}
