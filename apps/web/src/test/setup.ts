import "@testing-library/jest-dom/vitest";

// The web suite runs against a real Fastify backend that makes real git
// commits into throwaway temp repos. The sandbox's global gitconfig forces
// `commit.gpgsign true` via an ssh signing helper (`/tmp/code-sign`), so every
// test commit spawns that helper, which opens file descriptors. Under the full
// suite's parallel real-backend load this exhausts the process fd limit
// ("too many open files"), failing commits deep inside fixture setup.
//
// Throwaway test repos never need signed commits, so disable signing for every
// git subprocess this worker spawns. `GIT_CONFIG_*` env overrides apply to all
// `git` invocations and win over the global config; child processes started by
// simple-git inherit this process's env. This is a test-only override — it does
// not touch the application's own commit behavior.
//
// The sandbox already publishes its own GIT_CONFIG_* set (credential and
// url.insteadOf rewrites), so we must APPEND our entry at the next index and
// bump GIT_CONFIG_COUNT rather than overwrite — clobbering the count would drop
// the sandbox's entries, and skipping when a count already exists (as an
// earlier version did) silently no-ops this fix.
(function disableCommitSigningForGitSubprocesses(): void {
  const existing = Number(process.env.GIT_CONFIG_COUNT ?? "0");
  const count = Number.isFinite(existing) && existing > 0 ? existing : 0;
  // Don't append twice if setup runs more than once in the same worker.
  for (let i = 0; i < count; i++) {
    if (process.env[`GIT_CONFIG_KEY_${i}`] === "commit.gpgsign") return;
  }
  process.env[`GIT_CONFIG_KEY_${count}`] = "commit.gpgsign";
  process.env[`GIT_CONFIG_VALUE_${count}`] = "false";
  process.env.GIT_CONFIG_COUNT = String(count + 1);
})();
