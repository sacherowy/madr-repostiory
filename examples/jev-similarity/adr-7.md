---
id: "adr-7"
status: proposed
date: 2026-05-12
---

# Use PostgreSQL for the Billing service data store

## Context and Problem Statement
The Billing service must record invoices, invoice line items and payment transactions. Invoices and their line items must be persisted together consistently, finance needs ad-hoc reporting queries, and we want a database with reliable backups and point-in-time recovery. Which database should Billing use?

## Decision Drivers
- Transactional consistency across invoice tables
- SQL reporting for finance
- Managed service with point-in-time recovery
- Consistency with other services' storage choices

## Considered Options
- PostgreSQL
- MongoDB
- MySQL

## Decision Outcome
Chosen option: "PostgreSQL", because it provides ACID transactions across invoices and line items, full SQL for finance reporting, JSONB for flexible tax metadata, and the same managed PostgreSQL offering already used elsewhere.

### Consequences
- Good, because invoices are written atomically with their line items.
- Good, because finance can query with SQL directly.
- Bad, because we must manage schema migrations.
- Bad, because very high write volumes would require partitioning.
