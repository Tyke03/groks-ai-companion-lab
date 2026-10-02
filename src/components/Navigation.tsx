import { NavLink } from "@/components/NavLink";
import { GlobalSearch } from "@/components/GlobalSearch";
import {
  Sparkles, BookOpen, Wrench, Bell, Scale, PenLine, MessageSquareText, Users, Menu, X, ChevronDown,
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const primaryItems = [
  { to: "/", label: "Discover", icon: Sparkles },
  { to: "/compare", label: "Compare", icon: Scale },
  { to: "/tools", label: "Workbench", icon: Wrench },
  { to: "/docs", label: "Guides", icon: BookOpen },
];

const moreItems = [
  { to: "/prompts", label: "Prompts", icon: MessageSquareText },
  { to: "/blog", label: "Blog", icon: PenLine },
  { to: "/updates", label: "Updates", icon: Bell },
  { to: "/community", label: "Community", icon: Users },
];

const linkClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors";
const activeClass = "text-primary bg-primary/10";

export const Navigation = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-display text-lg font-bold">AI Companion Hub</span>
        </NavLink>

        <div className="hidden md:flex items-center gap-1 min-w-0">
          <GlobalSearch />
          {primaryItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={linkClass}
              activeClassName={activeClass}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={linkClass}
                aria-label="More navigation"
              >
                More
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              {moreItems.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <NavLink
                    to={item.to}
                    className="flex cursor-pointer items-center gap-2"
                    activeClassName="text-primary"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="md:hidden">
          <GlobalSearch />
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={`md:hidden border-t border-border bg-background px-4 overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "max-h-[480px] py-2 opacity-100" : "max-h-0 py-0 opacity-0"
        }`}
      >
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={`${linkClass} min-h-[44px]`}
            activeClassName={activeClass}
            onClick={() => setMobileOpen(false)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
        <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          More
        </p>
        {moreItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={`${linkClass} min-h-[44px]`}
            activeClassName={activeClass}
            onClick={() => setMobileOpen(false)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
