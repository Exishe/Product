# Restaurant OS for Armenia: GitHub repos, skills and resources

Nov 9, 2026 · @Sroondz

> Source: transcribed from the PDF "Restaurant OS for Armenia: GitHub repos, skills and resources" supplied with the project brief. Content is unchanged; only the formatting was converted to Markdown and repo names were turned into links.

This is everything you need to build a Toast-style restaurant platform for Yerevan: open-source projects to learn from, the core stack, Armenian payment integrations, AI and messaging tools, and the Claude skills that speed up the build. Star counts and last-update dates were checked on GitHub on 9 Nov 2026.

How to use it: don't fork a big system and try to bend it. Read 2–3 of the projects below to see how they model tables, orders and the kitchen flow, then build your own lean version on Next.js and Supabase with Claude. Check each repo's license before you copy code into a paid product.

## 1. Full restaurant systems to study

These are the closest open-source equivalents to Toast. Use them as a reference for features and data models.

| Repo | Stars | What it is | Why it's useful |
|---|---|---|---|
| [Raktim94/nodedr-restaurant-pos](https://github.com/Raktim94/nodedr-restaurant-pos) | 290 | TypeScript POS with tables, kitchen display, reservations, QR ordering and loyalty | Closest to your full plan, actively updated |
| [FreeOpenSourcePOS/FloCafe](https://github.com/FreeOpenSourcePOS/FloCafe) | 174 | Offline-first TypeScript POS for cafés | Shows how to keep working when the internet drops |
| [ury-erp/ury](https://github.com/ury-erp/ury) | 411 | Restaurant management on top of ERPNext | Strong on inventory, recipes and accounting |
| [odoo/odoo](https://github.com/odoo/odoo) | 55.7k | Full business suite with a restaurant POS module | The most complete reference for how a mature POS works |
| [tastyigniter/TastyIgniter](https://github.com/tastyigniter/TastyIgniter) | 3.8k | Online ordering and table reservations (PHP) | Good model for the delivery and reservation module |
| [opensourcepos/opensourcepos](https://github.com/opensourcepos/opensourcepos) | 4.5k | Web POS in PHP | Simple, well-known point-of-sale logic |
| [evan361425/flutter-pos-system](https://github.com/evan361425/flutter-pos-system) | 638 | Flutter POS for small restaurants | Reference if you later want a native tablet app |
| [pizzaql/pizzaql](https://github.com/pizzaql/pizzaql) | 715 | Order management for pizza places | Clean order-status flow |
| [SGrappelli/pronto](https://github.com/SGrappelli/pronto) | 75 | Booking, CRM and POS for salons and cafés, with WhatsApp and Telegram reminders | Also fits the salon-booking idea |

## 2. QR menu and table ordering (Stage 1)

| Repo | Stars | Notes |
|---|---|---|
| [kaje94/menufic](https://github.com/kaje94/menufic) | 139 | Digital menu builder on Next.js and Prisma; closest to your stack |
| [charnowsky/FeastQR](https://github.com/charnowsky/FeastQR) | 125 | Open-source SaaS online menu; useful for the multi-restaurant setup |
| [itzzritik/OrderWorder](https://github.com/itzzritik/OrderWorder) | 142 | QR ordering with an AI chatbot that recommends dishes |
| [thisishowen-spec/eatlah](https://github.com/thisishowen-spec/eatlah) | 142 | Photograph a paper menu and AI turns it into a QR ordering system; great onboarding idea |
| [softenrj/qr-menu](https://github.com/softenrj/qr-menu) | 53 | MERN digital menu and ordering |

The eatlah idea is worth copying: the café owner photographs their paper menu, Claude reads it, and the digital menu is ready in Armenian, Russian and English in five minutes. That makes the first sale much easier.

## 3. Kitchen display and receipt printing (Stage 2)

| Repo | Stars | Notes |
|---|---|---|
| [ury-erp/mosaic](https://github.com/ury-erp/mosaic) | 47 | Kitchen display with order tickets, part of URY |
| [BenClementt/OpenKDS](https://github.com/BenClementt/OpenKDS) | 12 | Simple kitchen display; last updated 2023, use for ideas only |
| [at-point-of-sale/ReceiptPrinterEncoder](https://github.com/at-point-of-sale/ReceiptPrinterEncoder) | 334 | Builds commands for ESC/POS receipt printers from JavaScript |
| [lsongdev/node-escpos](https://github.com/lsongdev/node-escpos) | 1.6k | ESC/POS printer driver for Node.js |
| [qzind/tray](https://github.com/qzind/tray) | 1.1k | Lets a web app print directly to a local printer |
| [DantSu/ESCPOS-ThermalPrinter-Android](https://github.com/DantSu/ESCPOS-ThermalPrinter-Android) | 1.6k | Bluetooth/USB printing from Android tablets |

Most Yerevan cafés already have a cheap thermal printer, so supporting ESC/POS early means they don't need new hardware.

## 4. Core stack

| Repo | Stars | Role |
|---|---|---|
| [vercel/next.js](https://github.com/vercel/next.js) | 143k | Web app: guest menu, waiter app, admin panel |
| [supabase/supabase](https://github.com/supabase/supabase) | 115k | Postgres database, auth, storage, realtime orders to the kitchen |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 128k | UI components |
| [amannn/next-intl](https://github.com/amannn/next-intl) | 4.4k | Armenian, Russian and English versions of every screen |
| [tremorlabs/tremor](https://github.com/tremorlabs/tremor) | 3.7k | Charts and dashboard components for the owner's analytics |
| [zpao/qrcode.react](https://github.com/zpao/qrcode.react) | 4.3k | Generate a QR code per table |
| [kozakdenys/qr-code-styling](https://github.com/kozakdenys/qr-code-styling) | 3.0k | Branded QR codes with the café's logo and colours |
| [PostHog/posthog](https://github.com/PostHog/posthog) | 40.7k | Product analytics: see how guests and staff use the app |
| [medusajs/medusa](https://github.com/medusajs/medusa) | 37.1k | Commerce engine, if online ordering grows into a full shop |

## 5. Armenian payments (Stage 3)

There are no official open-source SDKs from Armenian banks on GitHub. Everything below is unofficial and small, so treat it as example code. The real path is a merchant contract with a bank or payment provider, then their official API documentation.

| Repo | Provider | Notes |
|---|---|---|
| [callmedearjohn/ameria-bank-vpos-api-documentation](https://github.com/callmedearjohn/ameria-bank-vpos-api-documentation) | Ameriabank vPOS | Unofficial guide to all endpoints with flow diagrams; best starting point |
| [quueli/ameria-vpos-telegram](https://github.com/quueli/ameria-vpos-telegram) | Ameriabank vPOS | Payments inside a Telegram bot, updated 2026 |
| [davit-vardanyan/ameriabank-vpos-php](https://github.com/davit-vardanyan/ameriabank-vpos-php) | Ameriabank vPOS 3.1 | Unofficial PHP client |
| [ayvazyan10/AmeriaBankvpos](https://github.com/ayvazyan10/AmeriaBankvpos) | Ameriabank vPOS | Laravel package |
| [tobelyan/arca-epg-payment-gateway-armenia](https://github.com/tobelyan/arca-epg-payment-gateway-armenia) | ArCa EPG | Node.js driver |
| [k3rnel/omnipay-arca](https://github.com/k3rnel/omnipay-arca) | ArCa | PHP Omnipay driver |
| [arm092/omnipay-idbank](https://github.com/arm092/omnipay-idbank) | IDBank EPG | PHP Omnipay driver, updated Oct 2026 |
| [ptuchik/omnipay-idram](https://github.com/ptuchik/omnipay-idram) | Idram | PHP Omnipay driver, last updated 2023 |
| [var77/telcell-nodejs-sdk](https://github.com/var77/telcell-nodejs-sdk) | Telcell | Node.js SDK, last updated 2023 |

In the MVP, skip online payments: guests pay the waiter as usual. Add bank payments once a few cafés use the system daily.

## 6. AI and messaging

| Repo | Stars | Role |
|---|---|---|
| [anthropics/anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript) | 2.2k | Official Claude API client for the AI assistant and menu translation |
| [vercel/ai](https://github.com/vercel/ai) | 27.8k | AI SDK for streaming chat and tool calls in Next.js |
| [anthropics/claude-quickstarts](https://github.com/anthropics/claude-quickstarts) | 19.7k | Ready projects, including a customer support agent |
| [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks) | 54.5k | Recipes for tool use, document reading and more |
| [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) | 1.9k | For the owner's AI assistant that takes actions in the system |
| [grammyjs/grammY](https://github.com/grammyjs/grammY) | 3.8k | Telegram bots: order notifications, owner reports, guest bot |
| [gokapso/whatsapp-cloud-inbox](https://github.com/gokapso/whatsapp-cloud-inbox) | 803 | Inbox for the official WhatsApp Cloud API |
| [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) | 11.6k | Unofficial WhatsApp Web API; numbers can get banned, so use for tests only |

## 7. Claude skills and building tools

Skill collections to install or learn from:

| Repo | Stars | What it gives you |
|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | 190k | Official Agent Skills from Anthropic |
| [obra/superpowers](https://github.com/obra/superpowers) | 315k | Planning, TDD, debugging and code-review workflow skills |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 33.8k | React and Next.js best practices, deploy to Vercel |
| [supabase/agent-skills](https://github.com/supabase/agent-skills) | 3.0k | Supabase and Postgres guidance for agents |
| [supabase/mcp](https://github.com/supabase/mcp) | 3.0k | Lets Claude manage your Supabase project directly |
| [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | 91.9k | Reference MCP servers |
| [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) | 9.9k | Claude reviews and fixes code in GitHub pull requests |
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | 79.1k | Curated list of skills and tools |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 57.6k | Curated Claude Code resources |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 37.0k | 1,000+ agent skills from dev teams and the community |

Skills already enabled in your account that map onto this build:

- Planning: superpowers brainstorming, writing-plans, executing-plans
- Design: frontend-design, web-design-guidelines, design-inspiration-finder, det-ai (removes the generic AI look)
- Code: vercel-react-best-practices, vercel-composition-patterns, supabase, supabase-postgres-best-practices
- Testing: webapp-testing, playwright-cli, tdd, verification-before-completion
- Security before deploy: semgrep, supply-chain-risk-auditor, differential-review
- Deploy: deploy-to-vercel
- Armenian texts and menus: hy-writer, humanize
- Selling: freelance-pitch-writer, small-business proposal-builder

## 8. Suggested combination for the Stage 1 MVP

1. Study menufic and nodedr-restaurant-pos for the data model (restaurants, menus, categories, dishes, tables, orders).
2. Build on Next.js, Supabase, shadcn/ui and next-intl, with Supabase realtime so new orders appear in the kitchen instantly.
3. Add qr-code-styling for branded table QR codes and the eatlah-style "photo of paper menu → digital menu" onboarding with the Claude API.
4. Send new-order alerts to the owner through a grammY Telegram bot.
5. Use the skills from section 7 at each step, and deploy a Vercel preview to show the first café.
