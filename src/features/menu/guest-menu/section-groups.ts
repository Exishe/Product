// The menu's sections gathered into a few big groups for the section dropdown:
// a bar list with 39 sections (wine by the glass, sparkling, red, white...)
// reads as four words, not a wall of tabs. The data has no group field, so
// the group comes from the section's name in any of the three languages; a
// name no rule knows stays with the food. A menu that ends up with a single
// group gets one plain "Sections" dropdown instead (see category-nav.tsx).
//
// To make this exact one day a section would carry its own group; until
// then a wrong guess only moves a section to a neighbouring dropdown.

export const GROUPS = ["food", "desserts", "drinks", "wine"] as const;
export type SectionGroup = (typeof GROUPS)[number];

// Order matters: a «Գինի բաժակով» is wine before it is a drink.
const RULES: readonly [SectionGroup, RegExp][] = [
  [
    "wine",
    /wine|champagne|sparkling|ros[eé]|vermouth|gin\b|vodka|whisk|cognac|brandy|liqueur|amaro|anise|spirit|գինի|փրփրուն|վերմուտ|ջին|օղի|վիսկի|կոնյակ|լիկյոր|ամարո|անիսոն|вин[оа]|шампанск|игрист|вермут|джин|водк|виски|коньяк|ликёр|ликер|амаро|анис/i,
  ],
  [
    "drinks",
    /coffee|tea\b|juice|lemonade|drink|water|compote|cocoa|beverage|smoothie|beer|սուրճ|թեյ|հյութ|լիմոնադ|ըմպելի|ջուր|կոմպոտ|կակաո|գարեջուր|թան\b|кофе|чай|сок|лимонад|напит|вода|компот|какао|пиво/i,
  ],
  [
    "desserts",
    /dessert|sorbet|gelato|ice cream|sweet|candy|candies|cake|աղանդեր|սորբեն|ջելատո|պաղպաղակ|կոնֆետ|десерт|сорбет|джелато|мороженое|конфет|торт|сладк/i,
  ],
];

export function groupOf(name: string | null | undefined): SectionGroup {
  const text = (name ?? "").normalize("NFC");
  return RULES.find(([, re]) => re.test(text))?.[0] ?? "food";
}

/** The sections split into the groups they belong to, in menu order, empty groups left out. */
export function groupSections<T extends { name: { text: string } | null }>(
  sections: readonly T[],
): { group: SectionGroup; sections: T[] }[] {
  return GROUPS.map((group) => ({
    group,
    sections: sections.filter((s) => groupOf(s.name?.text) === group),
  })).filter((g) => g.sections.length > 0);
}
