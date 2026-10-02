import { Navigation } from "@/components/Navigation";
import { AgeGate } from "@/components/AgeGate";
import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { chatbots } from "@/data/chatbots";
import { Sparkles } from "lucide-react";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const [verified, setVerified] = useState(
    () => !!localStorage.getItem("age_verified")
  );

  const handleVerified = useCallback(() => setVerified(true), []);

  const lastUpdated = useMemo(() => {
    const dates = chatbots.map((b) => b.lastVerified).filter(Boolean);
    if (dates.length === 0) return null;
    const latest = dates.sort().reverse()[0];
    const [year, month] = latest.split("-");
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return `${monthNames[Number(month) - 1]} ${year}`;
  }, []);

  if (!verified) {
    return <AgeGate onVerified={handleVerified} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        onClick={() => {
          document.getElementById("main-content")?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:font-semibold focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      <Navigation />
      {children}
      <footer className="border-t border-border mt-12 section-band">
        <div className="container mx-auto px-4 py-10">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="font-display text-lg font-bold">AI Companion Hub</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A verification-first directory and local workbench for AI companion platforms.
                We catalog with dated evidence and help you draft cards and prompts on your machine —
                we do not host models, run live chat, or take payments.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Explore</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/" className="hover:text-primary transition-colors">Discover</Link></li>
                <li><Link to="/compare" className="hover:text-primary transition-colors">Compare</Link></li>
                <li><Link to="/tools" className="hover:text-primary transition-colors">Workbench</Link></li>
                <li><Link to="/docs" className="hover:text-primary transition-colors">Guides</Link></li>
                <li><Link to="/prompts" className="hover:text-primary transition-colors">Prompts</Link></li>
                <li><Link to="/blog" className="hover:text-primary transition-colors">Blog</Link></li>
                <li><Link to="/updates" className="hover:text-primary transition-colors">Updates</Link></li>
                <li><Link to="/community" className="hover:text-primary transition-colors">Community</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Community</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="https://chatbots.neocities.org" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                    Chatbots Webring
                  </a>
                </li>
                <li>
                  <a href="https://discord.gg/sillytavern" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                    SillyTavern Discord
                  </a>
                </li>
                <li>
                  <a href="https://chub.ai" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                    Chub.ai
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Informational directory only. Always verify platform policies before use. Users must be 18+.
              No hosted models, live chat, or payments on this site.
            </p>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Directory last verified: <span className="text-foreground/80 font-medium">{lastUpdated}</span>
              </p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
