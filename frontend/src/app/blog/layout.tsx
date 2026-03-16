import Link from "next/link";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-950 hover:text-blue-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand-mark.svg?v=2" alt="ListingLive" className="h-8 w-8 rounded-lg object-contain shrink-0" />
            <span>ListingLive</span>
          </Link>
          <Link href="/blog" className="text-sm text-slate-600 hover:text-slate-900">
            Blog
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8">{children}</div>
    </div>
  );
}
