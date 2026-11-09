import { encode } from "uqr";

// Table QR codes for the printed cards. Error correction Q survives a stained
// or scratched sticker (25 % of the code); the 4-module quiet zone is what
// phone cameras expect around a code.
export const QR_INK = "#13241b";

export type QrSvgOptions = {
  /** Accessible name of the image, e.g. the table number. */
  label: string;
};

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// One path with a rectangle per horizontal run of dark modules: a few KB per
// code, sharp at any print size. `size` includes the quiet zone.
export function qrPath(url: string): { size: number; d: string } {
  if (!/^https?:\/\/\S+$/.test(url)) throw new Error("qrPath needs an http(s) URL");
  const qr = encode(url, { ecc: "Q", border: 4 });
  let d = "";
  qr.data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      d += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  });
  return { size: qr.size, d };
}

export function qrSvg(url: string, opts: QrSvgOptions): string {
  const { size, d } = qrPath(url);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" ` +
    `aria-label="${escapeAttr(opts.label)}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path fill="${QR_INK}" d="${d}"/></svg>`
  );
}
