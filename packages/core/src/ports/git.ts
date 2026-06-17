export interface CommitMeta {
  sha: string;
  author: string;
  date: string;
  message: string;
}
export interface DiffResult {
  from: string;
  to: string;
  patch: string;
}
export interface AdrFile {
  path: string;
  blobSha: string;
}

/** Jedyne wejście domeny do repozytorium = źródła prawdy. */
export interface GitPort {
  read(path: string, ref?: string): Promise<string>;
  currentBlobSha(path: string): Promise<string | null>;
  writeAndCommit(
    path: string,
    content: string,
    message: string,
    author: string
  ): Promise<CommitMeta>;
  log(path: string): Promise<CommitMeta[]>;
  diff(from: string, to: string, path?: string): Promise<DiffResult>;
  listAdrFiles(branchPath: string): Promise<AdrFile[]>;
}
