---
id: "adr-1"
status: accepted
date: 2026-03-02
---

# Use PostgreSQL as the primary database for the Order service

## Context and Problem Statement
The Order service stores orders, order lines and payment state. We need strong transactional guarantees when an order and its lines are written together, flexible querying for reporting, and a database our team can operate reliably. Which database should the Order service use?

## Decision Drivers
- ACID transactions across multiple tables
- Rich SQL querying and reporting joins
- Mature managed offering (backups, point-in-time recovery)
- Team experience

## Considered Options
- PostgreSQL
- MongoDB
- DynamoDB

## Decision Outcome
Chosen option: "PostgreSQL", because it gives us multi-table ACID transactions, powerful SQL for reporting, JSONB for semi-structured order attributes, and a mature managed service with point-in-time recovery.

### Consequences
- Good, because orders and order lines are written atomically.
- Good, because reporting can use plain SQL joins.
- Bad, because schema migrations must be managed (we will use Flyway).
- Bad, because horizontal write scaling requires partitioning later.
