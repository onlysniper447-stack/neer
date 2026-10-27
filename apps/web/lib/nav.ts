import { BookOpen, ChartColumn, Code, Wrench, type LucideIcon } from "lucide-react";

export interface NavLink {
  title: string;
  href: string;
  description: string;
}

export interface NavSection extends NavLink {
  icon: LucideIcon;
  links: NavLink[];
}

/** The four menu sections. Every href is a real page. */
export const NAV: NavSection[] = [
  {
    title: "Tools",
    href: "/tools",
    icon: Wrench,
    description: "Check, track and verify deposits",
    links: [
      { title: "Deposit preflight", href: "/", description: "Check a deposit before you send" },
      { title: "Swap tracker", href: "/track", description: "Follow a deposit until it lands" },
      { title: "Address checker", href: "/tools/address", description: "Validate an address and its checksum" },
    ],
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: ChartColumn,
    description: "Live networks, tokens, minimums and rules",
    links: [],
  },
  {
    title: "API",
    href: "/developers",
    icon: Code,
    description: "Preflight and track endpoints, widget",
    links: [],
  },
  {
    title: "Resources",
    href: "/resources",
    icon: BookOpen,
    description: "How it works, checks explained, FAQ",
    links: [],
  },
];

/** True when `href` is the current page or a parent of it ("/" only matches itself and /check). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "/check";
  return pathname === href || pathname.startsWith(`${href}/`);
}
