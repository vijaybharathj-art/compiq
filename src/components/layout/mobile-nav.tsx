"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/layout/sidebar";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="size-8 lg:hidden" aria-label="Open navigation">
          <Menu className="size-4" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-fade-in lg:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex h-dvh w-64 flex-col border-r border-border bg-surface data-[state=open]:animate-fade-in lg:hidden"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="flex h-14 items-center justify-between border-b border-border pr-2 pl-4">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-sm bg-accent text-accent-foreground text-xs font-bold">
                T
              </div>
              <span className="text-sm font-semibold tracking-tight">TATTAVA</span>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Close navigation">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
