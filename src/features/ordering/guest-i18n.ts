// Guest pages translate on the client with this ~1 KB formatter instead of
// next-intl's client runtime (about 12 KB gzipped with its ICU parser), to
// keep the QR menu light on café Wi-Fi. The server passes the `guest`
// namespace of messages/{locale}.json; the formatter supports what those
// messages use: {name} placeholders and {count, plural, ...} with # and =N.
type Messages = { [key: string]: string | Messages };
export type Vars = Record<string, string | number>;
export type GuestT = (key: string, vars?: Vars) => string;

const pluralRules = new Map<string, Intl.PluralRules>();
const rules = (locale: string) => {
  let r = pluralRules.get(locale);
  if (!r) pluralRules.set(locale, (r = new Intl.PluralRules(locale)));
  return r;
};

function formatPlurals(template: string, vars: Vars, locale: string): string {
  let out = template;
  for (let start = out.search(/\{\s*\w+\s*,\s*plural\s*,/); start !== -1; start = out.search(/\{\s*\w+\s*,\s*plural\s*,/)) {
    let depth = 0;
    let end = start;
    for (; end < out.length; end++) {
      if (out[end] === "{") depth++;
      else if (out[end] === "}" && --depth === 0) break;
    }
    const block = /^\{\s*(\w+)\s*,\s*plural\s*,([\s\S]*)\}$/.exec(out.slice(start, end + 1));
    if (!block) break;
    const n = Number(vars[block[1] as string]);
    const forms: Record<string, string> = {};
    for (const f of (block[2] as string).matchAll(/(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g)) {
      forms[f[1] as string] = f[2] as string;
    }
    const form = forms[`=${n}`] ?? forms[rules(locale).select(n)] ?? forms.other ?? "";
    out = out.slice(0, start) + form.replace(/#/g, String(n)) + out.slice(end + 1);
  }
  return out;
}

export function formatMessage(template: string, vars: Vars, locale: string): string {
  return formatPlurals(template, vars, locale).replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function createT(messages: Messages, locale: string): GuestT {
  return (key, vars = {}) => {
    let node: string | Messages | undefined = messages;
    for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
    return typeof node === "string" ? formatMessage(node, vars, locale) : key;
  };
}
