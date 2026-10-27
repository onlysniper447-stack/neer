"use client";

import { Menu, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

/**
 * The three-bar menu, top left on every page and every screen size. It opens a
 * left drawer (Radix Dialog): focus is trapped inside, Esc or the close button
 * closes it, and focus returns to the menu button.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex size-11 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label="Open menu"
        data-testid="menu-button"
      >
        <Menu className="size-6" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left" data-testid="menu" className="overflow-y-auto">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-5">
          <LogoMark className="size-6 text-brand" />
          <SheetTitle className="text-lg">Neer menu</SheetTitle>
        </div>
        <SheetDescription className="sr-only">Tools, analytics, API docs and resources.</SheetDescription>
        <nav aria-label="Main" className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {NAV.map((section) => {
              const Icon = section.icon;
              const sectionActive = isActive(pathname, section.href);
              return (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    onClick={close}
                    aria-current={pathname === section.href ? "page" : undefined}
                    className={cn(
                      "group flex min-h-14 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      sectionActive && "bg-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-bg text-muted transition-colors group-hover:text-brand",
                        sectionActive && "border-brand/40 text-brand",
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{section.title}</span>
                      <span className="block text-sm text-muted">{section.description}</span>
                    </span>
                  </Link>
                  {section.links.length > 0 ? (
                    <ul className="mt-1 mb-2 ml-[1.9rem] space-y-0.5 border-l border-line pl-4">
                      {section.links.map((l) => {
                        const active = isActive(pathname, l.href);
                        return (
                          <li key={l.href}>
                            <Link
                              href={l.href}
                              onClick={close}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "flex min-h-11 items-center rounded-md px-3 text-[15px] transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                                active ? "font-medium text-brand" : "text-muted",
                              )}
                            >
                              {l.title}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-line px-5 py-4 text-sm text-muted">
          <p className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            Neer never asks for your seed phrase, a signature or an approval.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
