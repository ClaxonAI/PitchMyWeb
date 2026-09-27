import { after } from "next/server";

// Work a route does not make its caller wait for, like sending an email once
// a payment is recorded: the response goes out first, then this runs (Next's
// after()). The task must not throw; anything it does is caught here so a
// failure can only ever be logged, never surface in a finished request.
//
// Outside a request (tests and scripts calling a handler directly) after()
// refuses, and the task simply runs detached.

export type DeferTask = (task: () => Promise<unknown>) => void;

export const runAfterResponse: DeferTask = (task) => {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "after_response.failed", error: error instanceof Error ? error.name : "unknown" }));
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
};
