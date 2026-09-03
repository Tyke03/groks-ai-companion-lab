import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import Documentation from "./pages/Documentation";
import PlatformDocs from "./pages/PlatformDocs";
import Tools from "./pages/Tools";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Community from "./pages/Community";
import NotFound from "./pages/NotFound";
import Compare from "./pages/Compare";
import Updates from "./pages/Updates";
import LorebookBuilder from "./pages/LorebookBuilder";
import PersonaBuilder from "./pages/PersonaBuilder";
import ApiTester from "./pages/ApiTester";
import Prompts from "./pages/Prompts";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/docs" element={<Documentation />} />
            <Route path="/docs/:slug" element={<PlatformDocs />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/tools/lorebook-builder" element={<LorebookBuilder />} />
            <Route path="/tools/persona-builder" element={<PersonaBuilder />} />
            <Route path="/tools/api-tester" element={<ApiTester />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/updates" element={<Updates />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:id" element={<BlogPost />} />
            <Route path="/community" element={<Community />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
