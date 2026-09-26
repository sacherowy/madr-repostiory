---
id: "adr-9"
status: accepted
date: 2026-06-02
---

# Design public APIs as REST with OpenAPI specifications

## Context and Problem Statement
External partners integrate with our platform and need stable, documented APIs. Teams currently design APIs inconsistently.

## Considered Options
- REST with OpenAPI 3.1
- GraphQL
- gRPC

## Decision Outcome
Chosen option: "REST with OpenAPI", because it is widely understood by partners, tooling can generate clients and documentation from the OpenAPI specification, and HTTP caching works out of the box.

### Consequences
- Good, because partners get generated SDKs and consistent documentation.
- Bad, because clients may over-fetch compared with GraphQL.
