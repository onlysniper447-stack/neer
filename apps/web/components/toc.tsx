/** "On this page" links: a sticky column on desktop, wrapped chips above the content on smaller screens. */
export function Toc({ items, label = "On this page" }: { items: { id: string; title: string }[]; label?: string }) {
  return (
    <nav aria-label={label} className="lg:sticky lg:top-24 lg:self-start">
      <p className="mb-2 text-sm font-semibold text-ink">{label}</p>
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm text-muted transition-colors hover:border-brand/50 hover:text-ink lg:flex lg:rounded-md lg:border-0 lg:border-l-2 lg:border-transparent lg:px-3 lg:hover:border-brand lg:hover:bg-surface"
            >
              {i.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
