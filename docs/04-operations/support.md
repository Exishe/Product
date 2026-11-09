# Support

How owners and staff get help, how we find out about problems before they tell us, and how fast we respond. Stage 1 support is us; this is sized for the first 10–50 cafés.

## Channels

| Channel | For | Cost |
|---|---|---|
| In-app help | "How do I…" questions: a «?» button on every screen opens short articles for that screen, in the user's language | Free |
| Telegram support chat | Everything else. One chat per café: the owner, managers and us. Waiters can be added. | Free |
| Telegram status channel | One-way: incidents, maintenance windows, new features | Free |
| Phone | Only for "service is stopped right now" during opening hours, number given at onboarding | Our phone |

Why Telegram: owners already get order alerts there, it's free, and it handles photos and voice messages. Whether owners would rather use Viber or WhatsApp is checked with the pilot cafés (`docs/00-research/gaps.md`); the support chat can move without changing the product.

## Reporting a problem from the app

«Հաղորդել խնդրի մասին» sits in the help panel on every staff and admin screen. It opens a short form:

- what happened, in one or two sentences;
- an optional screenshot (the device's own screenshot, attached);
- a tick box: «Ծառայությունը կանգնած է» (service is stopped).

It sends, without asking the user to find anything:

- café, location, device name and role, app version, browser;
- connection state and the number of waiting offline actions;
- the last 20 client errors (Sentry event ids, not the content of orders);
- the screen they were on.

The report goes to our Telegram as a message with a link to the café in the platform admin. The user sees «Ստացանք։ Կպատասխանենք Telegram-ով։» No guest personal data is included, and Stage 1 stores none anyway.

## How we notice problems first

| Signal | Source | Who sees it |
|---|---|---|
| Health endpoint down for 2 minutes | Uptime check every minute | Us, by Telegram alert |
| Kitchen or bar screen offline for 2 minutes during opening hours | Device heartbeat | The café owner and us |
| Ticket cooking longer than the café's limit (default 20 min) | `order.overdue` job | The café owner |
| Spike in client or server errors | Sentry alert | Us |
| Telegram messages in the dead-letter queue | Platform admin | Us, daily check |
| No orders by 14:00 at a café that usually has them by 12:00 | Daily job | Us: maybe the QR codes are gone, or the café is closed |
| AI import failures | Platform admin | Us |

## Response times

| Severity | Example | First response | Fix or workaround |
|---|---|---|---|
| S1: service stopped | Nothing reaches the kitchen; nobody can log in | 15 minutes during opening hours (10:00–01:00) | Workaround (paper fallback, RB3) at once; fix as fast as possible |
| S2: something important broken | Telegram alerts missing, dashboard wrong, one device can't pair | Same day | Within 2 working days |
| S3: question or request | "How do I add a modifier?", "Can you add X?" | Next working day | Answered; requests go to the backlog |

During the pilot we're more responsive than this; these are the promises we can keep with one or two people.

## In-app help articles (Stage 1)

Short, task-based, with one screenshot each, in hy, ru and en. Written with the hy-writer rules for Armenian.

| Article | Screen |
|---|---|
| How guests order with the QR code | Tables and QR |
| Print and replace QR cards | Tables and QR |
| Fix a dish the AI read wrong | Menu import |
| Mark a dish sold out for today | Menu, kitchen screen |
| Add sizes, milk options and extras | Menu editor |
| Pair a kitchen screen or waiter tablet | Staff and devices |
| What to do when the Wi-Fi drops | Kitchen screen, waiter tablet |
| Cancel a dish and what the kitchen sees | Waiter tablet |
| Close a table and record payment | Waiter tablet |
| Read today's sales | Dashboard |
| Connect Telegram alerts | Telegram |

## Access to café data for support

- We read a café's data only through the platform admin, which logs every view in `audit_log` with who, what and why.
- We never change a café's menu or orders without the owner asking in the support chat. When we do, the change is logged under our account, not the owner's.
- Device and staff revocation is always done by the owner, or by us on the owner's written request in the chat.

## After an S1 incident

Within 24 hours we post a short note in the status channel:

- what happened;
- when it started and ended;
- which cafés were affected;
- what we changed so it doesn't happen again.

No blame, no vague words. The runbook it touched (`reliability.md`) gets a History line.
