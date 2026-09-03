import { NavLink } from "@/components/NavLink";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Sparkles, BookOpen, Wrench, Bell, Scale, PenLine, MessageSquareText, Users, Menu, X } from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/", label: "Directory", icon: Sparkles },
  { to: "/compare", label: "Compare", icon: Scale },
  { to: "/docs", label: "Docs", icon: BookOpen },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/updates", label: "Updates", icon: Bell },
  { to: "/blog", label: "Blog", icon: PenLine },
  { to: "/prompts", label: "Prompts", icon: MessageSquareText },
  { to: "/community", label: "Community", icon: Users },
];

export const Navigation = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-display text-lg font-bold">AI Companion Hub</span>
        </NavLink>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          <GlobalSearch />
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              activeClassName="text-primary bg-primary/10"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="sm:hidden">
          <GlobalSearch />
        </div>

        {/* Mobile toggle — min 44x44 touch target */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu with smooth transition */}
      <div
        className={`sm:hidden border-t border-border bg-background px-4 overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "max-h-[400px] py-2 opacity-100" : "max-h-0 py-0 opacity-0"
        }`}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="flex items-center gap-2 rounded-lg px-3 min-h-[44px] text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            activeClassName="text-primary bg-primary/10"
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
