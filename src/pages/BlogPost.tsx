import { Layout } from "@/components/Layout";
import { useBlogPost } from "@/data/useBlogPosts";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Clock, Tag } from "lucide-react";
import { Helmet } from "react-helmet-async";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const formatDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

const BlogPost = () => {
  const { id } = useParams<{ id: string }>();
  const { data: post, isPending, isError } = useBlogPost(id);

  if (!post) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-lg text-muted-foreground mb-4" role={isError ? "alert" : "status"}>
            {isPending ? "Loading article…" : isError ? "This article is temporarily unavailable." : "Article not found."}
          </p>
          <Link to="/blog" className="text-primary hover:underline">
            ← Back to Blog
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>{post.metaTitle || post.title} — AI Companion Hub</title>
        <meta name="description" content={post.metaDescription || post.excerpt} />
        <link rel="canonical" href={`https://www.companionhub.app/blog/${post.id}`} />
      </Helmet>
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-8 sm:py-12 max-w-3xl">
          <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Blog
          </Link>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-primary bg-primary/10 rounded px-2 py-0.5">
              {post.category}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.readTime}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(post.date)}</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl glow-text mb-4 leading-tight">
            {post.title}
          </h1>
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span key={tag} className="text-xs text-muted-foreground bg-secondary rounded px-2 py-0.5 flex items-center gap-1">
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8 max-w-3xl">
        <article className="prose prose-invert prose-sm sm:prose-base max-w-none">
          {post.image && <img src={post.image} alt="" className="w-full rounded-xl" referrerPolicy="no-referrer" />}
          {post.markdown && (
            <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>{post.markdown}</ReactMarkdown>
          )}
          {!post.markdown && post.html && (
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.html, {
              ALLOWED_TAGS: ["h2", "h3", "h4", "p", "ul", "ol", "li", "a", "strong", "b", "em", "i", "br",
                "hr", "blockquote", "pre", "code", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td"],
              ALLOWED_ATTR: ["href", "src", "alt", "title", "scope", "rowspan", "colspan"],
              ALLOW_DATA_ATTR: false,
            }) }} />
          )}
          {post.sections.map((section, i) => (
            <div key={i} className="mb-6">
              {section.heading && (
                <h2 className="font-display text-xl font-semibold text-foreground mb-3 mt-8">
                  {section.heading}
                </h2>
              )}
              {section.paragraphs.map((p, j) => (
                <p key={j} className="text-muted-foreground leading-relaxed mb-4">
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul className="space-y-2 mb-4">
                  {section.bullets.map((b, j) => (
                    <li key={j} className="flex items-start gap-2 text-muted-foreground">
                      <span className="text-primary mt-1.5">•</span>
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </article>
      </main>
    </Layout>
  );
};

export default BlogPost;
