"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Tattava app error:", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded-md border border-negative/30 bg-negative/10 text-negative">
        <TriangleAlert className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">Something went wrong</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <Button variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
