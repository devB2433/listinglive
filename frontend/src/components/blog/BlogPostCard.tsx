"use client";

import Link from "next/link";
import { useState } from "react";

import { useLocale } from "@/components/providers/locale-provider";
import type { BlogPostMeta } from "@/lib/blog-posts-meta";
import { ChevronDown, ChevronUp } from "lucide-react";

const PREVIEW_LEN = 120;

function getPreview(full: string | undefined, len: number): { preview: string; hasMore: boolean } {
  if (!full) return { preview: "", hasMore: false };
  const t = full.trim();
  if (t.length <= len) return { preview: t, hasMore: false };
  return { preview: t.slice(0, len).trim() + "…", hasMore: true };
}

type BlogPostCardProps = {
  post: BlogPostMeta;
};

export function BlogPostCard({ post }: BlogPostCardProps) {
  const { locale, translate } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const fullSummary = post.summary?.trim() ?? "";
  const { preview, hasMore } = getPreview(post.summary, PREVIEW_LEN);
  const dateStr = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", { dateStyle: "long" }).format(
    new Date(post.date + "T00:00:00"),
  );

  return (
    <article className="rounded-2xl border border-slate-300/70 bg-white/80 p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">
        <Link href={`/blog/${post.slug}`} className="hover:text-blue-700 hover:underline">
          {post.title}
        </Link>
      </h2>
      <time dateTime={post.date} className="mt-1 block text-sm text-slate-500">
        {dateStr}
      </time>
      <div className="mt-3 text-sm text-slate-600">
        {(preview || fullSummary) ? (
          <>
          {expanded ? (
            <>
              <p className="whitespace-pre-wrap">{fullSummary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
                >
                  <ChevronUp className="h-4 w-4" />
                  {translate("blog.collapse")}
                </button>
                <Link href={`/blog/${post.slug}`} className="text-blue-700 hover:underline">
                  {translate("blog.readMore")} →
                </Link>
              </div>
            </>
          ) : (
            <>
              <p>{preview}</p>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="mt-2 inline-flex items-center gap-0.5 text-slate-500 hover:text-blue-700"
                >
                  <ChevronDown className="h-4 w-4" />
                  {translate("blog.expand")}
                </button>
              )}
              {!hasMore && fullSummary && (
                <p className="mt-2">
                  <Link href={`/blog/${post.slug}`} className="text-blue-700 hover:underline">
                    {translate("blog.readMore")} →
                  </Link>
                </p>
              )}
            </>
          )}
          </>
        ) : (
          <Link href={`/blog/${post.slug}`} className="text-blue-700 hover:underline">
            {translate("blog.readMore")} →
          </Link>
        )}
      </div>
    </article>
  );
}
