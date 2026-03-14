import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { BlogSidebar } from "@/components/blog/BlogSidebar";
import { getPostContent, getPostDates, getPosts } from "@/lib/blog-posts";

export const metadata = {
  title: "Blog",
  description:
    "Product updates, release notes, and tips for real estate agents using ListingLive. Canada-focused AI tools for listing video and marketing.",
};

function getContentForCard(post: { title: string; sourceFile: string }) {
  try {
    let content = getPostContent(post);
    const firstH1Match = content.match(/^#\s+(.+?)(\n|$)/);
    if (firstH1Match && firstH1Match[1].trim() === post.title) {
      content = content.replace(/^#\s+[^\n]+\n+/, "");
    }
    return content;
  } catch {
    return "";
  }
}

export default function BlogPage() {
  const posts = getPosts();
  const dates = getPostDates();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
      <main className="min-w-0 space-y-6">
        {posts.map((post) => (
          <BlogPostCard key={post.slug} post={post} content={getContentForCard(post)} />
        ))}
      </main>
      <BlogSidebar posts={posts} currentSlug={null} dates={dates} />
    </div>
  );
}
