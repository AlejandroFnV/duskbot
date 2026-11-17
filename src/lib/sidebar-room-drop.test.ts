import { describe, expect, it } from "vitest";
import { BOT_CHATS_SECTION_ID, BOTS_SECTION_ID, CHANNELS_SECTION_ID, PINNED_SECTION_ID, userSectionId } from "./sidebar-layout";
import { draggedRoom, ROOM_ROW_DRAG_TYPE, roomDropSection } from "./sidebar-room-drop";

describe("a room dropped on a sidebar section", () => {
  it("goes to that department, or out of every department over the group chats and the unassigned bots", () => {
    expect(roomDropSection(userSectionId("Work"))).toBe("Work");
    expect(roomDropSection(CHANNELS_SECTION_ID)).toBe("");
    expect(roomDropSection(BOTS_SECTION_ID)).toBe("");
  });

  it("goes nowhere over the pinned bots or the bot chats", () => {
    expect(roomDropSection(PINNED_SECTION_ID)).toBeNull();
    expect(roomDropSection(BOT_CHATS_SECTION_ID)).toBeNull();
  });

  it("is read only from a room drag", () => {
    const data = (types: string[], value: string) => ({ types, getData: (type: string) => (types.includes(type) ? value : "") });
    expect(draggedRoom(data([ROOM_ROW_DRAG_TYPE], "room"))).toBe("room");
    expect(draggedRoom(data(["text/plain"], "room"))).toBeNull();
  });
});
