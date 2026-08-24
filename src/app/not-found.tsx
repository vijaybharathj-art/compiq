import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-8 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground">
        <SearchX className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">Page not found</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        The deal, client, or page you&apos;re looking for doesn&apos;t exist or may have been removed.
      </p>
      <Button asChild variant="secondary" size="sm">
        <Link href="/dashboard">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
