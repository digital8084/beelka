# Beelka — Public Customer UI/UX Blueprint

## Experience direction

- Mobile-first, responsive and accessible.
- Visual tone: trustworthy, clean, modern Indonesian travel brand.
- Distinct Beelka identity across flight, hotel, rail and PPOB modules.
- In development/staging, show a persistent `MODE SIMULASI` banner.
- Shared header/footer/navigation and a unified customer order timeline.

## Main information architecture

### Public pages
- `/` — home and service selector/search panel.
- `/pesawat` — flight search.
- `/hotel` — destination, check-in/out, rooms and guests.
- `/kereta` — station/date/passenger search.
- `/ppob` — product group/catalog and customer identifier input.
- `/hasil/[searchId]` — search results/detail.
- `/checkout/[quoteId]` — customer/traveler form and final quote.
- `/pesanan/[publicOrderNumber]` — protected order state and next steps.
- `/bantuan` — support, policies and contact.
- `/kebijakan-privasi`, `/syarat-ketentuan`, `/kebijakan-pembatalan` — approved policy content before launch.

### Account pages (can be staged)
- `/masuk`, `/daftar`, `/akun`, `/akun/pesanan`.
- Do not let users access an order with a predictable order number alone; require authenticated ownership or secure access token.

### Admin/support
- Protected order lookup, provider references, payment timeline, reconciliation queue and redacted audit views.

## Home page composition

1. Brand/navigation with service tabs: Pesawat, Hotel, Kereta, PPOB.
2. Hero and service-aware search panel.
3. Trust statements only when operational claims are evidence-backed.
4. Travel destination/content area only when content is real and assets are owned/licensed.
5. How booking works, support and policy footer.
6. On mobile, prioritize search workflow and fixed actions without covering controls.

## Search UI requirements

### Flights
Origin/destination with swap, date and adult/child/infant counts. Results show carrier, flight code, depart/arrival times, transit, baggage/facilities and revalidated total. Distinguish search price from fresh quote.

### Hotels
Destination/city, dates, rooms and guests. Cards show name/location/rating as provided, room type, meal/board, cancellation terms, surcharges and total price. Show cancellation terms before checkout and sanitize supplier HTML.

### Rail
Station autocomplete using verified station codes, date and passenger counts. Results show train/route/times/class/subclass/fare/seat info where available. Supplier session keys remain server-side.

### PPOB
Product category and available product; product-specific customer identifier fields. Bill inquiry displays returned customer name/number, billing period, amount/admin fee and total before explicit confirmation. Reveal token/reference only when the response authoritatively supports it.

## Checkout and order status

- Review traveler/customer details, quote expiry, price breakdown and cancellation policy before submission.
- Do not put PII in URLs.
- Explain that supplier fulfillment may take time.
- Timeline separates payment from supplier fulfillment.
- Refresh/retry does not create duplicate orders.
- Pending/unknown states explain the next step and never display a false success message.
- Simulated data is labeled and cannot accept real payments.

## Component system

Form fields, date picker, passenger/room selector, station/city selector, result cards, price breakdown, cancellation terms, payment tiles, order status timeline, banners, empty/error/loading states, customer order summary and printable receipt/e-ticket link.

Accessibility: semantic controls, keyboard focus, visible validation and focus state, sufficient contrast and readable forms. Price formatting uses integer amount values; formatted strings are not used for calculations.

## UX acceptance

- Forms usable with keyboard and at 320 px viewport width.
- Errors say how to fix input.
- Loading, empty, provider unavailable, quote expired and unknown transaction states designed.
- Contrast/focus tested.
- No dead buttons, fake paid states, unlabeled test data or nonfunctional filters.
