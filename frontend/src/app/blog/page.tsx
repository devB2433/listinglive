import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { BlogSidebar } from "@/components/blog/BlogSidebar";
import { getPostDates, getPosts } from "@/lib/blog-posts";

export const metadata = {
  title: "Blog",
  description:
    "Product updates, release notes, and tips for real estate agents using ListingLive. Canada-focused AI tools for listing video and marketing.",
};

export default function BlogPage() {
  const posts = getPosts();
  const dates = getPostDates();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
      <main className="min-w-0 space-y-6">
        {posts.map((post) => (
          <BlogPostCard key={post.slug} post={post} />
        ))}
      </main>
      <BlogSidebar posts={posts} currentSlug={null} dates={dates} />
    </div>
  );
}
