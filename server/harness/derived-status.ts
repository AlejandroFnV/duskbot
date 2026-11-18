// The status line's label while the bot sets none of its own: what its tool calls are doing, in a few words of the
// person's language ("Searching for keyboard reviews", "Reading theverge.com", "Using the computer").
import { commandKind, commandPhraseKey } from "../../shared/command-phrase.ts";
import { STATUS_LABEL_MAX, type LiveStep } from "../../shared/turn-progress.ts";
import { USE_TOOL } from "../drivers/agents-bridge.ts";
import { redactSecretsInText } from "../redact.ts";
import { serverLine, type ServerLineKey } from "../server-lines.ts";

/** The least time a derived label shows before the next replaces it. */
export const LABEL_HOLD_MS = 2_500;
/** How long a label the bot set with set_status stands over derived ones. */
export const MODEL_HOLD_MS = 20_000;

export interface DerivedCall {
  title?: string;
  input?: string;
  step?: LiveStep;
}

type Args = Record<string, unknown>;

const record = (value: unknown): value is Args => value !== null && typeof value === "object" && !Array.isArray(value);

function parsed(input: string | undefined): unknown {
  if (!input?.trim()) return undefined;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function field(args: unknown, names: readonly string[]): string | undefined {
  if (!record(args)) return undefined;
  for (const name of names) {
    const value = args[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim()) ?? value.find(record);
      if (typeof first === "string") return first.trim();
      const nested = field(first, ["query", "q", "url"]);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** The bare tool name and its arguments, through any engine's MCP prefix and the bridge's use_tool. */
function unwrap(call: DerivedCall): { name: string; args: unknown } {
  const name = (call.title ?? "").trim().replace(/^mcp__.+?__/, "").replace(/^(?:agents__|agents_)/, "");
  const args = parsed(call.input);
  if (name === USE_TOOL && record(args) && typeof args.name === "string") return { name: args.name, args: args.arguments };
  return { name, args };
}

function hostOf(raw: string | undefined): string | undefined {
  if (!raw || !/^https?:\/\//i.test(raw)) return undefined;
  try {
    return new URL(raw).hostname.replace(/^www\./i, "") || undefined;
  } catch {
    return undefined;
  }
}

/** A search query as a topic: no quotes, operators, years or punctuation runs. */
export function searchTopic(query: string): string {
  return query
    .replace(/\b(?:site|inurl|intitle|filetype|after|before):\S+/gi, " ")
    .replace(/(^|\s)-\S+/g, " ")
    .replace(/\b(?:OR|AND)\b/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/["“”'‘’()[\]{}|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cutWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 3 ? cut.slice(0, space) : cut.slice(0, max)).replace(/[\s,;:.-]+$/, "");
}

/** The line with its one `{name}` filled, the filler cut at a word so the whole label fits. */
function filled(language: string | undefined, key: ServerLineKey, name: string, value: string, max: number): string | undefined {
  const template = serverLine(language, key);
  const room = max - (template.length - `{${name}}`.length);
  const shown = cutWords(redactSecretsInText(value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim()), Math.max(room, 8));
  return shown ? serverLine(language, key, { [name]: shown }) : undefined;
}

const WEB_SEARCH = /web.?search|search.?(?:the.?)?web|google.?search|brave|bing|tavily|exa.?search|duckduckgo|perplexity|x_search|research_search/i;
const BROWSER = /browser|navigate|playwright|open_url|goto|new_tab|tab_new/i;
const COMPUTER = /computer|screenshot|screen|click|type_text|press_key|keypress|scroll|mouse|keyboard/i;
const MEMORY = /memory|session_search|session_read|recall|notes?_search|knowledge/i;
const SEARCH = /search|lookup|look_up|query/i;
const FILES_SEARCH = /^(?:grep|glob|find|search_files|list_files|ls)$/i;
const PUBLISH = /publish_page|deploy/i;
/** An engine looking up its own tools: machinery, never a step. */
const TOOL_LOOKUP = /^(?:ToolSearch|tool_search|find_tool|search_tools?|tool_describe)$/i;

export interface Derived {
  label: string;
  /** The site a browser call opened, kept for the calls after it that name none. */
  site?: string;
}

/** The label for one tool call, or undefined when nothing short and true can be said about it. `max`: its length. */
export function derivedLabel(call: DerivedCall, language: string | undefined, lastSite?: string, max = STATUS_LABEL_MAX): Derived | undefined {
  const { name, args } = unwrap(call);
  if (!name || TOOL_LOOKUP.test(name)) return undefined;
  const step = call.step;
  if (WEB_SEARCH.test(name) || step?.activity === "web") {
    const query = step?.activity === "web" ? step.detail ?? step.target : field(args, ["query", "q", "queries", "search_query", "searchQuery"]) ?? (typeof args === "string" ? args : undefined);
    const topic = query ? searchTopic(query) : "";
    const label = topic ? filled(language, "server.status.searchingFor", "topic", topic, max) : undefined;
    return { label: label ?? serverLine(language, "server.status.searchingWeb") };
  }
  if (BROWSER.test(name)) {
    const site = hostOf(field(args, ["url", "uri", "href", "link"])) ?? lastSite;
    const label = site ? filled(language, "server.status.checking", "site", site, max) : undefined;
    return { label: label ?? serverLine(language, "server.status.usingBrowser"), ...(site ? { site } : {}) };
  }
  if (step?.activity === "fetch") return withLabel(filled(language, "server.status.reading", "target", step.target, max));
  if (step?.activity === "write") return withLabel(filled(language, "server.status.writing", "file", step.target, max));
  if (step?.activity === "edit") return withLabel(filled(language, "server.status.editing", "file", step.target, max));
  if (step?.activity === "read") return withLabel(filled(language, "server.status.reading", "target", step.target, max));
  if (step?.activity === "command") return { label: serverLine(language, commandPhraseKey(commandKind(step.target, step.detail))) };
  if (COMPUTER.test(name)) return { label: serverLine(language, "server.status.usingComputer") };
  if (MEMORY.test(name)) return { label: serverLine(language, "server.status.checkingNotes") };
  if (SEARCH.test(name)) {
    const query = field(args, ["query", "q", "queries", "search_query", "searchQuery"]);
    const topic = query ? searchTopic(query) : "";
    if (topic) return withLabel(filled(language, "server.status.searchingFor", "topic", topic, max));
  }
  if (FILES_SEARCH.test(name)) return { label: serverLine(language, "server.status.lookingThroughFiles") };
  if (PUBLISH.test(name)) return { label: serverLine(language, "server.status.publishing") };
  return undefined;
}

function withLabel(label: string | undefined): Derived | undefined {
  return label ? { label } : undefined;
}
