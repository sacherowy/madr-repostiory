# Jev similarity sample set

Ten sample ADRs used to check the Jev similarity strategy (`SIMILARITY_STRATEGY=jev`) against the live Jev API.

The set has planted similarities:
- **adr-1 ↔ adr-7**: PostgreSQL for the Order service vs. PostgreSQL for the Billing service (same choice and reasoning, different service).
- **adr-10 ↔ adr-2 + adr-3**: a Kafka audit trail correlated with OpenTelemetry traces, which reuses parts of the Kafka decision (adr-2) and the OpenTelemetry decision (adr-3).

The other ADRs (React frontend, Keycloak/OIDC, Kubernetes/Helm, ADRs in git, REST/OpenAPI) are unrelated distractors.

## Results (typesafe/jev-1.13, 2026-09-26)

Each ADR was compared exhaustively against the other nine (90 judgments). The score is Jev's probability that the two decisions are similar. Full rankings are in `results.json`.

| Target | Top result | 2nd | Best other score |
|---|---|---|---|
| adr-1 | adr-7 **0.92** (related) | adr-10 0.05 | 0.05 |
| adr-7 | adr-1 **0.87** (related) | adr-10 0.05 | 0.05 |
| adr-10 | adr-2 **0.73** (related) | adr-3 **0.60** (related) | 0.04 |
| adr-2 | adr-10 **0.87** (related) | adr-3 0.08 | 0.08 |
| adr-3 | adr-10 **0.62** (related) | adr-2 0.05 | 0.05 |

For the targets with no planted match (adr-4, 5, 6, 8, 9) every score stayed between 0.02 and 0.07. Scores are directional (adr-2 → adr-10 is 0.87, adr-10 → adr-2 is 0.73), which is why the judgment cache is keyed by direction.

Jev is a model behind an alpha endpoint, so re-running may give slightly different numbers.

## Reproducing

1. Copy the `adr-*.md` files into one folder of a git repository and commit them.
2. Point the API at that repository (`ADR_REPO_PATH`) and set `SIMILARITY_STRATEGY=jev`, `JEV_ENDPOINT` and `JEV_API_KEY` (see `.env.example`).
3. Request `GET /api/adrs/<id>/similar?exhaustive=true`, for example for `adr-1` or `adr-10`.
