---
id: "adr-10"
status: proposed
date: 2026-07-15
---

# Build the audit trail as a Kafka event stream correlated with OpenTelemetry traces

## Context and Problem Statement
Compliance requires an audit trail of who changed what and when across all services. Today audit records are written ad hoc into each service's database and cannot be correlated with the request that caused them. We need a central, durable audit trail that can also be linked to the originating request for investigations.

## Decision Drivers
- Durable, append-only, replayable record of audit events
- Many consumers (compliance archive, security alerting)
- Ability to join an audit event with the full distributed trace of the request
- Minimal coupling to individual services

## Considered Options
- Publish audit events to a dedicated Kafka topic, enriched with OpenTelemetry trace context
- Write audit rows into each service's database
- Send audit logs to the logging stack only

## Decision Outcome
Chosen option: "Kafka audit topic with OpenTelemetry trace context", because Kafka gives us a durable, partitioned, replayable log with consumer groups (compliance archive and security alerting consume independently), and every audit event carries the W3C trace_id and span_id propagated by our OpenTelemetry instrumentation, so an auditor can jump from an audit record to the end-to-end trace. Audit events are Avro records registered in the schema registry and keyed by the affected entity id.

### Consequences
- Good, because audit events are durable and can be replayed into new stores.
- Good, because each audit event links to the distributed trace of its request.
- Bad, because every service must propagate trace context into the events it publishes.
- Bad, because consumers must be idempotent (at-least-once delivery).
