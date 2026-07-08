import type {
  Adr,
  AdrCompareView,
  AdrId,
  CreateAdrRequest,
  CreateFolderRequest,
  FeedCard,
  FolderNode,
  MoveAdrRequest,
  RawAdrContent,
  RelationView,
  SearchHit,
  CommitMeta,
  SimilarityResult,
  SummarySuggestionResult,
  UpdateAdrRequest,
  VersionDiffView,
} from "@adr/shared";

/**
 * Typed fetch wrapper over `@adr/shared` types (design.md's `ApiClient`
 * boundary). Every method returns a `Promise` of a discriminated union with
 * a consistent `ok: true` / `ok: false` discriminant across all 16 methods.
 *
 * For endpoints with multiple distinct 4xx body shapes (e.g. `updateAdr`'s
 * 409/400/400), the failure branch carries a nested `kind` so a caller can
 * switch on it to get fully-typed access to `result.latest`,
 * `result.missingFields`, etc. without casting. For endpoints with no
 * documented error (`getTree`, `search`, `getFeed`), the same `ok: true`
 * wrapper is still used so every one of the 16 methods shares one calling
 * convention.
 */

interface ApiFailure {
  ok: false;
  status: number;
}

type CreateAdrResult = { ok: true; adr: Adr } | (ApiFailure & { kind: "invalid"; missingFields: string[] });

type GetAdrResult = { ok: true; adr: Adr } | ApiFailure;

type UpdateAdrResult =
  | { ok: true; adr: Adr }
  | (ApiFailure & { kind: "conflict"; latest: Adr })
  | (ApiFailure & { kind: "invalid"; missingFields: string[] })
  | (ApiFailure & { kind: "invalidRelations"; missingTargets: string[] })
  | (ApiFailure & { kind: "notFound" });

type GetRelationsResult = { ok: true; relations: RelationView[] } | ApiFailure;

type CreateFolderResult =
  | { ok: true; node: FolderNode }
  | (ApiFailure & { kind: "invalid"; missingFields: string[] })
  | (ApiFailure & { kind: "conflict" });

type MoveAdrResult =
  | { ok: true; adr: Adr }
  | (ApiFailure & { kind: "invalid"; missingFields: string[] })
  | (ApiFailure & { kind: "notFound" });

type GetTreeResult = { ok: true; tree: FolderNode } | ApiFailure;

type GetHistoryResult = { ok: true; history: CommitMeta[] } | ApiFailure;

type GetVersionAtResult = { ok: true; adr: Adr } | ApiFailure;

type GetVersionDiffResult =
  | { ok: true; diff: VersionDiffView }
  | (ApiFailure & { kind: "invalid"; reason: string })
  | (ApiFailure & { kind: "notFound" });

type CompareAdrsResult =
  | { ok: true; comparison: AdrCompareView }
  | (ApiFailure & { kind: "missingFields"; missingFields: string[] })
  | (ApiFailure & { kind: "invalidReason"; reason: string })
  | (ApiFailure & { kind: "notFound" });

type SearchResult = { ok: true; hits: SearchHit[] } | ApiFailure;

type GetSimilarResult =
  | { ok: true; kind: "ranked"; results: SimilarityResult[] }
  | { ok: true; kind: "emptyScope" }
  | ApiFailure;

type GetFeedResult = { ok: true; cards: FeedCard[] } | ApiFailure;

type GetRawAdrResult = { ok: true; raw: RawAdrContent } | ApiFailure;

/**
 * The `SummarySuggestionResult` union itself is the endpoint's 200 body —
 * BOTH variants (available / unavailable) are successes, so `ok: false` is
 * reserved for transport-level failures (404 unknown id, 500).
 */
type GetSummarySuggestionResult = { ok: true; suggestion: SummarySuggestionResult } | ApiFailure;

export interface ApiClient {
  createAdr(body: CreateAdrRequest & { author: string }): Promise<CreateAdrResult>;
  getAdr(id: string): Promise<GetAdrResult>;
  updateAdr(id: string, body: UpdateAdrRequest): Promise<UpdateAdrResult>;
  getRelations(id: string): Promise<GetRelationsResult>;
  createFolder(body: CreateFolderRequest): Promise<CreateFolderResult>;
  moveAdr(id: string, body: MoveAdrRequest): Promise<MoveAdrResult>;
  getTree(root?: string): Promise<GetTreeResult>;
  getHistory(id: string): Promise<GetHistoryResult>;
  getVersionAt(id: string, sha: string): Promise<GetVersionAtResult>;
  getVersionDiff(id: string, from: string, to: string): Promise<GetVersionDiffResult>;
  compareAdrs(a: string, b: string): Promise<CompareAdrsResult>;
  search(q: string): Promise<SearchResult>;
  getSimilar(id: string, scope?: string): Promise<GetSimilarResult>;
  getFeed(): Promise<GetFeedResult>;
  getRawAdr(id: AdrId): Promise<GetRawAdrResult>;
  getSummarySuggestion(id: AdrId): Promise<GetSummarySuggestionResult>;
}

/**
 * `baseUrl` defaults to `""` so relative `/api/...` paths work in the
 * browser through the Vite dev-server proxy (`apps/web/vite.config.ts`'s
 * `server.proxy["/api"]`); in tests it's set to a real `http://127.0.0.1:PORT`
 * origin returned by a live Fastify instance.
 */
export function createApiClient(baseUrl: string = ""): ApiClient {
  async function postJson(path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function putJson(path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  return {
    async createAdr(body) {
      const res = await postJson("/api/adrs", body);
      if (res.status === 201) {
        return { ok: true, adr: (await res.json()) as Adr };
      }
      const data = (await res.json()) as { missingFields: string[] };
      return { ok: false, status: res.status, kind: "invalid", missingFields: data.missingFields };
    },

    async getAdr(id) {
      const res = await fetch(`${baseUrl}/api/adrs/${encodeURIComponent(id)}`);
      if (res.status === 200) {
        return { ok: true, adr: (await res.json()) as Adr };
      }
      return { ok: false, status: res.status };
    },

    async updateAdr(id, body) {
      const res = await putJson(`/api/adrs/${encodeURIComponent(id)}`, body);
      if (res.status === 200) {
        return { ok: true, adr: (await res.json()) as Adr };
      }
      if (res.status === 409) {
        const data = (await res.json()) as { latest: Adr };
        return { ok: false, status: res.status, kind: "conflict", latest: data.latest };
      }
      if (res.status === 400) {
        const data = (await res.json()) as { missingFields?: string[]; missingTargets?: string[] };
        if (data.missingTargets) {
          return { ok: false, status: res.status, kind: "invalidRelations", missingTargets: data.missingTargets };
        }
        return { ok: false, status: res.status, kind: "invalid", missingFields: data.missingFields ?? [] };
      }
      return { ok: false, status: res.status, kind: "notFound" };
    },

    async getRelations(id) {
      const res = await fetch(`${baseUrl}/api/adrs/${encodeURIComponent(id)}/relations`);
      if (res.status === 200) {
        return { ok: true, relations: (await res.json()) as RelationView[] };
      }
      return { ok: false, status: res.status };
    },

    async createFolder(body) {
      const res = await postJson("/api/folders", body);
      if (res.status === 201) {
        return { ok: true, node: (await res.json()) as FolderNode };
      }
      if (res.status === 400) {
        const data = (await res.json()) as { missingFields: string[] };
        return { ok: false, status: res.status, kind: "invalid", missingFields: data.missingFields };
      }
      return { ok: false, status: res.status, kind: "conflict" };
    },

    async moveAdr(id, body) {
      const res = await postJson(`/api/adrs/${encodeURIComponent(id)}/move`, body);
      if (res.status === 200) {
        return { ok: true, adr: (await res.json()) as Adr };
      }
      if (res.status === 400) {
        const data = (await res.json()) as { missingFields: string[] };
        return { ok: false, status: res.status, kind: "invalid", missingFields: data.missingFields };
      }
      return { ok: false, status: res.status, kind: "notFound" };
    },

    async getTree(root) {
      const query = root ? `?root=${encodeURIComponent(root)}` : "";
      const res = await fetch(`${baseUrl}/api/tree${query}`);
      if (res.status === 200) {
        return { ok: true, tree: (await res.json()) as FolderNode };
      }
      return { ok: false, status: res.status };
    },

    async getHistory(id) {
      const res = await fetch(`${baseUrl}/api/adrs/${encodeURIComponent(id)}/history`);
      if (res.status === 200) {
        return { ok: true, history: (await res.json()) as CommitMeta[] };
      }
      return { ok: false, status: res.status };
    },

    async getVersionAt(id, sha) {
      const res = await fetch(`${baseUrl}/api/adrs/${encodeURIComponent(id)}/versions/${encodeURIComponent(sha)}`);
      if (res.status === 200) {
        return { ok: true, adr: (await res.json()) as Adr };
      }
      return { ok: false, status: res.status };
    },

    async getVersionDiff(id, from, to) {
      const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await fetch(`${baseUrl}/api/adrs/${encodeURIComponent(id)}/diff${query}`);
      if (res.status === 200) {
        return { ok: true, diff: (await res.json()) as VersionDiffView };
      }
      if (res.status === 400) {
        const data = (await res.json()) as { reason: string };
        return { ok: false, status: res.status, kind: "invalid", reason: data.reason };
      }
      return { ok: false, status: res.status, kind: "notFound" };
    },

    async compareAdrs(a, b) {
      const query = `?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
      const res = await fetch(`${baseUrl}/api/compare${query}`);
      if (res.status === 200) {
        return { ok: true, comparison: (await res.json()) as AdrCompareView };
      }
      if (res.status === 400) {
        const data = (await res.json()) as { missingFields?: string[]; reason?: string };
        if (data.missingFields) {
          return { ok: false, status: res.status, kind: "missingFields", missingFields: data.missingFields };
        }
        return { ok: false, status: res.status, kind: "invalidReason", reason: data.reason ?? "" };
      }
      return { ok: false, status: res.status, kind: "notFound" };
    },

    async search(q) {
      const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(q)}`);
      if (res.status === 200) {
        return { ok: true, hits: (await res.json()) as SearchHit[] };
      }
      return { ok: false, status: res.status };
    },

    async getSimilar(id, scope) {
      const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
      const res = await fetch(`${baseUrl}/api/adrs/${encodeURIComponent(id)}/similar${query}`);
      if (res.status === 200) {
        const data = (await res.json()) as SimilarityResult[] | { kind: "emptyScope" };
        if (Array.isArray(data)) {
          return { ok: true, kind: "ranked", results: data };
        }
        return { ok: true, kind: "emptyScope" };
      }
      return { ok: false, status: res.status };
    },

    async getFeed() {
      const res = await fetch(`${baseUrl}/api/feed`);
      if (res.status === 200) {
        return { ok: true, cards: (await res.json()) as FeedCard[] };
      }
      return { ok: false, status: res.status };
    },

    async getRawAdr(id) {
      const res = await fetch(`${baseUrl}/api/adrs/${encodeURIComponent(id)}/raw`);
      if (res.status === 200) {
        return { ok: true, raw: (await res.json()) as RawAdrContent };
      }
      return { ok: false, status: res.status };
    },

    async getSummarySuggestion(id) {
      const res = await fetch(`${baseUrl}/api/adrs/${encodeURIComponent(id)}/summary-suggestion`);
      if (res.status === 200) {
        return { ok: true, suggestion: (await res.json()) as SummarySuggestionResult };
      }
      return { ok: false, status: res.status };
    },
  };
}
