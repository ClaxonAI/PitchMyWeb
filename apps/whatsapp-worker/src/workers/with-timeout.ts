/**
 * Bounds a provider call that has no timeout of its own.
 *
 * Baileys' `sendMessage` can hang for minutes resolving a recipient it has
 * no Signal session with, and it has no upper bound at all if the resolution
 * never completes. With `WA_SEND_CONCURRENCY` at 1 that pins the message at
 * SENDING *and* blocks every other send in the process behind it, so the
 * call needs a ceiling the worker controls.
 */
export class OperationTimeoutError extends Error {
  constructor(
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super(`${operation} did not finish within ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

export async function withTimeout<T>(operation: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new OperationTimeoutError(operation, timeoutMs)), timeoutMs);
        // Never hold the process open just to fire a rejection.
        timer.unref?.();
      }),
    ]);
  } finally {
    // The losing promise keeps running either way — there is no way to
    // cancel a Baileys call — but the timer must not outlive the race.
    if (timer) clearTimeout(timer);
  }
}
