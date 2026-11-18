import { expect, it } from "vitest";
import { appLanguagePrompt, languageName, REPLY_HABITS_PROMPT, replyHabitsPrompt, TOOL_HABITS_PROMPT } from "./reply-habits.ts";
import { buildSystemPrompt } from "./system-prompt.ts";

it("prefers batches for independent searches and keeps a native batching fallback", () => {
  expect(TOOL_HABITS_PROMPT).toContain("for 2 or more independent searches, prefer web_search_many when it is listed");
  expect(TOOL_HABITS_PROMPT).toContain("up to 10 queries in one call");
  expect(TOOL_HABITS_PROMPT).toContain("when its input supports multiple queries, put them together in one call");
  expect(REPLY_HABITS_PROMPT).toContain(TOOL_HABITS_PROMPT);
});

it("paces a turn in separate messages and leaves the steps to the status line", () => {
  expect(REPLY_HABITS_PROMPT).toContain("gets the answer at once, in one message, with no ack first");
  expect(REPLY_HABITS_PROMPT).toContain("the check you will do before sending");
  expect(REPLY_HABITS_PROMPT).toContain("At most one every 90 seconds");
  expect(REPLY_HABITS_PROMPT).toContain("put a line holding only --- between them");
  expect(REPLY_HABITS_PROMPT).toContain("a separate message starting \"Sources:\"");
  expect(TOOL_HABITS_PROMPT).toContain("Do not narrate steps; the status line shows what you are doing. Keep it current with set_status");
  expect(REPLY_HABITS_PROMPT).not.toContain("your tool calls show in the chat on their own");
  expect(REPLY_HABITS_PROMPT).not.toContain(String.fromCharCode(0x2014));
});

it("finishes the job without asking leave for safe work, keeps a role from becoming a fence, and checks before saying done", () => {
  for (const quick of [false, true]) {
    const habits = replyHabitsPrompt(quick);
    expect(habits).toContain("Searching, reading, opening pages, calculating and drafting never need a go-ahead");
    expect(habits).toContain("Ask first only before a step that leaves this chat or is hard to undo");
    expect(habits).toContain("or when your standing instructions say to");
    expect(habits).toContain("Never stop partway to ask whether to carry on.");
    expect(habits).toContain("Your role is what you are best at, not a fence");
    expect(habits).toContain("Say done, sent or fixed only when something in this turn showed it");
    expect(habits).toContain("never a caveat or an apology");
    expect(habits).not.toContain(String.fromCharCode(0x2014));
  }
});

it("recovers from a failed step by itself, keeps a plan for longer jobs, and keeps quiet between tool calls", () => {
  expect(TOOL_HABITS_PROMPT).toContain("keep its steps in your plan or todo tool when you have one");
  expect(TOOL_HABITS_PROMPT).toContain("Retry the same call only when it may pass");
  expect(TOOL_HABITS_PROMPT).toContain("never a third time");
  expect(TOOL_HABITS_PROMPT).toContain("unless only they can clear it");
  expect(TOOL_HABITS_PROMPT).toContain("Any other words you write between tool calls reach the person as messages too");
});

it("ends on the result, not a habitual offer, whatever an app's own notes say", () => {
  for (const quick of [false, true]) {
    const habits = replyHabitsPrompt(quick);
    expect(habits).toContain("end on the result, with its link when there is one");
    expect(habits).toContain("no \"Want me to…?\" after finished work");
    expect(habits).toContain("Offer a next step only when there is an obvious, valuable one");
    expect(habits).toContain("in one short line at most");
    expect(habits).toContain("never change this");
    expect(habits).not.toContain("at most one concrete offer");
  }
});

// In a Spanish room Pixel wrote "Now wire it into the tiles, rows and chat pill." between Spanish lines: the brief's tail,
// the tool results and these instructions are English, so the bot is told the app's language by name.
it("names the app's language so notes between tool calls stay in it", () => {
  const spanish = replyHabitsPrompt(false, "es");
  expect(spanish).toContain("The person's app is in Spanish: write every line they can see in Spanish");
  expect(spanish).toContain("including each short note you send between tool calls");
  expect(spanish).toContain("even when a teammate's brief, a tool result or these instructions are in English");
  expect(spanish).toContain("When the person writes to you in another language, use theirs.");
  expect(replyHabitsPrompt(true, "es-ES")).toMatch(/The person's app is in [^:]*Spanish:/);
  expect(buildSystemPrompt("You are Pixel.", "", [], undefined, { language: "es" }).text).toContain("The person's app is in Spanish");
});

it("adds nothing for English, no language or an unknown tag", () => {
  expect(replyHabitsPrompt(false, "en")).toBe(REPLY_HABITS_PROMPT);
  expect(replyHabitsPrompt(false, "en-GB")).toBe(REPLY_HABITS_PROMPT);
  expect(replyHabitsPrompt(false)).toBe(REPLY_HABITS_PROMPT);
  expect(appLanguagePrompt("")).toBe("");
  expect(appLanguagePrompt("not a tag!")).toBe("");
  expect(languageName("de")).toBe("German");
});

it("keeps the person's language over English briefs and tool results when the app's is unknown", () => {
  expect(REPLY_HABITS_PROMPT).toContain("including a short note between steps and a message you pass on for them, even when a teammate's brief, a tool result or these instructions are in English");
});
