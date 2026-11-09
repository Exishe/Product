# Flows

Four flows from the brief. Statuses and function names match `docs/01-architecture/data-model.md`. All diagrams were rendered with Mermaid 11 to check the syntax.

## 1. Guest ordering

```mermaid
flowchart TD
  A[Guest scans the table QR] --> B{Server checks the signature<br/>and QR version}
  B -- invalid or old --> B1[Page: this QR no longer works,<br/>ask the waiter]
  B -- valid --> C[Menu in the guest's language<br/>from the published snapshot]
  C --> D{Dish has required options?}
  D -- no --> E[Tap + : added to cart]
  D -- yes --> F[Item sheet: options, note, quantity] --> E
  E --> G{More dishes?}
  G -- yes --> C
  G -- no --> H[Cart: check lines and total]
  H --> I[Send to the kitchen]
  I --> J{First action on this phone?}
  J -- yes --> K[Invisible Turnstile check,<br/>anonymous sign-in] --> L
  J -- no --> L[Server: join_table, then<br/>place_guest_order with idempotency key]
  L -- no connection --> L1[Order kept on the phone,<br/>retry with the same key] --> L
  L -- sold out / limit --> L2[Explain, let the guest fix the cart] --> H
  L -- ok --> M{Total over the café's limit<br/>or café confirms every QR order?}
  M -- no --> N[Accepted: tickets go to the kitchen<br/>and bar at once]
  M -- yes --> O[Waiting: the waiter confirms first]
  O -- accepted --> N
  O -- rejected --> O1[Guest sees why and can call the waiter]
  N --> P[Status page updates live:<br/>accepted, cooking, ready, served]
  P --> Q{Wants more?}
  Q -- yes --> C
  Q -- no --> R[Asks for the bill or waits;<br/>pays the waiter]
  R --> S[Waiter closes the table: guest sees Paid,<br/>session ends]
```

## 2. The life of an order

The guest's single status line comes from three machines: order acceptance, kitchen tickets per station, and the bill.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Received: order placed
  Received --> Accepted: auto, or waiter accepts
  Received --> Rejected: waiter rejects
  Accepted --> Cooking: kitchen taps Start
  Accepted --> Ready: drinks with no cooking step
  Cooking --> Ready: every station ticket ready
  Ready --> Cooking: kitchen undoes Ready
  Ready --> Served: waiter or kitchen marks served
  Served --> Paid: table settled
  Accepted --> Cancelled: every line cancelled
  Cooking --> Cancelled: every line cancelled
  Rejected --> [*]
  Cancelled --> [*]
  Paid --> [*]

  note right of Cooking
    Each station has its own ticket.
    The order shows the slowest one.
    A cancellation after cooking starts
    sends a void ticket the cook must acknowledge.
  end note
```

## 3. Owner onboarding (target: live in under 30 minutes)

```mermaid
flowchart TD
  A[Owner signs up with email] --> B[Café name, address, languages,<br/>number of tables]
  B --> C{Menu}
  C -- photo --> D[Photograph the paper menu, 1–8 photos]
  D --> E[AI reads dishes, prices, options;<br/>translates to the missing languages]
  E -- unreadable --> E1[Retake the photo or type it in]
  E1 --> D
  E --> F[Review: fix flagged prices and names,<br/>approve each dish or category]
  C -- by hand --> G[Menu editor]
  G --> F
  F --> H{Every AI-written row reviewed?}
  H -- no --> F
  H -- yes --> I[Publish menu version 1]
  I --> J[Floor plan: place the tables]
  J --> K[Print QR cards, A4, one per table]
  K --> L[Pair the kitchen screen and waiter tablet<br/>with 6-digit codes]
  L --> M[Connect Telegram for alerts]
  M --> N[Test order from the owner's phone:<br/>kitchen sees it, Telegram pings]
  N --> O[Live]
```

## 4. A waiter's shift

```mermaid
flowchart TD
  A[Open the waiter app on the shared tablet<br/>already paired to the café] --> B[Floor map]
  B --> C{What needs attention?<br/>shown by colour and word}
  C -- new QR order --> D[Open table, check the round]
  D --> D1{Real order from this table?}
  D1 -- yes --> D2[Accept: tickets go to the kitchen]
  D1 -- no --> D3[Reject with a reason]
  C -- guest calls --> E[Tap I'm coming, go to the table]
  C -- food ready --> F[Take it out, mark served]
  C -- guests without phones --> G[Order pad: take the order<br/>on the tablet, send]
  C -- bill requested --> H[Close table: cash, card or split;<br/>amounts must add up]
  D2 --> B
  D3 --> B
  E --> B
  F --> B
  G --> B
  H --> I[Table free; guests' sessions end]
  I --> B
  B --> J{Wi-Fi drops?}
  J -- yes --> K[Keep working: actions queue,<br/>banner shows how many wait;<br/>closing tables waits for the connection]
  K --> B
  B --> L[End of shift: tables closed;<br/>owner gets the day summary in Telegram]
```
