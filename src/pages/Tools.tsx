import { Layout } from "@/components/Layout";
import { Wrench, UserRound, Network } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocConsolidator } from "@/components/tools/DocConsolidator";
import { CharacterCardBuilder } from "@/components/tools/CharacterCardBuilder";
import { PromptBuilder } from "@/components/tools/PromptBuilder";
import LorebookBuilder from "@/components/tools/LorebookBuilder";
import { NeonSectionDivider } from "@/components/tools/WorkbenchCardPicker";

const TAB_VALUES = new Set(["character", "lorebook", "prompts", "consolidator"]);

const Tools = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") ?? "";
  const activeTab = TAB_VALUES.has(requested) ? requested : "character";

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (TAB_VALUES.has(value)) next.set("tab", value);
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };

  return (
    <Layout>
      <header className="border-b border-border section-band">
        <div className="container mx-auto px-4 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-2">
            <Wrench className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-primary">
              Workbench
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-5xl mb-3">
            Local workbench
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Start with Character Card Builder, then Lorebook or prompts. Doc Consolidator is secondary — paste notes to draft a Hub guide. Everything runs locally; AI assist is optional. Not hosted chat, and not a place to enter API keys.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Workbench honesty">
            <span className="honesty-pill">Runs in your browser</span>
            <span className="honesty-pill">No credential collection</span>
            <span className="honesty-pill">Offline drafts work without AI</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/tools/persona-builder" className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"><UserRound className="h-4 w-4" /> Persona Builder</Link>
            <Link to="/tools/api-tester" className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"><Network className="h-4 w-4" /> API Tester</Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full justify-start bg-secondary border border-border rounded-lg p-1 mb-8 overflow-x-auto">
            <TabsTrigger value="character" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2 text-sm font-medium">
              Character Card Builder
            </TabsTrigger>
            <TabsTrigger value="lorebook" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2 text-sm font-medium">
              Lorebook Builder
            </TabsTrigger>
            <TabsTrigger value="prompts" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2 text-sm font-medium">
              Prompt Builder
            </TabsTrigger>
            <TabsTrigger value="consolidator" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2 text-sm font-medium">
              Doc Consolidator
            </TabsTrigger>
          </TabsList>
          <NeonSectionDivider className="mb-4 -mt-4" />
          <p className="mb-6 text-xs text-muted-foreground">
            Character Card Builder is the default tool. Lorebook Builder is a first-class tab. Secondary: Doc Consolidator builds a Hub guide from pasted notes (AI optional).
          </p>

          <TabsContent value="character">
            <CharacterCardBuilder />
          </TabsContent>
          <TabsContent value="lorebook">
            <LorebookBuilder />
          </TabsContent>
          <TabsContent value="prompts">
            <PromptBuilder />
          </TabsContent>
          <TabsContent value="consolidator">
            <DocConsolidator />
          </TabsContent>
        </Tabs>
      </main>
    </Layout>
  );
};

export default Tools;
