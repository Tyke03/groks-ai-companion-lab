import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Eye, EyeOff, Loader2, Network, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Model { id: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; }
const endpoints = { openrouter: "https://openrouter.ai/api/v1", kobold: "", custom: "" };
const withTimeout = (request: Promise<Response>) => Promise.race([request, new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Request timed out after 15 seconds.")), 15000))]);

const ApiTester = () => {
  const [provider, setProvider] = useState<keyof typeof endpoints>("openrouter");
  const [endpoint, setEndpoint] = useState(endpoints.openrouter);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [ping, setPing] = useState<{ latency: number; text: string } | null>(null);
  const { toast } = useToast();
  const headers = () => ({ Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" });
  const loadModels = async () => {
    if (!endpoint.trim()) { toast({ title: "Endpoint required", description: "Enter an OpenAI-compatible base URL.", variant: "destructive" }); return; }
    setLoading(true); setPing(null);
    try { const response = await withTimeout(fetch(`${endpoint.replace(/\/$/, "")}/models`, { headers: headers() })); const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || `Model request failed (${response.status})`); const list = Array.isArray(data?.data) ? data.data : []; setModels(list); setSelectedModel(list[0]?.id || ""); toast({ title: "Models loaded", description: `${list.length} model(s) available.` }); }
    catch (error) { toast({ title: "Could not load models", description: error instanceof Error ? error.message : "Check endpoint and key.", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  const testPing = async () => {
    if (!selectedModel) { toast({ title: "Choose a model", description: "Load models before testing a ping.", variant: "destructive" }); return; }
    setLoading(true); setPing(null); const started = performance.now();
    try { const response = await withTimeout(fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: headers(), body: JSON.stringify({ model: selectedModel, messages: [{ role: "user", content: "Reply with exactly: connection ok" }], max_tokens: 8, temperature: 0 }) })); const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || `Ping failed (${response.status})`); const latency = Math.round(performance.now() - started); setPing({ latency, text: data?.choices?.[0]?.message?.content || "Response received" }); toast({ title: "Connection verified", description: `${latency} ms round trip.` }); }
    catch (error) { toast({ title: "Ping failed", description: error instanceof Error ? error.message : "The endpoint did not respond.", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  return <div className="max-w-4xl space-y-6"><div><h2 className="font-display text-xl font-semibold text-foreground">API Key & Model Access Tester</h2><p className="mt-2 text-sm text-muted-foreground">Test OpenRouter, Kobold, or any OpenAI-compatible endpoint without sending credentials to this app. The key exists only in component memory and is never logged or persisted.</p></div><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Privacy notice: requests go directly from your browser to the endpoint you choose. Use a short-lived/restricted key when possible, and clear the field when finished.</div><div className="rounded-xl border border-border bg-card p-5 space-y-4"><div className="grid gap-4 md:grid-cols-2"><div><label id="api-provider-label" className="mb-1 block text-sm font-medium">Provider</label><Select value={provider} onValueChange={(value: keyof typeof endpoints) => { setProvider(value); setEndpoint(endpoints[value]); }}><SelectTrigger aria-labelledby="api-provider-label" className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="openrouter">OpenRouter</SelectItem><SelectItem value="kobold">Kobold / KoboldCPP</SelectItem><SelectItem value="custom">Custom OpenAI-compatible</SelectItem></SelectContent></Select></div><div><label htmlFor="api-endpoint" className="mb-1 block text-sm font-medium">Base endpoint</label><Input id="api-endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.example.com/v1" className="bg-secondary" /></div></div><div><label htmlFor="api-key" className="mb-1 block text-sm font-medium">API key (memory only)</label><div className="relative"><Input id="api-key" type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={provider === "kobold" ? "Optional for local endpoints" : "Paste key for this session"} className="bg-secondary pr-10" autoComplete="off"/><button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showKey ? "Hide API key" : "Show API key"}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div><div className="flex flex-wrap gap-2"><Button onClick={loadModels} disabled={loading || !endpoint}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />} Fetch available models</Button><Button variant="outline" onClick={testPing} disabled={loading || !selectedModel}><Wifi className="h-4 w-4" /> Test one-turn ping</Button></div></div>{models.length > 0 && <div className="rounded-xl border border-border bg-card p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Available models ({models.length})</h3><Select value={selectedModel} onValueChange={setSelectedModel}><SelectTrigger aria-label="Select a model" className="w-full bg-secondary sm:w-[320px]"><SelectValue placeholder="Select a model" /></SelectTrigger><SelectContent>{models.map((model) => <SelectItem key={model.id} value={model.id}>{model.id}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{models.slice(0, 12).map((model) => <div key={model.id} className={`rounded-lg border p-3 ${selectedModel === model.id ? "border-primary bg-primary/5" : "border-border bg-secondary/30"}`}><p className="truncate text-sm font-medium">{model.id}</p><p className="mt-1 text-xs text-muted-foreground">Context: {model.context_length ? model.context_length.toLocaleString() : "Provider did not disclose"}</p><p className="text-xs text-muted-foreground">Pricing: {model.pricing ? `${model.pricing.prompt || "?"} prompt / ${model.pricing.completion || "?"} completion` : "Free/paid status varies"}</p></div>)}</div>{ping && <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300"><Check className="mt-0.5 h-4 w-4" /> {ping.text} · {ping.latency} ms latency</div>}</div>}</div>;
};
export default ApiTester;
