// Stardom (display, Latin only) from the official Fontshare API (ADR-051).
// The font files are never stored in this public repository: the ITF Free
// Font License does not allow publishing them there.
export const FONTSHARE_API = "https://api.fontshare.com";
export const FONTSHARE_CDN = "https://cdn.fontshare.com";
// Stardom (display) and Switzer (body), both Latin only: Armenian and
// Cyrillic fall through per glyph to the Noto / Google Sans families.
export const STARDOM_CSS = `${FONTSHARE_API}/v2/css?f[]=stardom@400&f[]=switzer@400,500,600&display=swap`;
