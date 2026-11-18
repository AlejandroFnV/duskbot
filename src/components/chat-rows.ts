import { createContext, useContext, useRef, type Dispatch } from "react";
import type { MentionPeer } from "@/lib/mentions";
import type { userBubbleStyle } from "@/lib/user-bubble-tone";
import type { Action, AppState, Bot, ConfigStatus } from "@/state/store";

export interface ChatRows {
  botId: string; threadId: string; botName: string; botColor: Bot["color"]; voiceId?: string;
  tts: ConfigStatus["tts"]; localVoice: boolean;
  hasMore: boolean; bots: readonly Bot[];
  mentionPeers: readonly MentionPeer[]; mentionPerson: { profileName?: string };
  /** On a Team Cloud, the viewer's person key: another person's line carries their name. */
  speakerViewer?: string | null;
  focus: AppState["focusMessage"];
  showToolCalls: boolean;
  locale: string;
  bubbleStyle?: ReturnType<typeof userBubbleStyle>;
  dispatch: Dispatch<Action>;
  conversational: boolean; simple?: boolean; canReact: boolean;
  openedAt: number;
  /** Set on rows shown here from another of the bot's conversations: anything to answer is answered there. */
  elsewhere?: { title: string };
}

export const ChatRowsContext = createContext<ChatRows | null>(null);

export function useChatRows(): ChatRows {
  const rows = useContext(ChatRowsContext);
  if (!rows) throw new Error("a chat row outside ChatView");
  return rows;
}

const drawnBot = (bot: Bot) =>
  [bot.id, bot.name, bot.hidden, bot.color, bot.mascotBody, bot.mascotExpression, bot.mascotFaceColor, bot.avatarUrl, bot.avatarCrop, bot.avatarZoom, bot.avatarFocusX, bot.avatarFocusY].join("\u0001");

export function useDrawnBots(bots: readonly Bot[]): readonly Bot[] {
  const signature = bots.map(drawnBot).join("\u0002");
  const cache = useRef({ signature, bots });
  if (cache.current.signature !== signature) cache.current = { signature, bots };
  return cache.current.bots;
}
