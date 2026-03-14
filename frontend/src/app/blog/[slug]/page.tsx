import { notFound } from "next/navigation";

import { BlogPostBody } from "@/components/blog/BlogPostBody";
import { BlogSidebar } from "@/components/blog/BlogSidebar";
import { BLOG_POSTS } from "@/lib/blog-posts-meta";
import {
  getPostBySlug,
  getPostContent,
  getPostDates,
  getPosts,
} from "@/lib/blog-posts";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Blog | ListingLive" };
  return { title: `${post.title} | ListingLive Blog` };
}

export default async function BlogSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const posts = getPosts();
  const dates = getPostDates();
  let content: string;
  try {
    content = getPostContent(post);
  } catch {
    notFound();
  }
  const firstH1Match = content.match(/^#\s+(.+?)(\n|$)/);
  if (firstH1Match && firstH1Match[1].trim() === post.title) {
    content = content.replace(/^#\s+[^\n]+\n+/, "");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
      <main className="min-w-0 rounded-2xl border border-slate-300/70 bg-white/80 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] lg:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          {post.title}
        </h1>
        <time
          dateTime={post.date}
          className="mt-2 block text-sm text-slate-500"
        >
          {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(
            new Date(post.date + "T00:00:00"),
          )}
        </time>
        <div className="mt-6">
          <BlogPostBody content={content} />
        </div>
      </main>
      <BlogSidebar posts={posts} currentSlug={post.slug} dates={dates} />
    </div>
  );
}
