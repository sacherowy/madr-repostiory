---
id: "adr-3"
status: accepted
date: 2026-03-18
---

# Adopt OpenTelemetry for distributed tracing and metrics

## Context and Problem Statement
When a request fails we cannot follow it across services; each service logs in its own format and there is no shared trace id. We need end-to-end visibility of requests across HTTP calls and asynchronous hops, plus consistent service metrics.

## Decision Drivers
- Vendor-neutral instrumentation
- Trace context propagated across HTTP and messaging
- Correlation of logs with traces
- Single SDK for traces and metrics

## Considered Options
- OpenTelemetry SDK with an OTLP collector
- Vendor-specific APM agent
- Custom correlation-id logging only

## Decision Outcome
Chosen option: "OpenTelemetry", because it is vendor neutral, propagates W3C trace context across HTTP and message headers, and lets us export traces and metrics through an OTLP collector to any backend. Every log line includes the trace_id and span_id so logs can be joined with traces.

### Consequences
- Good, because we can follow a request end to end across services.
- Good, because we can switch observability backends without re-instrumenting.
- Bad, because every service must adopt the SDK and propagate context, including message consumers.
- Bad, because trace volume requires sampling.
