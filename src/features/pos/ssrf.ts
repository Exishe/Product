// The SSRF guard for addresses an owner types (a webhook, an iiko/Syrve base
// URL override). Checked when saving (here and in private.pos_url_ok) and again
// right before every send, after resolving the name, so a public name that
// later points inside a network is refused too.

export type LookupAll = (host: string) => Promise<{ address: string; family: number }[]>;

/** IPv4 or IPv6 addresses we never call: private, loopback, link-local, CGNAT, multicast, reserved. */
export function isBlockedAddress(address: string): boolean {
  const a = address.toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = a.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [o1, o2, o3] = v4.slice(1, 4).map(Number) as [number, number, number];
    return (
      o1 === 0 ||
      o1 === 10 ||
      o1 === 127 ||
      o1 >= 224 ||
      (o1 === 100 && o2 >= 64 && o2 <= 127) ||
      (o1 === 169 && o2 === 254) ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168) ||
      (o1 === 192 && o2 === 0 && o3 === 0) ||
      (o1 === 198 && (o2 === 18 || o2 === 19))
    );
  }
  if (a.includes(":")) {
    return (
      a === "::" ||
      a === "::1" ||
      /^fe[89ab]/.test(a) || // link-local
      /^f[cd]/.test(a) || // unique local
      /^ff/.test(a) || // multicast
      a.startsWith("::ffff:") || // mapped forms we could not parse above
      a.startsWith("64:ff9b:") // NAT64 can reach IPv4 inside
    );
  }
  return true; // not an address at all
}

/** An https URL with a public-looking host (no lookup). Same rules as private.pos_url_ok. */
export function isPublicHttpsUrl(raw: string): boolean {
  if (raw.length > 500) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.startsWith("[")) return false; // IPv6 literals: never
  if (!host.includes(".") || host === "localhost") return false;
  if (/\.(localhost|local|internal|lan|home|corp)$/.test(host)) return false;
  if (/^[\d.]+$/.test(host)) return !isBlockedAddress(host);
  return true;
}

export class BlockedUrlError extends Error {
  constructor(reason: string) {
    super(`blocked_url: ${reason}`);
  }
}

/** Throws unless the URL is public and every address its host resolves to is public. */
export async function assertPublicUrl(raw: string, lookup: LookupAll): Promise<URL> {
  if (!isPublicHttpsUrl(raw)) throw new BlockedUrlError("not a public https address");
  const url = new URL(raw);
  const host = url.hostname.replace(/\.$/, "");
  if (/^[\d.]+$/.test(host)) return url;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new BlockedUrlError("the name does not resolve");
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address)))
    throw new BlockedUrlError("the name points to a private address");
  return url;
}
