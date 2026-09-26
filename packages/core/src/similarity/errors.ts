/**
 * Why a similarity provider (Jev) could not deliver a validated judgment.
 * - "budget": the whole request exceeded JEV_REQUEST_BUDGET_MS (7.6).
 * - "aborted": cancelled because another judgment of the same request failed
 *   (7.7); never the reported cause of a failed request.
 */
export type SimilarityProviderFailure =
  | "network"
  | "timeout"
  | "http-status"
  | "invalid-response"
  | "budget"
  | "aborted";

/**
 * Typed provider-failure signal that the similarity route maps to 503
 * (7.1). The message must not contain secrets (API key, endpoint query
 * string) or ADR content (7.5); `httpStatus` is set only for "http-status".
 */
export class SimilarityProviderError extends Error {
  override readonly name = "SimilarityProviderError";

  constructor(
    readonly category: SimilarityProviderFailure,
    readonly httpStatus: number | null,
    message: string
  ) {
    super(message);
  }
}
