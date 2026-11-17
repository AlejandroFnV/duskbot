import { BOTS_SECTION_ID, CHANNELS_SECTION_ID, userSectionName } from "@/lib/sidebar-layout";

export const ROOM_ROW_DRAG_TYPE = "application/x-dusk-sidebar-room";

/** The department a room dropped on a sidebar section goes to (`""`: none), or null where rooms cannot go. */
export function roomDropSection(sectionId: string): string | null {
  if (sectionId === CHANNELS_SECTION_ID || sectionId === BOTS_SECTION_ID) return "";
  return userSectionName(sectionId);
}

/** The room a drag carries, or null when it carries something else. */
export function draggedRoom(data: Pick<DataTransfer, "types" | "getData">): string | null {
  return data.types.includes(ROOM_ROW_DRAG_TYPE) ? data.getData(ROOM_ROW_DRAG_TYPE) || null : null;
}
