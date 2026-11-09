// Menu search that forgives the script: a guest may type «խորոված», «хоровац»
// or "khorovats" (gaps.md). Every name is reduced to a rough Latin sound key.

const ARMENIAN: Record<string, string> = {
  ա: "a", բ: "b", գ: "g", դ: "d", ե: "e", զ: "z", է: "e", ը: "e", թ: "t", ժ: "zh", ի: "i", լ: "l",
  խ: "kh", ծ: "ts", կ: "k", հ: "h", ձ: "dz", ղ: "gh", ճ: "ch", մ: "m", յ: "y", ն: "n", շ: "sh",
  ո: "o", չ: "ch", պ: "p", ջ: "j", ռ: "r", ս: "s", վ: "v", տ: "t", ր: "r", ց: "ts", ւ: "v",
  փ: "p", ք: "k", և: "ev", օ: "o", ֆ: "f",
};

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(word: string): string {
  let out = "";
  for (let i = 0; i < word.length; i++) {
    const ch = word[i] as string;
    const next = word[i + 1];
    const initial = i === 0;
    if (ch === "ո" && next === "ւ") {
      out += "u"; // ու is one vowel
      i++;
    } else if (ch === "ո" && initial) {
      out += "vo";
    } else if (ch === "ե" && initial) {
      out += "ye";
    } else if (ch === "д" && next === "ж") {
      out += "j"; // Джермук = Jermuk
      i++;
    } else {
      out += ARMENIAN[ch] ?? CYRILLIC[ch] ?? ch;
    }
  }
  return out;
}

export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) =>
      transliterate(word)
        .replace(/kh/g, "h")
        .replace(/gh/g, "g")
        .replace(/tz/g, "ts")
        .replace(/^ye/, "e")
        .replace(/[^a-z0-9]/g, "")
        .replace(/([a-z])\1+/g, "$1"),
    )
    .filter(Boolean)
    .join(" ");
}

export function matchesSearch(names: readonly string[], query: string): boolean {
  const q = normalizeForSearch(query);
  if (q === "") return true;
  return names.some((name) => normalizeForSearch(name).includes(q));
}
