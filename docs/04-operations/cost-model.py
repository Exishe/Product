"""Monthly infrastructure cost model for docs/04-operations/costs.md.

Run: python3 docs/04-operations/cost-model.py
Prices checked on 9 Nov 2026 (sources in costs.md). Change the assumptions
below and re-run when prices or real usage numbers change.
"""
import math

AMD_PER_USD = 360.43  # Central Bank of Armenia, 09.11.2026

# Per café per month (typical 12-table café; see costs.md for reasoning)
ORDERS = 1500            # ~50 a day
GUEST_MAU = 700          # distinct anonymous guest phones that order or call a waiter
PEAK_CONNECTIONS = 17    # 5 staff/owner screens + ~12 guests watching an order, Friday 20:30
MSGS_PER_ORDER = 80      # ~20 broadcasts per order, each delivered to ~4 screens
DB_MB_PER_MONTH = 15     # ~21 rows per order incl. indexes, history, outbox
CACHED_EGRESS_GB = 1.0   # dish thumbnails (600 px WebP) to guest phones
UNCACHED_EGRESS_GB = 0.3 # API responses, Realtime
PH_EVENTS = 15000        # PostHog events if we track only key moments
NEW_CAFES_SHARE = 0.2    # share of cafés that are new each month (menu imports)

# Prices (USD)
SUPA_PRO = 25.0; SUPA_MAU_INCL = 100_000; SUPA_MAU = 0.00325
SUPA_RT_INCL = 500; SUPA_RT_PKG = 10.0      # per 1,000 peak connections over the quota
SUPA_MSG_INCL = 5_000_000; SUPA_MSG_PKG = 2.50  # per 1M messages over the quota
SUPA_DISK_INCL = 8; SUPA_DISK = 0.125
SUPA_CACHED_INCL = 250; SUPA_CACHED = 0.03; SUPA_UNCACHED_INCL = 250; SUPA_UNCACHED = 0.09
COMPUTE_EXTRA = {"Micro": 0, "Small": 5, "Medium": 50}  # after the $10 credit
VERCEL_PRO = 20.0
SENTRY_TEAM = 26.0
PH_FREE = 1_000_000; PH_EVENT = 0.00005
RESEND_PRO = 20.0
DOMAIN = 1.25            # ~$15 a year
AI_IMPORT_OPUS = 0.43    # per menu import, see costs.md

def month(cafes, months_live=12, compute="Micro", team=False, analytics=True):
    mau = cafes * GUEST_MAU
    peak = cafes * PEAK_CONNECTIONS
    msgs = cafes * ORDERS * MSGS_PER_ORDER
    disk_gb = cafes * DB_MB_PER_MONTH * months_live / 1024
    items = {
        "Supabase Pro": SUPA_PRO,
        "Supabase compute upgrade": COMPUTE_EXTRA[compute],
        "Supabase MAU over quota": max(0, mau - SUPA_MAU_INCL) * SUPA_MAU,
        "Supabase Realtime connections": math.ceil(max(0, peak - SUPA_RT_INCL) / 1000) * SUPA_RT_PKG,
        "Supabase Realtime messages": math.ceil(max(0, msgs - SUPA_MSG_INCL) / 1_000_000) * SUPA_MSG_PKG,
        "Supabase disk": max(0, disk_gb - SUPA_DISK_INCL) * SUPA_DISK,
        "Supabase egress": max(0, cafes * CACHED_EGRESS_GB - SUPA_CACHED_INCL) * SUPA_CACHED
                           + max(0, cafes * UNCACHED_EGRESS_GB - SUPA_UNCACHED_INCL) * SUPA_UNCACHED,
        "Vercel Pro (1 seat)": VERCEL_PRO,
        "Sentry Team": SENTRY_TEAM if team else 0,
        "PostHog over free": max(0, cafes * PH_EVENTS - PH_FREE) * PH_EVENT if analytics else 0,
        "Resend Pro": RESEND_PRO if team else 0,
        "Domain": DOMAIN,
        "AI menu imports (Claude Opus 5.5)": max(1, cafes * NEW_CAFES_SHARE) * AI_IMPORT_OPUS,
    }
    usage = {"MAU": mau, "peak connections": peak, "Realtime messages": msgs, "DB GB after a year": round(disk_gb, 1)}
    return items, usage

for cafes, compute, team in [(1, "Micro", False), (10, "Micro", False), (50, "Small", True), (200, "Medium", True)]:
    items, usage = month(cafes, compute=compute, team=team)
    total = sum(items.values())
    print(f"\n== {cafes} cafés ({compute} compute) usage: {usage}")
    for k, v in items.items():
        if v: print(f"   {k:36} ${v:8.2f}")
    print(f"   {'TOTAL':36} ${total:8.2f}  = {total*AMD_PER_USD:,.0f} AMD")
    print(f"   per café: ${total/cafes:.2f} = {total/cafes*AMD_PER_USD:,.0f} AMD")
    for price in (10000, 15000, 20000):
        print(f"   share of revenue at {price:,} AMD/café: {total*AMD_PER_USD/(cafes*price)*100:.1f}%")
