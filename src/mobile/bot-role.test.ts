import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { botRole, NameRole } from "./bot-role";

describe("botRole", () => {
  it("reads the profile title, trimmed", () => {
    expect(botRole({ title: "  Tech Lead ", chiefOfStaff: false })).toBe("Tech Lead");
  });

  it("is empty with no title", () => {
    expect(botRole({ title: "", chiefOfStaff: false })).toBe("");
    expect(botRole({ title: "   ", chiefOfStaff: true })).toBe("");
  });

  it("leaves out a title that only repeats the Chief of Staff badge", () => {
    expect(botRole({ title: "chief of staff", chiefOfStaff: true })).toBe("");
    expect(botRole({ title: "Chief of Staff", chiefOfStaff: false })).toBe("Chief of Staff");
  });
});

describe("NameRole", () => {
  it("reads as one line, name then role", () => {
    const html = renderToStaticMarkup(createElement(NameRole, { name: "Ada", role: "Tech Lead" }));
    expect(html.replace(/<[^>]+>/g, "")).toBe("Ada · Tech Lead");
  });

  it("is only the name with no role", () => {
    const html = renderToStaticMarkup(createElement(NameRole, { name: "Ada", role: "" }));
    expect(html.replace(/<[^>]+>/g, "")).toBe("Ada");
  });
});

describe("featured tiles", () => {
  it("show only the name: a role cut short in a narrow tile confuses more than it helps", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./HomeScreen.tsx", import.meta.url), "utf8");
    const tile = src.slice(src.indexOf("function PinnedTileFace"), src.indexOf("function RowFace"));
    expect(tile).toContain("{bot.name}");
    expect(tile).not.toContain("NameRole");
  });
});
