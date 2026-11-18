// What a shell command is for, in the status line's plain words: a person reads "Uploading changes", never "git push".

/** Each kind's language-pack key, under "server." so the server's packs carry it too. */
const PHRASE_KEYS = {
  save: "server.status.command.save",
  upload: "server.status.command.upload",
  download: "server.status.command.download",
  review: "server.status.command.review",
  branch: "server.status.command.branch",
  github: "server.status.command.github",
  tests: "server.status.command.tests",
  check: "server.status.command.check",
  install: "server.status.command.install",
  build: "server.status.command.build",
  start: "server.status.command.start",
  stop: "server.status.command.stop",
  processes: "server.status.command.processes",
  files: "server.status.command.files",
  organize: "server.status.command.organize",
  service: "server.status.command.service",
  remote: "server.status.command.remote",
  media: "server.status.command.media",
  wait: "server.status.command.wait",
  other: "server.status.command.other",
} as const;

export type CommandKind = keyof typeof PHRASE_KEYS;
export type CommandPhraseKey = (typeof PHRASE_KEYS)[CommandKind];

export const COMMAND_KINDS = Object.keys(PHRASE_KEYS) as CommandKind[];

export function commandPhraseKey(kind: CommandKind): CommandPhraseKey {
  return PHRASE_KEYS[kind];
}

const GIT: Record<string, CommandKind> = {
  push: "upload",
  fetch: "download", pull: "download", clone: "download",
  add: "save", commit: "save", stash: "save", tag: "save", reset: "save", restore: "save", rm: "save", mv: "save",
  "cherry-pick": "save", merge: "save", rebase: "save", revert: "save", am: "save", apply: "save",
  checkout: "branch", switch: "branch", branch: "branch", worktree: "branch",
};

const PROGRAMS: Record<string, CommandKind> = {
  gh: "github",
  vitest: "tests", jest: "tests", pytest: "tests", mocha: "tests", ava: "tests", cypress: "tests", rspec: "tests", phpunit: "tests",
  tsc: "check", eslint: "check", prettier: "check", biome: "check", oxlint: "check", stylelint: "check", ruff: "check",
  mypy: "check", pyright: "check", flake8: "check", black: "check", swiftlint: "check", shellcheck: "check",
  brew: "install", apt: "install", "apt-get": "install", pip: "install", pip3: "install", pipx: "install", gem: "install", pod: "install",
  make: "build", cmake: "build", xcodebuild: "build", gradle: "build", gradlew: "build", webpack: "build", esbuild: "build",
  rollup: "build", "electron-builder": "build", "electron-forge": "build",
  kill: "stop", pkill: "stop", killall: "stop",
  ps: "processes", lsof: "processes", pgrep: "processes", top: "processes", htop: "processes", jobs: "processes", pstree: "processes",
  cat: "files", ls: "files", grep: "files", egrep: "files", rg: "files", find: "files", fd: "files", head: "files", tail: "files",
  sed: "files", awk: "files", less: "files", more: "files", wc: "files", jq: "files", yq: "files", tree: "files", stat: "files",
  file: "files", nl: "files", du: "files", df: "files", diff: "files", cmp: "files", sort: "files", uniq: "files", cut: "files",
  realpath: "files", readlink: "files", which: "files", pwd: "files", mdfind: "files", xxd: "files", strings: "files", plutil: "files",
  mkdir: "organize", cp: "organize", mv: "organize", rm: "organize", rmdir: "organize", touch: "organize", chmod: "organize",
  chown: "organize", ln: "organize", tar: "organize", zip: "organize", unzip: "organize", gzip: "organize", gunzip: "organize",
  rsync: "organize", ditto: "organize",
  curl: "service", wget: "service", http: "service", https: "service", xh: "service", ping: "service", dig: "service",
  nslookup: "service", nc: "service", telnet: "service",
  ssh: "remote", scp: "remote", sftp: "remote", mosh: "remote",
  ffmpeg: "media", ffprobe: "media", whisper: "media", "whisper-cli": "media", sips: "media", magick: "media", convert: "media",
  "yt-dlp": "media", sox: "media", exiftool: "media",
  sleep: "wait", wait: "wait",
};

/** Words in front of the program that only change how it runs: `sudo`, `nohup`, `npx`, `pnpm exec`, `python -m`. */
const WRAPPERS = new Set(["sudo", "env", "nohup", "time", "exec", "command", "caffeinate", "npx", "bunx", "pnpx", "xargs", "timeout", "gtimeout", "nice"]);
const RUNNERS = new Set(["npm", "pnpm", "yarn", "bun", "deno"]);
const RUNNER_PASS = new Set(["run", "run-script", "exec", "x", "dlx", "task"]);
const RUNNER_INSTALL = new Set(["install", "i", "add", "ci", "remove", "rm", "uninstall", "update", "up", "upgrade", "link"]);
const PY_RUNNERS = new Set(["uv", "poetry", "pdm", "hatch", "pipenv", "rye"]);
const PYTHON = /^python[0-9.]*$/;

function words(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean).map((word) => word.replace(/^["'(]+|["')]+$/g, ""));
}

const baseName = (word: string) => word.split("/").at(-1)!.toLowerCase();
const isFlag = (word: string) => word.startsWith("-");
const isAssignment = (word: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);

/** A package.json script, a cargo or go subcommand, by its name: what it is usually for. */
function scriptKind(name: string): CommandKind | undefined {
  const script = name.toLowerCase();
  if (/^(?:test|tests|spec|e2e)(?::|$)|^(?:vitest|jest|playwright|cypress)\b/.test(script)) return "tests";
  if (/^(?:typecheck|type-check|tsc|lint|check|format|fmt|prettier|eslint|clippy|vet)(?::|$)|:(?:check|lint)$/.test(script)) return "check";
  if (/^(?:build|bundle|compile|package|dist)(?::|$)/.test(script)) return "build";
  if (/^(?:dev|start|serve|preview|demo|watch)(?::|$)/.test(script)) return "start";
  return undefined;
}

function kindOf(list: string[]): CommandKind | undefined {
  let rest = list;
  while (rest.length && (isAssignment(rest[0]!) || WRAPPERS.has(baseName(rest[0]!)) || (isFlag(rest[0]!) && rest.length > 1))) {
    const word = baseName(rest[0]!);
    rest = rest.slice(word === "timeout" || word === "gtimeout" ? 2 : 1);
  }
  const program = rest[0] ? baseName(rest[0]) : "";
  if (!/[a-z]/.test(program)) return undefined;
  const args = rest.slice(1);
  const plain = args.filter((word) => !isFlag(word));
  if (program === "git") {
    const sub = args.filter((word, i) => !isFlag(word) && !/^-[Cc]$/.test(args[i - 1] ?? ""))[0];
    return (sub ? GIT[sub.toLowerCase()] : undefined) ?? "review";
  }
  if (RUNNERS.has(program)) {
    const verb = plain[0]?.toLowerCase();
    if (!verb) return program === "deno" ? "other" : "install";
    if (RUNNER_INSTALL.has(verb)) return "install";
    if (program === "bun" && verb === "test") return "tests";
    if (RUNNER_PASS.has(verb)) return plain[1] ? (scriptKind(plain[1]) ?? kindOf(plain.slice(1))) : undefined;
    return scriptKind(verb) ?? kindOf(plain);
  }
  if (PY_RUNNERS.has(program)) {
    const verb = plain[0]?.toLowerCase();
    if (verb && /^(?:add|install|sync|lock|pip)$/.test(verb)) return "install";
    return verb === "run" ? kindOf(plain.slice(1)) : undefined;
  }
  if (PYTHON.test(program)) {
    const module = args[args.indexOf("-m") + 1];
    if (args.includes("-m") && module) {
      if (module === "pip") return "install";
      if (module === "http.server") return "start";
      return kindOf([module, ...args.slice(args.indexOf("-m") + 2)]);
    }
    return undefined;
  }
  if (program === "cargo" || program === "go" || program === "swift") {
    const verb = plain[0]?.toLowerCase() ?? "";
    if (verb === "test") return "tests";
    if (/^(?:install|add|get|fetch)$/.test(verb)) return "install";
    if (/^(?:build|run)$/.test(verb)) return verb === "build" ? "build" : undefined;
    return scriptKind(verb);
  }
  if (program === "playwright") return plain[0] === "install" ? "install" : "tests";
  if (program === "vite" || program === "next" || program === "astro") return plain[0] === "build" ? "build" : "start";
  if (program === "electron") return "start";
  if (program === "node" && args.includes("--test")) return "tests";
  return PROGRAMS[program];
}

/** The kind of a command from its status-line target ("git push", "kill $(cat") and, when that names no program, its
 * whole text. Cut, empty or unknown commands are "other". */
export function commandKind(target: string | undefined, detail?: string): CommandKind {
  const fromTarget = target ? kindOf(words(target)) : undefined;
  if (fromTarget) return fromTarget;
  if (detail) {
    const main = detail.split(/&&|\|\||;|\|/).map((part) => kindOf(words(part))).find((kind) => kind && kind !== "files" && kind !== "wait");
    if (main) return main;
  }
  return "other";
}
