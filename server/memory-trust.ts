// Memory loads into every later turn, so it is where a planted instruction would persist (SpAIware, 2024; MINJA,
// arXiv 2503.03704). Security invariant: text that reached a turn from a web page, a tool, an email, a webhook or
// another bot never becomes always-loaded memory on its own, and nothing that reads as an instruction is kept at all.

/** Instruction-like text a fact never needs: overriding rules, sending data somewhere, reaching for keys. */
const THREATS: readonly RegExp[] = [
  /\b(?:ignore|disregard|forget|override)\b.{0,30}\b(?:previous|prior|above|earlier|all|system|your)\b.{0,20}\b(?:instructions?|rules?|prompts?|guidelines?)\b/i,
  /\b(?:always|from now on|every time|whenever|automatically)\b.{0,80}\b(?:cc|bcc|forward|send|e-?mail|post|upload|share|copy|transfer|pay|wire)\b.{0,80}(?:@[\w-]+\.|https?:\/\/|\b[\w.+-]+@[\w-]+\.\w)/i,
  /\b(?:send|forward|upload|post|exfiltrate|leak)\b.{0,60}\b(?:to|at|into)\b.{0,20}(?:https?:\/\/|\b[\w.+-]+@[\w-]+\.\w)/i,
  /\b(?:authorized_keys|id_rsa|id_ed25519)\b|~\/\.ssh\b|\.env\b|\b(?:api[_ -]?key|password|secret|token)s?\b.{0,40}\b(?:send|share|post|reveal|print)\b/i,
  /\b(?:system prompt|developer (?:message|mode)|jailbreak)\b/i,
  /\bexfiltrat/i,
];

export function looksLikeInstruction(text: string): boolean {
  return THREATS.some((pattern) => pattern.test(text));
}

export const BLOCKED_LINE = "[blocked: a saved line read like an instruction rather than a fact; it stays in the file for the person to review]";

/** Tools whose results are outside content: whatever they return was written by someone other than the person. */
const OUTSIDE_TOOL = /browser|web|fetch|read_pages?|research|search|crawl|scrape|download|gmail|mail|inbox|slack|composio|http|url|rss|calendar|drive|notion|github|webhook|connector|mcp__/i;
const OWN_TOOL = /^(?:session_search|memory_update|memory_log|list_bots|list_threads)$/;

type PathMessage = { role: string; kind?: string; sender?: unknown; peerAsk?: unknown; tool?: { name?: string }; from?: { botId?: string } };

/** What the current turn has read since the person's last message: outside content taints what it may remember. */
export function readOutsideContent(path: readonly PathMessage[]): boolean {
  const asked = path.findLastIndex((message) => message.role === "user" && message.kind === "text");
  for (const message of path.slice(asked + 1)) {
    const name = message.tool?.name ?? "";
    if (message.kind === "activity" && name && !OWN_TOOL.test(name) && OUTSIDE_TOOL.test(name)) return true;
  }
  return false;
}

/** Whether another bot spoke since the person's last message, as when its reply in a room tags this bot: the turn then
 * acts on that bot's words, not the person's. */
export function heardAnotherBot(path: readonly PathMessage[], botId: string): boolean {
  const asked = path.findLastIndex((message) => message.role === "user" && message.kind === "text");
  return path.slice(asked + 1).some((message) => message.role === "bot" && message.kind === "text" && Boolean(message.from?.botId) && message.from?.botId !== botId);
}
