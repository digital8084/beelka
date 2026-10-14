# Beelka — Initial Project Status

As of 2026-10-14.

## Confirmed requirements
- Brand Beelka; public customer website.
- MMBC service families: flights, hotels, trains/KAI and PPOB.
- Node.js backend and PostgreSQL database.
- Payment gateway model; vendor is not selected.
- Cloud hosting target; provider is not selected.
- Separate adapters, audit trail and idempotency required.
- Simulated mode until APIs are verified.

## Not verified yet
- Current validity, security and availability of historic MMBC endpoints.
- Current credentials, access permissions and booking/issuance behavior.
- Exact current rail seat/e-ticket contract and PPOB status handling per product.
- Payment gateway account, sandbox, webhook semantics, refunds and fees.
- Cloud provider/region/budget/operations owner.
- Authentication, retention policy, legal policies and production support.

## Repository status
This is a documentation baseline only. It does not claim production integrations, live payments, customer authentication, or cloud deployment. Keep feature gates conservative until implementation evidence exists.