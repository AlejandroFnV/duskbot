/** A teammate's open assignment from the thread waiting on it; threadId is the teammate's own thread. */
export interface WireTeammateWork {
  botId: string;
  threadId: string;
  /** First line of the brief. */
  summary: string;
  /** waiting: parked on a question. */
  status: "queued" | "running" | "waiting";
}

/** A thread's git repo: its top folder, the checked-out branch (null when detached) and whether it is a linked worktree. */
export interface WireCodeRepo {
  root: string;
  branch: string | null;
  worktree?: true;
}
