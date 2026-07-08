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
if (!process.env.GIT_CONFIG_COUNT) {
  process.env.GIT_CONFIG_COUNT = "1";
  process.env.GIT_CONFIG_KEY_0 = "commit.gpgsign";
  process.env.GIT_CONFIG_VALUE_0 = "false";
}
