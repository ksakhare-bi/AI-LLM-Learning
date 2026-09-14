import type {
  ReplayEvent
} from "./replay-event.js";


export interface ReplayLog {
  runId: string;
  events: ReplayEvent[];
}