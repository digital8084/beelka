# Beelka — Public Customer UI/UX Blueprint

## Direction
- Mobile-first, responsive, accessible and trustworthy Indonesian travel brand.
- Shared Beelka identity across flights, hotels, rail and PPOB.
- Persistent `MODE SIMULASI` indicator in development/staging.
- One common navigation and customer order timeline.

## Information architecture
Public routes: `/`, `/pesawat`, `/hotel`, `/kereta`, `/ppob`, `/hasil/[searchId]`, `/checkout/[quoteId]`, `/pesanan/[publicOrderNumber]`, `/bantuan`, `/kebijakan-privasi`, `/syarat-ketentuan`, `/kebijakan-pembatalan`.
Account routes may include `/masuk`, `/daftar`, `/akun`, `/akun/pesanan`. Order access requires authenticated ownership or a secure access token, never predictable order number alone. Support/admin uses a separate protected surface with redacted data.

## Home page
1. Navigation with service tabs Pesawat, Hotel, Kereta, PPOB.
2. Service-aware search panel.
3. Evidence-based trust statements only.
4. Real destination/content areas using owned/licensed assets.
5. Booking guide, support and policy footer.
6. Mobile controls remain visible; sticky actions never cover forms.

## Service-specific UX
- Flights: origin/destination with swap, date, adult/child/infant counts; result cards show carrier/code, times, transit, baggage/facilities and refreshed total. Distinguish search price from current quote.
- Hotels: city/destination, dates, rooms/guests; cards show room, board/inclusions, cancellation, surcharge and total. Sanitize provider HTML.
- Rail: verified station autocomplete, date and passenger count; show train/route/schedule/class/subclass/fare/seat info as available. Session keys stay server-side.
- PPOB: category/product and product-specific customer fields. Inquiry shows verified customer details, billing period, admin fee and total before confirmation. Reveal token/reference only when supported by authoritative response.

## Checkout and status
Review traveler/customer details, quote expiry, price breakdown and cancellation policy before submit. Never put PII in URLs. Explain supplier fulfillment may take time. Show payment and fulfillment independently. Refresh must not duplicate orders. Pending/unknown states explain next steps and never display false success. Simulated data cannot accept real money.

## Design system
Semantic form inputs, date picker, passenger/room selector, station/city picker, result cards, price breakdown, cancellation panel, payment tiles, order timeline, loading/empty/error states, summary and printable receipt/e-ticket. Ensure keyboard operation, visible focus, useful validation, adequate contrast, and 320px viewport support. Calculate using integer monetary values, never formatted strings.

## Acceptance
No dead buttons or fake paid state; every page designs loading/empty/provider unavailable/quote expired/payment pending/provider pending/unknown/reconciliation states. Browser E2E covers mobile and desktop.