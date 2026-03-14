"use client";

import Link from "next/link";

import { useLocale } from "@/components/providers/locale-provider";
import type { BlogPostMeta } from "@/lib/blog-posts-meta";
import { BlogCalendarHeatmap } from "./BlogCalendarHeatmap";

type BlogSidebarProps = {
  posts: BlogPostMeta[];
  currentSlug: string | null;
  dates: string[];
};

function formatBlogDate(dateStr: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(dateStr + "T00:00:00"));
}

export function BlogSidebar({ posts, currentSlug, dates }: BlogSidebarProps) {
  const { locale, translate } = useLocale();

  return (
    <aside className="space-y-6">
      <BlogCalendarHeatmap
        dates={dates}
        locale={locale === "zh-CN" ? "zh-CN" : "en"}
        labelHasPost={translate("blog.heatmapHasPost")}
        labelNoPost={translate("blog.heatmapNoPost")}
      />
      <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <p className="text-sm font-medium text-slate-700">{translate("blog.otherArticles")}</p>
        <ul className="mt-3 space-y-2">
          {posts.map((post) => {
            const isCurrent = post.slug === currentSlug;
            return (
              <li key={post.slug}>
                <Link
                  href={isCurrent ? "/blog" : `/blog/${post.slug}`}
                  className={`block rounded-lg px-2 py-1.5 text-sm transition ${
                    isCurrent ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="line-clamp-2">{post.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{formatBlogDate(post.date, locale)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
