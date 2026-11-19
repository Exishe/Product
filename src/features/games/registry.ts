import type { Game } from "./engine";

// The waiting-room games. Each one is its own chunk, fetched only when a
// guest opens it. Titles and rules live in messages under guest.games.<id>;
// the picture is public/games/<id>.webp (scripts/game-thumbs.mjs).
export const GAMES = [
  { id: "runner", load: () => import("./runner").then((m) => m.game) },
  { id: "fighter", load: () => import("./fighter").then((m) => m.game) },
  { id: "merge", load: () => import("./merge").then((m) => m.game) },
  { id: "slice", load: () => import("./slice").then((m) => m.game) },
  { id: "platformer", load: () => import("./platformer").then((m) => m.game) },
] as const satisfies readonly { id: string; load: () => Promise<Game> }[];

export type GameId = (typeof GAMES)[number]["id"];
