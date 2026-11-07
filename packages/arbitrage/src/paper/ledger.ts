import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyState, type LedgerRecord, type PaperState } from "./types.js";

export const LEDGER_FILE = "ledger.jsonl";
export const STATE_FILE = "state.json";

export function readLedger(dir: string): LedgerRecord[] {
  const file = join(dir, LEDGER_FILE);
  if (!existsSync(file)) return [];
  const out: LedgerRecord[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s) as LedgerRecord);
    } catch {
      // a torn line from an interrupted run; skip it rather than lose the file
    }
  }
  return out;
}

export function appendLedger(dir: string, records: readonly LedgerRecord[]): void {
  if (!records.length) return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, LEDGER_FILE), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

export function readState(dir: string): PaperState {
  const file = join(dir, STATE_FILE);
  if (!existsSync(file)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<PaperState>;
    return { ...emptyState(), ...parsed, positions: Array.isArray(parsed.positions) ? parsed.positions : [] };
  } catch {
    return emptyState();
  }
}

export function writeState(dir: string, state: PaperState): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, STATE_FILE), JSON.stringify(state, null, 2) + "\n");
}
