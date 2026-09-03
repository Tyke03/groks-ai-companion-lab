import { Layout } from "@/components/Layout";
import { Wrench, BookOpen, UserRound, Network } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocConsolidator } from "@/components/tools/DocConsolidator";
import { CharacterCardBuilder } from "@/components/tools/CharacterCardBuilder";
import { PromptBuilder } from "@/components/tools/PromptBuilder";

const Tools = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "prompts" ? "prompts" : "consolidator";

  return (
    <Layout>
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-2">
            <Wrench className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-primary">
              Tools
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl glow-text mb-3">
            AI Chatbot Tools
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Documentation consolidator, card and persona builders, lorebooks, prompt templates, and connection diagnostics for creators.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/tools/lorebook-builder" className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"><BookOpen className="h-4 w-4" /> Lorebook Builder</Link>
            <Link to="/tools/persona-builder" className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"><UserRound className="h-4 w-4" /> Persona Builder</Link>
            <Link to="/tools/api-tester" className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"><Network className="h-4 w-4" /> API Tester</Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8">
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full justify-start bg-secondary border border-border rounded-lg p-1 mb-8 overflow-x-auto">
            <TabsTrigger value="consolidator" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2 text-sm font-medium">
              📄 Doc Consolidator
            </TabsTrigger>
            <TabsTrigger value="character" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2 text-sm font-medium">
              🎭 Character Builder
            </TabsTrigger>
            <TabsTrigger value="prompts" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2 text-sm font-medium">
              ✍️ Prompt Builder
            </TabsTrigger>
          </TabsList>

          <TabsContent value="consolidator">
            <DocConsolidator />
          </TabsContent>
          <TabsContent value="character">
            <CharacterCardBuilder />
          </TabsContent>
          <TabsContent value="prompts">
            <PromptBuilder />
          </TabsContent>
        </Tabs>
      </main>
    </Layout>
  );
};

export default Tools;
