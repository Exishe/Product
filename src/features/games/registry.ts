import type { Game } from "./engine";

// The waiting-room games. Each one is its own chunk, fetched only when a
// guest opens it. Titles and rules live in messages under guest.games.<id>.
export const GAMES = [
  { id: "runner", icon: "☕", load: () => import("./runner").then((m) => m.game) },
  { id: "fighter", icon: "🍳", load: () => import("./fighter").then((m) => m.game) },
  { id: "merge", icon: "💋", load: () => import("./merge").then((m) => m.game) },
  { id: "slice", icon: "🍅", load: () => import("./slice").then((m) => m.game) },
  { id: "platformer", icon: "🐈", load: () => import("./platformer").then((m) => m.game) },
] as const satisfies readonly { id: string; icon: string; load: () => Promise<Game> }[];

export type GameId = (typeof GAMES)[number]["id"];
