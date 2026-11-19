"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConciergeBell, Gamepad2 } from "lucide-react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { bestScore, createSfx, saveBest, type Game, type GameApi } from "./engine";
import { GAMES, type GameId } from "./registry";

// "Play while you wait" on the order status page: five small games in a
// full-screen layer. A game's code is fetched only when it is opened. When
// the order turns ready, a banner covers the game and pauses it, so the
// guest never misses their food.
type Phase = "intro" | "loading" | "playing" | "over";
const SOUND_KEY = "pativ:games:sound";

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

// The bottom bar's Games item brings the guest back here (#games) while the
// order cooks (ADR-052; it replaced the floating "back to the games" button).
export function GamesCorner({ ready, waiting = false }: { ready: boolean; waiting?: boolean }) {
  const { t } = useGuestI18n();
  const [open, setOpen] = useState<GameId | null>(null);
  return (
    <>
      <section
        id="games"
        className="rounded-feature bg-basalt text-slip shadow-plate mt-2 mb-4 scroll-mt-4 overflow-hidden px-4 pt-6 pb-5 md:px-6"
        aria-labelledby="games-title"
        data-testid="games"
      >
        <div className="flex items-center gap-3">
          <Gamepad2 size={34} strokeWidth={1.75} className="text-apricot-on-dark flex-none" aria-hidden />
          <div>
            <h3 id="games-title" className="display-face text-2xl leading-tight">
              {t("games.title")}
            </h3>
            <p className="text-slip-dim text-sm">{t("games.subtitle")}</p>
          </div>
        </div>
        <ul className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:scroll-px-6 md:px-6 [&::-webkit-scrollbar]:hidden">
          {GAMES.map((g) => (
            <li key={g.id} className="w-[min(72%,17rem)] flex-none snap-start md:w-[12.5rem]">
              <button
                type="button"
                onClick={() => setOpen(g.id)}
                data-testid={`game-${g.id}`}
                className="group rounded-sheet bg-basalt-2 ring-basalt-3 hover:ring-apricot-on-dark block w-full overflow-hidden text-left ring-1 transition-transform active:scale-[0.97]"
              >
                <span className="bg-basalt-3 relative block aspect-[4/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- small static thumbnails, no optimizer needed */}
                  <img
                    src={`/games/${g.id}.webp`}
                    alt=""
                    width={480}
                    height={360}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </span>
                <span className="flex items-center justify-between gap-2 p-3">
                  <span className="min-w-0 leading-tight font-semibold">{t(`games.${g.id}.name`)}</span>
                  <span className="rounded-pill bg-deep-accent text-on-deep-accent flex-none px-3 py-1 text-sm font-semibold">
                    {t("games.play")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {open && (
        <GameLayer key={open} id={open} ready={ready} waiting={waiting} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function GameLayer({
  id,
  ready,
  waiting,
  onClose,
}: {
  id: GameId;
  ready: boolean;
  waiting: boolean;
  onClose: () => void;
}) {
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
      // The café's accent for dark surfaces (guest theme tokens) for the few
      // accents the games draw themselves, such as the ring on a pressed pad
      // button over the dark pad (--guest-accent can be near-black).
      accent: getComputedStyle(el).getPropertyValue("--guest-deep-accent").trim() || undefined,
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
      className="bg-basalt text-slip fixed inset-0 z-50 flex flex-col"
      data-testid="game-layer"
    >
      <div className="mx-auto flex h-14 w-full max-w-[900px] flex-none items-center gap-3 px-3">
        <button
          type="button"
          onClick={close}
          aria-label={t("games.close")}
          className="text-slip hover:bg-basalt-3 grid size-11 place-items-center rounded-full"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-semibold">{t(`games.${id}.name`)}</span>
          {/* A quiet line that the kitchen is still on it: the game yields to the real wait. */}
          {waiting && !ready && (
            <span className="text-slip-dim line-clamp-2 text-xs leading-tight" data-testid="game-cooking">
              <span
                aria-hidden="true"
                className="bg-slip-dim me-1.5 inline-block size-1.5 rounded-full align-middle motion-safe:animate-pulse"
              />
              {t("games.cooking")}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setSound((on) => !on)}
          aria-pressed={sound}
          aria-label={t("games.sound")}
          className="text-slip hover:bg-basalt-3 aria-pressed:text-apricot-on-dark grid size-11 place-items-center rounded-full"
          data-testid="game-sound"
        >
          <SpeakerIcon on={sound} />
        </button>
        <span className="text-right text-sm leading-tight">
          <span className="text-slip-dim block">{t("games.best", { score: best })}</span>
          <span className="num text-apricot-on-dark block text-lg font-semibold" aria-live="off">
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
              {/* eslint-disable-next-line @next/next/no-img-element -- the same small static picture as the card */}
              <img
                src={`/games/${id}.webp`}
                alt=""
                width={480}
                height={360}
                decoding="async"
                className="rounded-sheet ring-basalt-3 shadow-float aspect-[4/3] w-56 object-cover ring-1"
              />
              <h2 className="display-face text-3xl">{t(`games.${id}.name`)}</h2>
              <p className="text-slip-dim">{t(`games.${id}.howTo`)}</p>
              {failed && <p className="text-pom-on-dark font-semibold">{t("games.loadFailed")}</p>}
              <button
                type="button"
                onClick={() => void start()}
                disabled={phase === "loading"}
                className={`${button} bg-deep-accent text-on-deep-accent min-w-40 disabled:opacity-70`}
                data-testid="game-start"
              >
                {phase === "loading" ? t("games.loading") : t("games.start")}
              </button>
              <button
                type="button"
                onClick={() => setSound((on) => !on)}
                aria-pressed={sound}
                className="text-slip-dim hover:bg-basalt-3 aria-pressed:text-apricot-on-dark flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
                data-testid="game-sound-intro"
              >
                <SpeakerIcon on={sound} />
                {sound ? t("games.soundOn") : t("games.soundOff")}
              </button>
            </div>
          </div>
        )}

        {phase === "over" && !showReady && (
          <div className="bg-basalt/70 absolute inset-0 grid place-items-center p-6">
            <div className="rounded-bottom-sheet bg-basalt-2 shadow-float grid min-w-64 justify-items-center gap-3 p-6 text-center">
              <p className="text-slip-dim">{t("games.over")}</p>
              <p className="num text-apricot-on-dark text-5xl font-semibold" data-testid="game-score">
                {score}
              </p>
              {newBest && <p className="text-tarragon-on-dark font-semibold">{t("games.newBest")}</p>}
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => void start()}
                  className={`${button} bg-deep-accent text-on-deep-accent`}
                >
                  {t("games.again")}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className={`${button} border-slip-dim text-slip hover:bg-basalt-3 border`}
                >
                  {t("games.other")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showReady && (
          <div
            className="bg-basalt/80 absolute inset-0 grid place-items-center p-6"
            role="alertdialog"
            aria-labelledby="ready-title"
          >
            <div className="rounded-bottom-sheet bg-tarragon shadow-float grid max-w-sm justify-items-center gap-3 p-6 text-center text-white">
              <ConciergeBell size={48} strokeWidth={1.75} aria-hidden />
              <h2 id="ready-title" className="display-face text-3xl">
                {t("games.ready")}
              </h2>
              <p>{t("games.readyHint")}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={close}
                  className={`${button} text-tarragon hover:bg-tarragon-tint bg-white`}
                  autoFocus
                >
                  {t("games.readyOk")}
                </button>
                <button
                  type="button"
                  onClick={() => setReadySeen(true)}
                  className={`${button} border border-white/70 text-white hover:bg-white/10`}
                >
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
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
    </svg>
  );
}
