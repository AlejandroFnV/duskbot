export interface OutsideWriteCardField {
  /** What work from outside asked to write where later turns read it; nothing is written until a person says yes. */
  outsideWrite?: { kind: "room-bulletin"; roomId: string; bulletin: string } | { kind: "memory"; action: string; text?: string; oldText?: string; until?: string }
    /** A standing preference for the About me of the person whose words began the work; `owner` is the layer About me
     * finds them by. It is saved only by that person's tap, before `expiresAt`. */
    | { kind: "preference"; text: string; replaces?: string[]; owner: { botId: string; botName: string }; person?: string; expiresAt: string };
}
