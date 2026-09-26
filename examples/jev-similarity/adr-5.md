---
id: "adr-5"
status: accepted
date: 2026-04-01
---

# Authenticate users with OpenID Connect via Keycloak

## Context and Problem Statement
Each application implements its own login. We want single sign-on for employees and customers, centralized user management, and standard tokens that APIs can verify.

## Considered Options
- Keycloak (OIDC)
- Auth0
- Custom username/password service

## Decision Outcome
Chosen option: "Keycloak", because it provides standards-based OpenID Connect and OAuth 2.0, can be self-hosted, and supports federation with the corporate directory. APIs validate JWT access tokens issued by Keycloak.

### Consequences
- Good, because we get SSO and central user management.
- Bad, because we must operate and upgrade Keycloak ourselves.
