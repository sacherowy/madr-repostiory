---
id: "adr-6"
status: accepted
date: 2026-04-08
---

# Deploy services to Kubernetes using Helm charts

## Context and Problem Statement
Services are deployed manually to virtual machines with ad-hoc scripts, making releases slow and environments inconsistent. We need a repeatable deployment platform with self-healing and horizontal scaling.

## Considered Options
- Kubernetes with Helm
- Nomad
- Keep VMs with Ansible

## Decision Outcome
Chosen option: "Kubernetes with Helm", because it is the industry standard for container orchestration, offers rolling updates, autoscaling and self-healing, and Helm charts make environment configuration reproducible.

### Consequences
- Good, because deployments are declarative and repeatable.
- Bad, because the platform is complex and requires dedicated expertise.
