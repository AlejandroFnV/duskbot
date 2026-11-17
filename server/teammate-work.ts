import type { WireTeammateWork } from "../shared/wire-work.ts";
import type { HandoffView } from "./coordinator.ts";

const SUMMARY_MAX = 80;

export function teammateWork(views: readonly HandoffView[]): WireTeammateWork[] {
  return views.filter((view) => view.groupId === undefined).map((view) => ({
    botId: view.botId,
    threadId: view.threadId,
    summary: briefSummary(view.text),
    status: view.status === "queued" ? "queued" : view.status === "waiting" ? "waiting" : "running",
  }));
}

function briefSummary(text: string): string {
  const line = text.trim().split("\n", 1)[0]!.trim();
  return line.length > SUMMARY_MAX ? `${line.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : line;
}
