import { SiteFooter, SiteHeader } from "@/components/site-header";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 pt-8 outline-none sm:px-6 lg:px-8 lg:pt-12">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
