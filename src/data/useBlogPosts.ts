import { useQuery } from "@tanstack/react-query";
import { blogPosts, type BlogPost, type BlogSection } from "@/data/blogPosts";
import { supabase } from "@/integrations/supabase/client";

const listing = "slug,title,excerpt,category,date,read_time,tags";
type SummaryRow = {
  slug: string; title: string; excerpt: string; category: string; date: string; read_time: string; tags: string[];
};

function summary(row: SummaryRow) {
  return {
    id: row.slug, title: row.title, excerpt: row.excerpt, category: row.category,
    date: row.date, readTime: row.read_time, tags: row.tags,
  };
}

export type Article = BlogPost & {
  markdown?: string | null; html?: string | null; image?: string | null;
  metaTitle?: string | null; metaDescription?: string | null;
};

export function useBlogPosts(enabled = true) {
  return useQuery({
    queryKey: ["blog", "listing"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      // Offline development fixture only. Configured sites use Supabase exclusively.
      if (!supabase) return blogPosts.map(({ sections: _sections, ...post }) => post);
      const posts: ReturnType<typeof summary>[] = [];
      for (let offset = 0;; offset += 200) {
        const { data, error } = await supabase.from("blog_posts").select(listing)
          .eq("status", "published").order("date", { ascending: false }).order("slug").range(offset, offset + 199);
        if (error) throw error;
        posts.push(...data.map(summary));
        if (data.length < 200) return posts;
      }
    },
    initialData: supabase ? undefined : () => blogPosts,
  });
}

export function useBlogPost(id: string | undefined) {
  return useQuery<Article | null>({
    queryKey: ["blog", "article", id],
    enabled: Boolean(id),
    staleTime: 60_000,
    queryFn: async () => {
      if (!id) return null;
      if (!supabase) return blogPosts.find((post) => post.id === id) ?? null;
      const { data, error } = await supabase.from("blog_posts").select(
        `${listing},sections,markdown,html,image_url,meta_title,meta_description`,
      ).eq("slug", id).eq("status", "published").maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...summary(data), sections: data.sections as unknown as BlogSection[],
        markdown: data.markdown, html: data.html, image: data.image_url,
        metaTitle: data.meta_title, metaDescription: data.meta_description,
      };
    },
    initialData: supabase ? undefined : () => blogPosts.find((post) => post.id === id) ?? null,
  });
}
