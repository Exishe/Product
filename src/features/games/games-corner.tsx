"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { bestScore, createSfx, saveBest, type Game, type GameApi } from "./engine";
import { GAMES, type GameId } from "./registry";

// "Play while you wait" on the order status page: five small games in a
// full-screen layer. A game's code is fetched only when it is opened. When
// the order turns ready, a banner covers the game and pauses it, so the
// guest never misses their food.
type Phase = "intro" | "loading" | "playing" | "over";
const READY_ICON = "🍽️";
const SOUND_KEY = "pativ:games:sound";

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function GamesCorner({ ready }: { ready: boolean }) {
  const { t } = useGuestI18n();
  const [open, setOpen] = useState<GameId | null>(null);

  return (
    <section className="mt-8" aria-labelledby="games-title">
      <h2 id="games-title" className="display-face text-2xl">
        {t("games.title")}
      </h2>
      <p className="mt-1 text-sm text-muted">{t("games.subtitle")}</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 min-[400px]:grid-cols-3">
        {GAMES.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => setOpen(g.id)}
              data-testid={`game-${g.id}`}
              className="flex min-h-24 w-full flex-col items-start justify-between gap-2 rounded-sheet border border-line bg-white p-3 text-left transition-transform hover:border-tarragon hover:bg-tarragon-tint active:scale-[0.97]"
            >
              <span aria-hidden="true" className="text-3xl leading-none">
                {g.icon}
              </span>
              <span className="text-sm leading-tight font-semibold">{t(`games.${g.id}.name`)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && <GameLayer key={open} id={open} ready={ready} onClose={() => setOpen(null)} />}
    </section>
  );
}

function GameLayer({ id, ready, onClose }: { id: GameId; ready: boolean; onClose: () => void }) {
  const { t, locale } = useGuestI18n();
  const def = GAMES.find((g) => g.id === id)!;
  const [phase, setPhase] = useState<Phase>("intro");
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => bestScore(id));
  const [newBest, setNewBest] = useState(false);
  const [failed, setFailed] = useState(false);
  // The banner is for the moment the order turns ready while the guest plays:
  // not when it already was ready on opening, and "keep playing" dismisses it.
  const [readyAtOpen] = useState(ready);
  const [readySeen, setReadySeen] = useState(false);
  const showReady = ready && !readyAtOpen && !readySeen;
  const paused = useRef(false);
  useEffect(() => {
    paused.current = showReady;
  }, [showReady]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const pushed = useRef(false);
  // Sound is off until the guest turns it on (a café), and the choice is kept.
  const [sound, setSound] = useState(() => readSound());
  const soundOn = useRef(sound);
  useEffect(() => {
    soundOn.current = sound;
    try {
      localStorage.setItem(SOUND_KEY, sound ? "1" : "0");
    } catch {
      // private mode: the choice lasts for this visit
    }
  }, [sound]);
  const sfx = useRef<ReturnType<typeof createSfx> | null>(null);
  useEffect(
    () => () => {
      sfx.current?.close();
      sfx.current = null;
    },
    [],
  );

  // The phone's back button closes the game, not the page.
  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    }
    onClose();
  }, [onClose]);
  useEffect(() => {
    window.history.pushState({ pativGame: id }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previous;
    };
  }, [id, onClose, close]);

  const start = async () => {
    setFailed(false);
    if (!gameRef.current) {
      setPhase("loading");
      try {
        gameRef.current = await def.load();
      } catch {
        setFailed(true);
        setPhase("intro");
        return;
      }
    }
    setScore(0);
    setNewBest(false);
    setRound((r) => r + 1);
    setPhase("playing");
  };

  useEffect(() => {
    const game = gameRef.current;
    const el = canvas.current;
    if (phase !== "playing" || !game || !el) return;
    let over = false;
    const api: GameApi = {
      canvas: el,
      setScore: (s) => !over && setScore(s),
      gameOver: (s) => {
        if (over) return;
        over = true;
        setScore(s);
        const previous = bestScore(id);
        setBest(saveBest(id, s));
        setNewBest(s > previous && s > 0);
        setPhase("over");
      },
      isPaused: () => paused.current,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      locale,
      sfx: (kind, pitch) => (sfx.current ??= createSfx(() => soundOn.current)).play(kind, pitch),
    };
    return game.mount(api);
    // round remounts the game for "play again"
  }, [phase, round, id, locale]);

  const button = "min-h-12 rounded-sheet px-5 font-semibold transition-transform active:scale-95";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(`games.${id}.name`)}
      className="fixed inset-0 z-50 flex flex-col bg-basalt text-slip"
      data-testid="game-layer"
    >
      <div className="mx-auto flex h-14 w-full max-w-[900px] flex-none items-center gap-3 px-3">
        <button
          type="button"
          onClick={close}
          aria-label={t("games.close")}
          className="grid size-11 place-items-center rounded-full text-slip hover:bg-basalt-3"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate font-semibold">{t(`games.${id}.name`)}</span>
        <button
          type="button"
          onClick={() => setSound((on) => !on)}
          aria-pressed={sound}
          aria-label={t("games.sound")}
          className="grid size-11 place-items-center rounded-full text-slip hover:bg-basalt-3 aria-pressed:text-apricot-on-dark"
          data-testid="game-sound"
        >
          <SpeakerIcon on={sound} />
        </button>
        <span className="text-right text-sm leading-tight">
          <span className="block text-slip-dim">{t("games.best", { score: best })}</span>
          <span className="num block text-lg font-semibold text-apricot-on-dark" aria-live="off">
            {score}
          </span>
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        {(phase === "playing" || phase === "over") && (
          <canvas
            key={round}
            ref={canvas}
            aria-label={t(`games.${id}.name`)}
            className="block size-full touch-none select-none"
          />
        )}

        {(phase === "intro" || phase === "loading") && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="grid max-w-sm justify-items-center gap-4 text-center">
              <span aria-hidden="true" className="text-6xl">
                {def.icon}
              </span>
              <h2 className="display-face text-3xl">{t(`games.${id}.name`)}</h2>
              <p className="text-slip-dim">{t(`games.${id}.howTo`)}</p>
              {failed && <p className="font-semibold text-pom-on-dark">{t("games.loadFailed")}</p>}
              <button
                type="button"
                onClick={() => void start()}
                disabled={phase === "loading"}
                className={`${button} min-w-40 bg-apricot text-ink hover:bg-apricot-on-dark disabled:opacity-70`}
                data-testid="game-start"
              >
                {phase === "loading" ? t("games.loading") : t("games.start")}
              </button>
              <button
                type="button"
                onClick={() => setSound((on) => !on)}
                aria-pressed={sound}
                className="flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-slip-dim hover:bg-basalt-3 aria-pressed:text-apricot-on-dark"
                data-testid="game-sound-intro"
              >
                <SpeakerIcon on={sound} />
                {sound ? t("games.soundOn") : t("games.soundOff")}
              </button>
            </div>
          </div>
        )}

        {phase === "over" && !showReady && (
          <div className="absolute inset-0 grid place-items-center bg-basalt/70 p-6">
            <div className="grid min-w-64 justify-items-center gap-3 rounded-bottom-sheet bg-basalt-2 p-6 text-center shadow-float">
              <p className="text-slip-dim">{t("games.over")}</p>
              <p className="num text-5xl font-semibold text-apricot-on-dark" data-testid="game-score">
                {score}
              </p>
              {newBest && <p className="font-semibold text-tarragon-on-dark">{t("games.newBest")}</p>}
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => void start()} className={`${button} bg-apricot text-ink hover:bg-apricot-on-dark`}>
                  {t("games.again")}
                </button>
                <button type="button" onClick={close} className={`${button} border border-slip-dim text-slip hover:bg-basalt-3`}>
                  {t("games.other")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showReady && (
          <div className="absolute inset-0 grid place-items-center bg-basalt/80 p-6" role="alertdialog" aria-labelledby="ready-title">
            <div className="grid max-w-sm justify-items-center gap-3 rounded-bottom-sheet bg-tarragon p-6 text-center text-white shadow-float">
              <span aria-hidden="true" className="text-5xl">
                {READY_ICON}
              </span>
              <h2 id="ready-title" className="display-face text-3xl">
                {t("games.ready")}
              </h2>
              <p>{t("games.readyHint")}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={close} className={`${button} bg-white text-tarragon hover:bg-tarragon-tint`} autoFocus>
                  {t("games.readyOk")}
                </button>
                <button type="button" onClick={() => setReadySeen(true)} className={`${button} border border-white/70 text-white hover:bg-white/10`}>
                  {t("games.keepPlaying")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
    </svg>
  );
}
