---
id: "adr-2"
status: accepted
date: 2026-03-10
---

# Use Apache Kafka for asynchronous event streaming between services

## Context and Problem Statement
Services currently call each other synchronously over HTTP, which couples their availability and makes it hard to add new consumers of business events such as OrderPlaced or PaymentCaptured. We need a durable, replayable way to publish domain events that several services can consume independently.

## Decision Drivers
- Durable, ordered, replayable event log
- Many independent consumers per event
- High throughput
- Decoupled service availability

## Considered Options
- Apache Kafka
- RabbitMQ
- Direct HTTP webhooks

## Decision Outcome
Chosen option: "Apache Kafka", because topics give us a durable, partitioned, replayable log with consumer groups, so new consumers can be added without changing producers. Events are published as Avro records with a schema registry, keyed by aggregate id to preserve per-entity ordering.

### Consequences
- Good, because producers and consumers are decoupled.
- Good, because events can be replayed to rebuild read models.
- Bad, because operating Kafka and the schema registry adds operational load.
- Bad, because consumers must be idempotent (at-least-once delivery).
