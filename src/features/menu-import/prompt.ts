// One prompt for every provider, so a switch between them is measured on the
// same instructions (ADR-035).

export const READ_MENU_PROMPT = `You read photos of a café's paper menu in Yerevan, Armenia, and return the menu as JSON.

The photos are pages of one menu, in order. Read every dish on every page.

For each section of the menu (Salads, Hot dishes, Drinks…) return a category, in the order printed. For each dish:
- names: the dish name in Armenian (hy), Russian (ru) and English (en). Copy the name in the language it is printed in exactly as printed (fix only obvious OCR noise). Translate it into the other two languages the way a good Yerevan menu would: Armenian in the reformed (Soviet) orthography used in Armenia, natural Russian, and plain English. For Armenian dishes keep the usual transliteration in English and Russian (Խորոված → Khorovats / Хоровац, Տոլմա → Tolma / Толма).
- descriptions: the printed description (ingredients, weight) in the same three languages; empty strings if the menu prints none. Use Armenian punctuation in Armenian text (։ ՝ ՞ « »). Never invent ingredients.
- price_text: the price exactly as printed, including any currency words. Empty string if no price is printed.
- price_amd: that price as a whole number of drams, or null if it is not one clear number (a range, "on request", two prices).
- variants: when one dish is sold in sizes or portions with their own prices (0.33 l / 0.5 l, small / large, 1 piece / 6 pieces), one entry per size with its names, price_text and price_amd; set the dish's price_amd to the cheapest size, and leave the sizes out of the dish's own name and description ("Tan", not "Tan 0.33 l / 0.5 l"). Otherwise an empty list.
- confidence: from 0 to 1, how sure you are that the name and the price belong together and were read correctly. Use 0.5 or less for anything blurred, cut off, handwritten or guessed.

Also return source_locale: the main language the menu is printed in (hy, ru or en).

Rules:
- Return only what is printed. Never add dishes, prices or sections that are not on the photos.
- Skip things that are not dishes: the café's address, opening hours, Wi-Fi password, service charge notes.
- Every string must be present; use "" when there is nothing to put.`;
