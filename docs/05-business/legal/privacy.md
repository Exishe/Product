# Pativ — Privacy notice

> **Draft — not legal advice; have an Armenian lawyer review before the first paying café.**
>
> Other languages: [Հայերեն](privacy.hy.md) · [Русский](privacy.ru.md).
> Written to follow the substance of the Law of the Republic of Armenia on the Protection of Personal Data (2015). A lawyer must check it against the current text of the law, its amendments and the rules for sending data abroad.

Version: draft 1 · Date: [date]

## 1. Who is responsible

- **Café owners and staff (accounts).** [company name], TIN [TIN], address [address] ("Pativ", "we") decides why and how this data is used.
- **Café guests (orders at a table).** The café decides why guest data is used: it takes the order. Pativ runs the service for the café and handles this data on the café's behalf, under the [Terms of use](terms.md).

Contact for any question or request: [contact]. [If required: name of the person responsible for data protection.]

## 2. What data we handle, why, and on what basis

| Group | Data | Purpose | Lawful basis |
|---|---|---|---|
| Owner and manager accounts | Name, email, password (kept only as a hash by Supabase Auth), language, the cafés they run, sign-in time | Create the account, sign in, run the service, send service messages and invoices | Agreement with the café (the Terms); our legitimate interest in security |
| Staff and devices | Staff name or device label (for example "Kitchen tablet"), role, location, last-seen time. The pairing code is stored hashed and works once | Give staff and devices the right access, and cut it when the owner removes them | Agreement with the café; the café's interest in running its service |
| Notification channels | Telegram chat id and its language; web push subscription (browser endpoint, keys, browser name) | Send the alerts the owner asked for | Consent: the owner links Telegram or turns on push, and can switch it off at any time |
| Guests: anonymous session | A random anonymous id from Supabase Auth, the table, language, times of visits | Let the guest order and see the order status without making an account | The café's interest in taking orders; needed for the ordering the guest asks for |
| Guests: orders | What was ordered, table, time, status, amounts, and an optional note the guest types (up to 300 characters) | Take, prepare and serve the order; the café's sales record | Same as above; the café's duty to keep sales records |
| Menu content and photos | Dish names, descriptions, prices, dish photos; photos of the paper menu used for import | Show the menu; build a draft menu | Agreement with the café |
| Audit and technical logs | Who changed what and when; errors; request logs (with IP address) | Security, finding faults, proof of changes | Legitimate interest in security and reliability |
| Product statistics | Anonymous events in the guest flow: menu opened, dish added, order sent, status viewed, with the language | See how many guests order and in which language | Legitimate interest; no names, phone numbers or device fingerprints go into it |
| Billing | Café name, invoice details, plan, price, payment status. We hold no card data: payment is by bank transfer | Invoice and track payments | Agreement; legal duty to keep invoices |

**Please don't write personal details in the order note** (names, phone numbers, health details). Use it for "no onions" and the like. Pativ stores no guest names, phone numbers or emails in Stage 1. If we add them later (for loyalty or online payment), we will update this notice and ask for consent where needed.

We do not collect special-category data (such as health data) on purpose. If a guest writes "allergic to nuts" in a note, it goes to the kitchen so the guest can be served safely, and it is deleted with the order data as in section 4.

## 3. Who receives the data (processors and recipients)

We use these providers to run the service. We do not sell personal data and we do not use it for advertising.

| Provider | What for | Where | Data |
|---|---|---|---|
| Supabase | Database, sign-in, file storage, live updates | EU, Frankfurt (Germany) | Everything in section 2 |
| Vercel | Hosting the web app and its servers | Global network, company in the USA; server region [to confirm] | Pages and requests, request logs with IP address |
| Google (Gemini API) | Reads photos of paper menus and translates menu text | USA / global | Menu photos and menu text only: no guest data, no staff data |
| Telegram | Delivers alerts to the owner's Telegram | Telegram's own infrastructure, outside Armenia and the EU | Alert text (for example table number and dishes), the chat id |
| Browser push services (Google, Mozilla, Apple, Microsoft) | Deliver web push to a phone or browser | The provider's network | Alert text and the subscription |
| Sentry | Error reports | [EU or USA, to confirm] | Technical error data; we do not send order content |
| PostHog | Anonymous guest-flow statistics | EU host | Anonymous events |
| Cloudflare Turnstile (when switched on) | Invisible check that a visitor is not a bot, before the anonymous session starts | Global | Technical data about the browser and the IP address |
| Resend or another mail service (if used) | Sign-up and sign-in emails | [to confirm] | Email address, message |
| Bank | Payment of invoices | Armenia | Invoice and payment details between the café and us |

**Menu photos and Google.** We use Gemini's free tier. Under Google's terms for the free tier, Google may use what we send to improve its products, and people at Google may read it. That is why we send only photos of paper menus and menu text, never guest or staff data. **Don't upload a photo with anything private on it.** You may also skip the import and type the menu by hand. If we move to a paid AI plan, this paragraph will change.

**Sending data abroad.** Supabase stores the data in the EU. Some providers above (Vercel, Google, Telegram, Sentry, Cloudflare) work outside Armenia and the EU. We pick providers that publish data-protection terms and send them the least data that does the job. [A lawyer will confirm that this meets the Armenian rules on cross-border transfer.]

We may also give data to a court, the tax authority or another body if the law requires it.

## 4. How long we keep data

| Data | Kept |
|---|---|
| Anonymous guest sessions | Deleted after 30 days without an order, and in any case after 180 days. Orders stay and are no longer linked to the session |
| Table session (which phone joined which table) | Ends when the bill is settled; the guest session is deleted as above |
| Orders, bills and their notes | They are the café's sales records. They stay while the café has an account and for 90 days after it is closed, so the café can export them, then are deleted [lawyer to check against record-keeping rules]. The café may keep its own export as long as its own duties require |
| Owner and staff accounts | While the account exists; deleted within 30 days of a request or of the café closing, except what we must keep |
| Staff devices | Until the owner removes the device |
| Telegram chat ids and push subscriptions | Until the owner unlinks them, until Telegram or the push service says they are gone, or until the account closes |
| Alert messages in the queue (waiting or sent) | 30 days |
| Menu photos used for import | [30 days after the import is applied or dropped, then deleted; this deletion must be built before launch] |
| Published menu and dish photos | While the café uses them |
| Audit log | 12 months |
| Server and request logs, error reports | Up to 30 days |
| Anonymous product statistics | Up to 12 months |
| Invoices and payment records | As long as the tax and accounting law requires [accountant to state the period] |
| Live-update messages | Supabase drops them after 3 days |
| Backups | [Nightly copy kept for a number of days, to confirm]; deleted data leaves the backups when they expire |

## 5. Your rights

You have the right to:

- ask whether we handle your data, and get a copy and an explanation;
- have wrong or incomplete data corrected;
- ask us to stop, block or delete data we no longer need or have no basis for;
- withdraw a consent you gave (for example for Telegram or push alerts) at any time;
- object to handling that is based on our legitimate interest;
- complain to the authority for personal data protection in Armenia [name and contact of the authority, to confirm], or to a court.

**Guests.** A guest has no account, so we can find their data only from what they tell us: the café, the table, the day and the time of the order. Write to the café or to [contact]. We answer within [30] days. For an anonymous session, clearing your browser data for the site ends the session at once.

**Café staff.** Ask the owner to correct or remove your name or device; owners do it in the admin. You can also write to us.

We may need to check who you are before we share data, so that nobody else gets it.

## 6. Security

- Each café's data is separated in the database by row-level security, enforced by the database itself. One café cannot see another's.
- Guests order through a signed QR code and an anonymous session, with rate limits on every public entry point.
- Connections use HTTPS. Passwords are stored as hashes. Secrets for outside services are kept in a vault inside the database, not in the app.
- Our own team reaches a café's data only through a platform admin screen, and every view is logged with who looked, at what, and why.
- If personal data is lost or exposed in a way that puts people at risk, we tell the café and [the authority, if the law requires] without delay.

## 7. Cookies and local storage

We use no advertising cookies and no third-party tracking cookies. We use only what the service needs to work.

| What | Where | Why | How long |
|---|---|---|---|
| Sign-in session (Supabase auth cookie and token) | Cookie / browser storage, on staff devices and for the anonymous guest session | Keeps you signed in; lets a guest order and see the status | Until sign-out or the session expires; a guest's anonymous session as in section 4 |
| Language (`NEXT_LOCALE` for guests, `pativ-locale` for staff) | Cookie | Remember the chosen language | Up to 1 year |
| Cart (`pativ:cart:v1:…`) | Browser local storage | Keeps the guest's cart through a reload or a lost connection | Until the order is sent or the guest clears it |
| Queue of staff actions | Browser storage (IndexedDB) on staff devices | Lets the waiter and kitchen screens work without internet and catch up | Until the actions are sent |
| Service worker and its cache | Staff devices (waiter and kitchen apps) | Opens the app fast and shows an offline page | Until the app updates or the cache is cleared |
| Bot check (Cloudflare Turnstile, when switched on) | A script from Cloudflare | Tell people from bots | Per visit |

These are strictly necessary, so there is no consent banner. If we add analytics or other cookies later, we will say so here and ask first where the law requires.

## 8. Children

Pativ is for cafés. Guests of any age may scan a menu, but we ask them for no personal data and we do not knowingly collect data from children.

## 9. Changes

We will change this notice when the service changes (for example when guest accounts, loyalty or online payment arrive). The date and version are at the top. For an important change we tell café owners by email or in the admin.

## 10. Contact

[company name] · [address] · TIN [TIN]
Email: [contact] · Telegram: [contact] · Phone: [contact]
