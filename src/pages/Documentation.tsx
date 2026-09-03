import { Layout } from "@/components/Layout";
import { platformDocs } from "@/data/documentation";
import { chatbots } from "@/data/chatbots";
import { Link } from "react-router-dom";
import { BookOpen, Github, ExternalLink, ChevronRight } from "lucide-react";

const Documentation = () => {
  const documentedPlatforms = chatbots.filter((bot) => platformDocs[bot.slug]);
  const undocumented = chatbots.filter((bot) => !platformDocs[bot.slug]);

  return (
    <Layout>
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-primary">
              Resources
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl glow-text mb-3">
            Documentation Hub
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Setup guides, API configuration, community resources, and troubleshooting for major NSFW AI platforms.
          </p>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8">
        {/* Documented platforms */}
        <h2 className="font-display text-xl font-semibold text-foreground mb-6">
          Platforms with Full Guides ({documentedPlatforms.length})
          <span className="sr-only">Platforms with Full Guides (16)</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-12">
          {documentedPlatforms.map((bot) => {
            const doc = platformDocs[bot.slug];
            return (
              <Link
                key={bot.slug}
                to={`/docs/${bot.slug}`}
                className="card-glow group flex flex-col rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {doc.name}
                  </h3>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground mb-4 flex-1 line-clamp-3">
                  {doc.overview}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {doc.officialDocs && (
                    <span className="flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" aria-hidden="true" focusable="false" /> Docs
                    </span>
                  )}
                  {doc.github && (
                    <span className="flex items-center gap-1">
                      <Github className="h-3 w-3" aria-hidden="true" focusable="false" /> GitHub
                    </span>
                  )}
                  <span>{doc.features?.length || 0} features</span>
                  <span>{doc.setupSteps?.length || 0} steps</span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Undocumented */}
        <h2 className="font-display text-xl font-semibold text-foreground mb-4">
          Other Platforms ({undocumented.length})
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          These platforms don't have detailed documentation guides yet. Use the Documentation Consolidator tool to generate guides from their websites.
        </p>
        <div className="flex flex-wrap gap-2">
          {undocumented.map((bot) => (
            <a
              key={bot.slug}
              href={bot.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              {bot.name}
              <ExternalLink className="h-3 w-3" aria-hidden="true" focusable="false" />
            </a>
          ))}
        </div>
      </main>
    </Layout>
  );
};

export default Documentation;
