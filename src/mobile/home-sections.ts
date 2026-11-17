import { BOTS_SECTION_ID, userSectionId, type SidebarSectionId } from "@/lib/sidebar-layout";

export type HomeSectionItem = { id: string; at: number; section?: string };

export type HomeSection<T extends HomeSectionItem> = {
  /** The desktop sidebar's own ids, so a collapsed section stays collapsed by the same name. */
  id: SidebarSectionId;
  /** The department's name; null for the chats outside every department. */
  name: string | null;
  items: T[];
};

/** The phone's list split the way the desktop sidebar splits it: one section per department, in the saved department
 * order (then any a bot or room names that is not saved yet), and last the chats outside every department, as grok
 * puts its Unassigned. Each section lists its chats newest first. With no departments it is one section, a plain list. */
export function homeSections<T extends HomeSectionItem>(items: T[], departments: string[]): HomeSection<T>[] {
  const names = [...departments];
  for (const item of items) if (item.section && !names.includes(item.section)) names.push(item.section);
  const newest = (list: T[]) => [...list].sort((a, b) => b.at - a.at);
  const sections: HomeSection<T>[] = names
    .map((name) => ({ id: userSectionId(name), name, items: newest(items.filter((item) => item.section === name)) }))
    .filter((section) => section.items.length > 0);
  const rest = newest(items.filter((item) => !item.section || !names.includes(item.section)));
  if (rest.length > 0) sections.push({ id: BOTS_SECTION_ID, name: null, items: rest });
  return sections;
}
