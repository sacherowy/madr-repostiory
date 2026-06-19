import { describe, it, expect } from "vitest";
import { WriteQueue } from "./writeQueue.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("WriteQueue", () => {
  it("runs jobs submitted in immediate succession strictly in submission order, even when the first job is slower than the second", async () => {
    const queue = new WriteQueue();
    const order: string[] = [];

    // Job 1 is deliberately slower than job 2. If enqueue() ran jobs
    // immediately/concurrently instead of chaining them, job 2 (fast) would
    // finish and record itself before job 1 (slow) did, producing
    // ["job2", "job1"] instead of the required submission order.
    const job1 = queue.enqueue(async () => {
      await delay(50);
      order.push("job1");
      return "result1";
    });
    const job2 = queue.enqueue(async () => {
      await delay(1);
      order.push("job2");
      return "result2";
    });

    const [result1, result2] = await Promise.all([job1, job2]);

    expect(order).toEqual(["job1", "job2"]);
    expect(result1).toBe("result1");
    expect(result2).toBe("result2");
  });

  it("ensures the second job only starts after the first job's body has fully completed, observing its effects on shared state", async () => {
    const queue = new WriteQueue();
    let counter = 0;
    let counterSeenByJob2: number | null = null;

    const job1 = queue.enqueue(async () => {
      await delay(20);
      counter += 1; // mutate shared state
      return counter;
    });
    const job2 = queue.enqueue(async () => {
      // No artificial delay here: if job2's body ran before job1 finished,
      // counterSeenByJob2 would be captured as 0, not 1.
      counterSeenByJob2 = counter;
      return counter;
    });

    await Promise.all([job1, job2]);

    expect(counterSeenByJob2).toBe(1);
  });

  it("lets the caller of a rejecting job observe that rejection, without breaking the chain for subsequent jobs", async () => {
    const queue = new WriteQueue();
    const order: string[] = [];

    const job1 = queue.enqueue(async () => {
      order.push("job1");
      return "ok1";
    });
    const failingJob = queue.enqueue(async () => {
      order.push("failingJob");
      throw new Error("boom");
    });
    const job3 = queue.enqueue(async () => {
      order.push("job3");
      return "ok3";
    });

    await expect(job1).resolves.toBe("ok1");
    await expect(failingJob).rejects.toThrow("boom");
    await expect(job3).resolves.toBe("ok3");

    expect(order).toEqual(["job1", "failingJob", "job3"]);
  });

  it("resolves enqueue() with the job's own return value", async () => {
    const queue = new WriteQueue();

    const result = await queue.enqueue(async () => ({ ok: true, value: 42 }));

    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("never runs two jobs' bodies concurrently, even under many simultaneous enqueues", async () => {
    const queue = new WriteQueue();
    let active = 0;
    let maxActive = 0;
    const jobs: Array<Promise<number>> = [];

    for (let i = 0; i < 10; i++) {
      jobs.push(
        queue.enqueue(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await delay(5);
          active -= 1;
          return i;
        }),
      );
    }

    const results = await Promise.all(jobs);

    expect(maxActive).toBe(1);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
