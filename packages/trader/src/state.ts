import { readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import type { Slot } from "./strategy/grid.js";

/** Everything needed to resume the bot after a restart. */
export interface BotState {
  symbol: string;
  gridLower: number;
  gridUpper: number;
  slots: Slot[];
  realizedQuote: number;
  feesQuote: number;
  trades: number;
  /** Completed buy→sell cycles (the unit PREREG gate criteria count). */
  roundTrips: number;
  risk: { day: string; realizedToday: number; stopped: boolean };
  /** When this deployment first started (survives restarts). */
  startedAt: number;
  updatedAt: number;
}

export function loadState(path: string): BotState | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as BotState;
}

/** Atomic write so a crash mid-save can't corrupt the state file. */
export function saveState(path: string, state: BotState): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}
