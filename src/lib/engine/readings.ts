// Turn previous + current readings into kWh per household. Shared by split and check.
import type { CompoundState, Reading } from "@/types";

export interface HouseholdUsage {
  householdId: string;
  meterId: string;
  previous: Reading | null;
  current: Reading | null;
  /** current.value − previous.value, or null if a reading is missing. */
  kwh: number | null;
}

export function householdUsage(state: Pick<CompoundState, "meters" | "previousReadings" | "currentReadings">): HouseholdUsage[] {
  return state.meters
    .filter((m) => m.householdId !== null)
    .map((m) => {
      const previous = latest(state.previousReadings.filter((r) => r.meterId === m.id));
      const current = latest(state.currentReadings.filter((r) => r.meterId === m.id));
      const kwh = previous && current ? current.value - previous.value : null;
      return { householdId: m.householdId as string, meterId: m.id, previous, current, kwh };
    });
}

function latest(rs: Reading[]): Reading | null {
  if (rs.length === 0) return null;
  return [...rs].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))[rs.length - 1];
}
