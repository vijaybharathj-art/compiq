import { Globe, ShieldCheck } from "lucide-react";
import { referenceRepository } from "@/lib/data";
import { loginAsBanker } from "@/lib/auth/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/dashboard";
  const bankers = await referenceRepository.bankers();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-sm bg-accent text-accent-foreground text-sm font-bold">
            T
          </div>
          <span className="text-base font-semibold tracking-tight">TATTAVA</span>
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <h1 className="text-lg font-semibold text-foreground">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Demo Mode — choose an account to continue. No password required.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            {bankers.map((b) => (
              <form key={b.id} action={loginAsBanker}>
                <input type="hidden" name="userId" value={b.id} />
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-surface-raised"
                >
                  <Avatar className="size-8">
                    <AvatarFallback>{initials(b.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{b.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.title}</p>
                  </div>
                </button>
              </form>
            ))}
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or connect via</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="secondary" disabled className="justify-start gap-2">
              <Globe className="size-4" />
              Continue with Google — planned integration
            </Button>
            <Button variant="secondary" disabled className="justify-start gap-2">
              <ShieldCheck className="size-4" />
              Continue with Microsoft — planned integration
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Tattava never requests or stores a mailbox password. See SECURITY.md.
        </p>
      </div>
    </div>
  );
}
