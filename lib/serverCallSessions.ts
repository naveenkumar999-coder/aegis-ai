import fs from "fs";
import path from "path";
import { CallSession } from "./callLogStore";

const LOCAL_DATA_DIR = path.join(process.cwd(), "data");
const LOCAL_SESSIONS_FILE = path.join(LOCAL_DATA_DIR, "call_sessions.json");
const TMP_DATA_DIR = path.join("/tmp", "aegis_data");
const TMP_SESSIONS_FILE = path.join(TMP_DATA_DIR, "call_sessions.json");

let cachedSessions: CallSession[] | null = null;
let determinedWritePath: string | null = null;

function getWritableFilePath(): string {
  if (determinedWritePath) return determinedWritePath;

  // 1. Try local data dir (for local dev / persistent server)
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    const testFile = path.join(LOCAL_DATA_DIR, ".write_test");
    fs.writeFileSync(testFile, "ok", "utf-8");
    fs.unlinkSync(testFile);
    determinedWritePath = LOCAL_SESSIONS_FILE;
    return determinedWritePath;
  } catch {
    // 2. Read-only filesystem (e.g. Vercel serverless lambda) -> use /tmp
    try {
      if (!fs.existsSync(TMP_DATA_DIR)) {
        fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
      }
      determinedWritePath = TMP_SESSIONS_FILE;
      return determinedWritePath;
    } catch {
      determinedWritePath = LOCAL_SESSIONS_FILE;
      return determinedWritePath;
    }
  }
}

export function getServerCallSessions(): CallSession[] {
  if (cachedSessions !== null) {
    return cachedSessions;
  }

  const targetPath = getWritableFilePath();

  // Try reading from writable target path first
  if (fs.existsSync(targetPath)) {
    try {
      const raw = fs.readFileSync(targetPath, "utf-8");
      cachedSessions = JSON.parse(raw);
      return cachedSessions || [];
    } catch {}
  }

  // Fallback: Read initial seed data from project repo if target was /tmp
  if (targetPath !== LOCAL_SESSIONS_FILE && fs.existsSync(LOCAL_SESSIONS_FILE)) {
    try {
      const raw = fs.readFileSync(LOCAL_SESSIONS_FILE, "utf-8");
      cachedSessions = JSON.parse(raw);
      return cachedSessions || [];
    } catch {}
  }

  cachedSessions = [];
  return [];
}

export function saveServerCallSessions(sessions: CallSession[]) {
  cachedSessions = sessions;
  const targetPath = getWritableFilePath();
  try {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write call sessions file to " + targetPath + ":", err);
  }
}

export function addServerCallSession(session: CallSession): CallSession[] {
  const current = getServerCallSessions();
  const updated = [session, ...current.filter((s) => s.id !== session.id)];
  saveServerCallSessions(updated);
  return updated;
}
