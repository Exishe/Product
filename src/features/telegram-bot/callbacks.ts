// callback_data of the inline buttons. At most 64 bytes (Telegram's limit), one
// verb letter and at most one opaque argument. The argument is never trusted:
// the database checks it against the linked account (private.bot_handle).
//   m menu | a:<action> | p:<uuid> pick | c:<choice> | g:<page> | b back | x cancel
//   k:<token> confirm | u undo | h history | l:<hy|ru|en>
// The database accepts exactly this shape; keep the two in step.
export const CALLBACK_PATTERN = /^[a-z](:[A-Za-z0-9_-]{1,40})?$/;

export const cb = {
  menu: () => "m",
  action: (id: string) => `a:${id}`,
  pick: (id: string) => `p:${id}`,
  choice: (value: string) => `c:${value}`,
  page: (n: number) => `g:${n}`,
  back: () => "b",
  cancel: () => "x",
  confirm: (token: string) => `k:${token}`,
  undo: () => "u",
  history: () => "h",
  language: (l: string) => `l:${l}`,
};
