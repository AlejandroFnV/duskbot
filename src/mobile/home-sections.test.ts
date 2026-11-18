import { describe, expect, it } from "vitest";
import { BOTS_SECTION_ID, userSectionId } from "@/lib/sidebar-layout";
import { homeSections } from "./home-sections";

const item = (id: string, at: number, section?: string) => ({ id, at, section });

describe("homeSections", () => {
  it("keeps one plain list when there are no departments", () => {
    const sections = homeSections([item("a", 1), item("b", 3), item("c", 2)], []);
    expect(sections).toEqual([{ id: BOTS_SECTION_ID, name: null, items: [item("b", 3), item("c", 2), item("a", 1)] }]);
  });

  it("puts departments first in their saved order and the rest last, each newest first", () => {
    const sections = homeSections(
      [item("a", 1, "Trabajo"), item("b", 5), item("c", 4, "Negocio"), item("d", 9, "Trabajo")],
      ["Negocio", "Trabajo"],
    );
    expect(sections.map((section) => [section.id, section.items.map((entry) => entry.id)])).toEqual([
      [userSectionId("Negocio"), ["c"]],
      [userSectionId("Trabajo"), ["d", "a"]],
      [BOTS_SECTION_ID, ["b"]],
    ]);
  });

  it("adds a department a chat names that is not saved yet, after the saved ones", () => {
    const sections = homeSections([item("a", 1, "Casa"), item("b", 2, "Trabajo")], ["Trabajo"]);
    expect(sections.map((section) => section.name)).toEqual(["Trabajo", "Casa"]);
  });

  it("leaves out empty departments", () => {
    expect(homeSections([item("a", 1)], ["Vacía"]).map((section) => section.name)).toEqual([null]);
  });
});
