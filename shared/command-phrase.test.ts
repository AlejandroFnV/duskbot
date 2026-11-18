import { describe, expect, it } from "vitest";

import en from "../src/locales/en.json";
import es from "../src/locales/es.json";
import { COMMAND_KINDS, commandKind, commandPhraseKey, type CommandKind } from "./command-phrase";

const cases: Array<[string, CommandKind, string?]> = [
  ["git push", "upload"],
  ["git push origin fix/status", "upload"],
  ["git commit", "save"],
  ["git add", "save"],
  ["git fetch", "download"],
  ["git pull", "download"],
  ["git diff", "review"],
  ["git status", "review"],
  ["git log", "review"],
  ["git", "review"],
  ["git -C ../repo push", "upload"],
  ["git worktree", "branch"],
  ["git checkout", "branch"],
  ["gh pr", "github"],
  ["pnpm test", "tests"],
  ["pnpm vitest", "tests"],
  ["npx vitest", "tests"],
  ["npm run test:unit", "tests"],
  ["pytest tests/", "tests"],
  ["cargo test", "tests"],
  ["bun test", "tests"],
  ["pnpm typecheck", "check"],
  ["pnpm lint", "check"],
  ["pnpm i18n:check", "check"],
  ["tsc --noEmit", "check"],
  ["eslint src", "check"],
  ["pnpm install", "install"],
  ["pnpm", "install"],
  ["npm ci", "install"],
  ["pip install requests", "install"],
  ["python3 -m pip", "install"],
  ["brew install ffmpeg", "install"],
  ["pnpm build", "build"],
  ["make", "build"],
  ["xcodebuild -scheme App", "build"],
  ["pnpm dev:app", "start"],
  ["npm start", "start"],
  ["python3 -m http.server", "start"],
  ["vite", "start"],
  ["vite build", "build"],
  ["kill $(cat", "stop"],
  ["kill -9 1234", "stop"],
  ["pkill -f vite", "stop"],
  ["lsof -ti", "processes"],
  ["ps aux", "processes"],
  ["cat README.md", "files"],
  ["ls -la", "files"],
  ["grep -rn", "files"],
  ["find .", "files"],
  ["mkdir -p out", "organize"],
  ["rm -rf dist", "organize"],
  ["curl api.github.com", "service"],
  ["ssh vps", "remote"],
  ["ffmpeg -i", "media"],
  ["whisper audio.m4a", "media"],
  ["sleep 5", "wait"],
  ["sudo kill 12", "stop"],
  ["NODE_ENV=test pnpm vitest", "tests"],
  ["timeout 60 pnpm test", "tests"],
  ["deploy.sh", "other"],
  ["python3 scrape.py", "other"],
  ["docker compose", "other"],
  ["-", "other"],
  ["", "other"],
  ["   ", "other"],
  ["$(cat", "other"],
  ["-", "upload", "cd ~/repo && git push"],
  ["", "tests", "ls && pnpm test"],
];

describe("commandKind", () => {
  it.each(cases)("%j reads as %s", (target, kind, detail) => {
    expect(commandKind(target, detail)).toBe(kind);
  });

  it("reads an undefined target as any other command", () => {
    expect(commandKind(undefined)).toBe("other");
  });

  it("has words for every kind in English and Spanish, none of them a command", () => {
    for (const kind of COMMAND_KINDS) {
      const key = commandPhraseKey(kind);
      expect(en[key], key).toBeTruthy();
      expect(es[key], key).toBeTruthy();
      for (const line of [en[key], es[key]]) expect(line).not.toMatch(/\b(?:git|pnpm|npm|kill|curl|gh)\b|[{}$]/);
    }
  });
});
