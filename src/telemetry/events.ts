export type TelemetryName =
  | "stage.start"
  | "stage.done"
  | "validator.fail"
  | "repair.attempt"
  | "escalation"
  | "budget.hardfail"
  | "export.blocked"
  | "export.ok";

export interface TelemetryEvent {
  name: TelemetryName;
  payload: Record<string, string | number | boolean>;
}

const events: TelemetryEvent[] = [];

export function fnv(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function emit(name: TelemetryName, payload: Record<string, string | number | boolean> = {}): void {
  events.push({ name, payload });
}

export function readEvents(): TelemetryEvent[] {
  return events.slice();
}

export function clearEvents(): void {
  events.length = 0;
}
