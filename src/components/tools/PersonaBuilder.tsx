import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Persona { name: string; physicalDescription: string; backstory: string; traits: string; dialogueStyle: string; }
const initialPersona: Persona = { name: "", physicalDescription: "", backstory: "", traits: "", dialogueStyle: "" };
const draftKey = "ai-companion-hub-persona-draft";

const PersonaBuilder = () => {
  const [persona, setPersona] = useState<Persona>(() => { try { return JSON.parse(localStorage.getItem(draftKey) || "null") || initialPersona; } catch { return initialPersona; } });
  const [format, setFormat] = useState<"json" | "text" | "wpp">("json");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify(persona)); }, [persona]);
  const update = (field: keyof Persona, value: string) => setPersona((previous) => ({ ...previous, [field]: value }));
  const output = format === "json" ? JSON.stringify({ name: persona.name, description: [persona.physicalDescription, persona.backstory, persona.traits, persona.dialogueStyle].filter(Boolean).join("\n\n") }, null, 2)
    : format === "wpp" ? `{{user}} = {\n  Name: ${persona.name}\n  Physical description: ${persona.physicalDescription}\n  Backstory: ${persona.backstory}\n  Personality traits: ${persona.traits}\n  Dialogue style / quirks: ${persona.dialogueStyle}\n}`
    : `[Persona]\nName: ${persona.name}\nPhysical Description: ${persona.physicalDescription}\nBackstory: ${persona.backstory}\nPersona Traits: ${persona.traits}\nDialogue Style / Quirks: ${persona.dialogueStyle}`;
  const copy = () => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const download = () => { const blob = new Blob([output], { type: format === "json" ? "application/json" : "text/plain" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${persona.name || "user-persona"}.${format === "json" ? "json" : "txt"}`; anchor.click(); URL.revokeObjectURL(url); toast({ title: "Persona exported", description: `${format.toUpperCase()} format downloaded.` }); };
  const fields: { key: keyof Persona; label: string; placeholder: string; id: string }[] = [
    { key: "name", label: "Persona Name", placeholder: "Alex", id: "persona-name" },
    { key: "physicalDescription", label: "Physical Description", placeholder: "Appearance, age range, clothing, body language...", id: "persona-physical" },
    { key: "backstory", label: "Backstory", placeholder: "Relevant history, current life, relationships, and context...", id: "persona-backstory" },
    { key: "traits", label: "Persona Traits", placeholder: "Curious, dry humor, protective, observant...", id: "persona-traits" },
    { key: "dialogueStyle", label: "Dialogue Style / Quirks", placeholder: "Short sentences, uses em dashes, avoids slang...", id: "persona-dialogue" },
  ];
  return <div className="max-w-4xl space-y-6"><div><h2 className="font-display text-xl font-semibold text-foreground">User Persona Builder</h2><p className="mt-2 text-sm text-muted-foreground">Create a dedicated <code className="text-primary">{"{{user}}"}</code> persona file, separate from character cards. Drafts save automatically in this browser only.</p></div><div className="grid gap-6 lg:grid-cols-2"><div className="space-y-4 rounded-xl border border-border bg-card p-5">{fields.map((field) => <div key={field.key}><label htmlFor={field.id} className="mb-1 block text-sm font-medium text-foreground">{field.label}</label>{field.key === "name" ? <Input id={field.id} value={persona[field.key]} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder} className="bg-secondary" /> : <Textarea id={field.id} value={persona[field.key]} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder} className="min-h-[100px] bg-secondary text-sm" />}</div>)}</div><div className="space-y-4"><fieldset className="space-y-2"><legend className="text-sm font-medium text-foreground">Output format</legend><div className="flex flex-wrap gap-2">{(["json", "text", "wpp"] as const).map((value) => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)} className={`rounded-lg border px-3 py-1.5 text-sm ${format === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>{value === "json" ? "SillyTavern Persona JSON" : value === "text" ? "Plain text blocks" : "W++"}</button>)}</div></fieldset><div><p id="persona-output-label" className="mb-1 text-sm font-medium text-foreground">Persona output preview</p><pre aria-label="Persona output preview" tabIndex={0} className="min-h-[330px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-secondary/50 p-4 text-xs text-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{output}</pre></div><div className="flex gap-2"><Button onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy output"}</Button><Button variant="outline" onClick={download}><Download className="h-4 w-4" /> Download</Button></div></div></div></div>;
};
export default PersonaBuilder;
