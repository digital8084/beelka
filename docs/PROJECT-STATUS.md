# Beelka — Initial Status Baseline

As of 2026-10-14.

## Confirmed by project brief

- Brand: Beelka.
- Audience: public website customers.
- Service families: flights, hotels, trains/KAI and PPOB via MMBC APIs.
- Backend: Node.js.
- Database: PostgreSQL.
- Payment model: payment gateway (specific vendor undecided).
- Deployment target: cloud hosting (specific provider undecided).
- Must have separate adapters, audit trail and idempotency.
- Explicit simulation until current supplier API is verified.

## Not yet verified

- Current validity, security and availability of historic MMBC endpoints.
- Current MMBC credentials, permissions, live booking and issuance semantics.
- Exact current API contract for rail seat/e-ticket endpoints and all product-specific PPOB outcomes.
- Payment gateway account, sandbox access, webhook behavior, refund support and costs.
- Cloud provider, target region, budget and operational owner.
- Authentication provider, data retention policy, legal policy content and production support schedule.

## Current repository state

Initial documentation baseline is being recorded. No production API integrations, live payments, customer authentication, or cloud deployment are claimed by these documents. Feature gates must remain conservative until implementation and verification evidence exists.
