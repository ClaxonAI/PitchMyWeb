"use client";

import { ErrorState } from "@/components/errors/ErrorState";

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} />;
}
