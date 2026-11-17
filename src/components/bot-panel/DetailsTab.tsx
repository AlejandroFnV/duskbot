import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { api, useStore, type Bot } from "@/state/store";
import { PackageProvenance } from "../bot-settings/PackageProvenance";
import type { useBotSettingsDerived } from "../bot-settings/useBotSettingsDerived";
import { SelectPill } from "../ui/SelectPill";
import type { SimplePageId } from "./page-registry";
import { BotRoutines } from "../routines/BotRoutines";
import { CodingTasks } from "./CodingTasks";
import { Card, PanelSections, rowCls, RowText } from "./rows";
import { ModelSelectRow } from "../native/ModelSelectRow";
import { UsageMeterRow } from "../native/UsageMeter";
import { answeringModel, useThreadBackup } from "@/lib/thread-backup";
import { setVoicePrefs, useVoicePrefs, VOICE_LANGUAGES, VOICE_SPEEDS, type VoiceSpeed } from "./voice-prefs";

type Derived = ReturnType<typeof useBotSettingsDerived>;

/** The voices the installation's speech provider offers for this bot, the way Voice settings first lists them. */
function useVoiceOptions(bot: Bot, enabled: boolean) {
  const [voices, setVoices] = useState<Array<{ id: string; label: string }> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const current = bot.voice ? `?current=${encodeURIComponent(bot.voice)}` : "";
    void api(`/api/tts/voices${current}`)
      .then((answer: { voices?: Array<{ id: string; label: string }> }) => { if (alive) setVoices(answer.voices ?? []); })
      .catch(() => { if (alive) setVoices([]); });
    return () => { alive = false; };
  }, [enabled, bot.id]);
  return voices;
}

function VoiceChatRow({ label, children, row }: { label: string; children: ReactNode; row: string }) {
  return (
    <div data-panel-row={row} className={cn(rowCls, "gap-1.5")}>
      <RowText title={label} />
      {children}
    </div>
  );
}

/** Grok's Voice chat card: Voice, Speed and Language as ghost select pills. Voice is the bot's speaking voice; speed and
 * language are kept per bot on this device. */
/** The bot's model as it was on Bot settings: the Model row with the provider's mark, then its plan's usage when the
 * engine reports one. No heading over it: its first row already says Model. */
export function ModelCard({ bot }: { bot: Bot }) {
  useThreadBackup(bot, bot.threadId);
  const engine = answeringModel(bot, bot.threadId, bot.modelSelection).instanceId;
  return (
    <Card anchor="model">
      <div className="[&_[data-tour=model]>span:first-child]:flex! [&_[data-provider-mark]]:opacity-100!">
        <ModelSelectRow bot={bot} threadId={bot.threadId} title={t("botPanel.page.model")} thinking />
      </div>
      <UsageMeterRow engine={engine} />
    </Card>
  );
}

export function VoiceChatCard({ bot, patch }: { bot: Bot; patch: Derived["patch"] }) {
  const { state } = useStore();
  const tts = state.config?.tts;
  const voices = useVoiceOptions(bot, Boolean(tts?.configured)) ?? [];
  const prefs = useVoicePrefs(bot.id);
  // grok names the voice a bot speaks with by default, so the default row wears that voice's name
  const fallback = tts?.voice ? voices.find((entry) => entry.id === tts.voice) : undefined;
  const voice = bot.voice && bot.voice !== fallback?.id ? bot.voice : "";
  const voiceOptions = [
    { value: "", label: fallback?.label ?? (tts?.voice || !tts?.configured ? t("botPanel.voice.default") : t("botPanel.ui.voicePick")) },
    ...(voice && !voices.some((entry) => entry.id === voice) ? [{ value: voice, label: t("botPanel.ui.voiceCurrent") }] : []),
    ...voices.filter((entry) => entry !== fallback).map((entry) => ({ value: entry.id, label: entry.label })),
  ];
  return (
    <Card label={t("botPanel.section.voiceChat")} anchor="call">
      <VoiceChatRow row="voice" label={t("botPanel.ui.voiceTitle")}>
        <SelectPill data-panel-select="voice" aria-label={t("botPanel.ui.voiceTitle")} value={voice} options={voiceOptions} onChange={(next: string) => patch({ voice: next })} />
      </VoiceChatRow>
      <VoiceChatRow row="speed" label={t("botPanel.voice.speed")}>
        <SelectPill
          data-panel-select="speed"
          aria-label={t("botPanel.voice.speed")}
          value={prefs.speed}
          options={VOICE_SPEEDS.map((speed) => ({ value: speed, label: `${speed}x` }))}
          onChange={(speed: VoiceSpeed) => setVoicePrefs(bot.id, { speed })}
        />
      </VoiceChatRow>
      <VoiceChatRow row="language" label={t("botPanel.voice.language")}>
        <SelectPill
          data-panel-select="language"
          aria-label={t("botPanel.voice.language")}
          value={prefs.language}
          options={VOICE_LANGUAGES.map(([code, name]) => ({ value: code, label: name }))}
          onChange={(language: string) => setVoicePrefs(bot.id, { language })}
        />
      </VoiceChatRow>
    </Card>
  );
}

/** Grok's Details tab (routines or the line saying what one is, then Voice chat), with the few native rows Grok has no
 * home for: the bot's conversations, Work until done, its model and how much it asks first. */
export function DetailsTab({ bot }: {
  bot: Bot;
  derived: Derived;
  onOpen: (page: SimplePageId) => void;
}) {
  return (
    <PanelSections data-panel-tabpanel="details">
      <CodingTasks bot={bot} />
      <BotRoutines bot={bot} />

      <ModelCard bot={bot} />
      <PackageProvenance bot={bot} />
    </PanelSections>
  );
}
