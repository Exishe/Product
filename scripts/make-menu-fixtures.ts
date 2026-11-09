// Renders the two menu photos in tests/fixtures/menus/ that the live AI test
// reads. They are made here, not photographed, so they carry no licence
// question; real Yerevan menus come from the field visits (go-to-market.md).
// Run: node scripts/make-menu-fixtures.ts

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = new URL("../tests/fixtures/menus/", import.meta.url);
mkdirSync(out, { recursive: true });

const page = (body: string, font: string) => `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.replace(/ /g, "+")}:wght@400;700&display=block">
<style>
  html { background: #6b5b4a; }
  body { margin: 0; padding: 60px; font-family: "${font}", serif; }
  .sheet { background: #f6f1e4; color: #2b2118; padding: 56px 64px; transform: rotate(-1.4deg);
           box-shadow: 0 18px 40px rgba(0,0,0,.45); width: 960px; }
  h1 { text-align: center; font-size: 48px; margin: 0 0 8px; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 20px; margin-bottom: 36px; }
  h2 { font-size: 30px; border-bottom: 2px solid #2b2118; padding-bottom: 4px; margin: 32px 0 14px; }
  .row { display: flex; font-size: 25px; margin: 10px 0; }
  .row span:first-child { flex: 1; }
  .desc { font-size: 18px; margin: -6px 0 10px 0; opacity: .8; }
  .foot { margin-top: 40px; font-size: 18px; text-align: center; opacity: .85; }
</style></head><body><div class="sheet">${body}</div></body></html>`;

const row = (name: string, price: string, desc = "") =>
  `<div class="row"><span>${name}</span><span>${price}</span></div>${desc ? `<div class="desc">${desc}</div>` : ""}`;

const armenian = page(
  `<h1>Սրճարան «Ծիրան»</h1><div class="sub">Ճաշացանկ</div>
   <h2>Նախուտեստներ</h2>
   ${row("Պանրի ափսե", "2 500 դր.", "Լոռի, չանախ, մոտալ, կանաչի")}
   ${row("Ամառային աղցան", "1 800 դր.", "Լոլիկ, վարունգ, կանաչ սոխ")}
   <h2>Տաք ուտեստներ</h2>
   ${row("Խոզի խորոված", "3 200 դր.")}
   ${row("Տոլմա խաղողի տերևով", "2 800 դր.")}
   ${row("Խաշլամա", "4 500 դր.")}
   <h2>Ըմպելիքներ</h2>
   ${row("Հայկական սուրճ", "600 դր.")}
   ${row("Թան 0.33 լ / 0.5 լ", "500 / 800")}
   ${row("Ջերմուկ", "700 դր.")}
   <div class="foot">Աբովյան 12, Երևան · Wi-Fi՝ tsiran2026 · Սպասարկում՝ 10%</div>`,
  "Noto Sans Armenian",
);

const russian = page(
  `<h1>Кафе «Каскад»</h1><div class="sub">Меню</div>
   <h2>Завтраки</h2>
   ${row("Сырники со сметаной", "1.800")}
   ${row("Омлет с зеленью", "1.500")}
   <h2>Основные блюда</h2>
   ${row("Хоровац из свинины", "3.200 драм")}
   ${row("Толма в виноградных листьях", "2.900 драм")}
   ${row("Шашлык из баранины", "2500–3000")}
   <h2>Напитки</h2>
   ${row("Лимонад тархун 0,5 л / 1 л", "1.200 / 2.000")}
   ${row("Кофе по-армянски", "700")}
   <div class="foot">Ежедневно 9:00–23:00 · Обслуживание 10%</div>`,
  "PT Serif",
);

// PW_CHROMIUM_PATH: the preinstalled browser in cloud sessions (see playwright.config.ts).
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const tab = await browser.newPage({ viewport: { width: 1140, height: 900 } });
for (const [name, html] of [
  ["armenian-cafe.jpg", armenian],
  ["russian-cafe.jpg", russian],
] as const) {
  await tab.setContent(html, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: new URL(name, out).pathname, type: "jpeg", quality: 82, fullPage: true });
  console.log(`wrote tests/fixtures/menus/${name}`);
}
await browser.close();
