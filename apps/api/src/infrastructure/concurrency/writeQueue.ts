/**
 * Serializes write operations (ADR saves, folder/ADR moves, etc.) for the
 * single repository owned by this process.
 *
 * One Fastify process owns exactly one `ADR_REPO_PATH`, so a single
 * `WriteQueue` instance models that repo's write ordering: every job passed
 * to `enqueue` runs only after all previously enqueued jobs on this instance
 * have settled, and never concurrently with another job on the same
 * instance. This satisfies Requirement 2.4 ("apply the saves one at a time
 * so that no save is lost or corrupted") without a database-level lock.
 *
 * The queue does not retry or reorder jobs: a job that rejects simply
 * surfaces that rejection to its own caller, and the next job in line still
 * runs normally.
 */
export class WriteQueue {
  /**
   * Tail of the in-memory promise chain. Always settles (never rejects),
   * so that a failing job cannot poison the chain for subsequent jobs.
   */
  private tail: Promise<void> = Promise.resolve();

  /**
   * Appends `job` to the end of this queue's FIFO chain and returns a
   * Promise that resolves or rejects with that job's own outcome, once it
   * is this job's turn to run and it has finished running.
   */
  enqueue<T>(job: () => Promise<T>): Promise<T> {
    const previousTail = this.tail;

    const result = previousTail.then(job);

    // Advance the tail unconditionally so a rejection from this job does not
    // prevent the next enqueued job from running. The tail itself must never
    // reject, otherwise every future `.then(job)` chained off it would skip
    // straight to rejection without ever invoking its job.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }
}
