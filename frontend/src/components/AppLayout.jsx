import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import {
  Activity,
  LayoutDashboard,
  Upload as UploadIcon,
  History as HistoryIcon,
  Shield,
  Sun,
  Moon,
  LogOut,
  Stethoscope,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/upload", label: "New Scan", icon: UploadIcon, testid: "nav-upload" },
  { to: "/patients", label: "Patients", icon: Users, testid: "nav-patients" },
  { to: "/history", label: "History", icon: HistoryIcon, testid: "nav-history" },
];

const ADMIN_NAV = { to: "/admin", label: "Admin", icon: Shield, testid: "nav-admin" };

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const items = [...NAV];
  if (user?.role === "admin") items.push(ADMIN_NAV);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const initials = (user?.full_name || user?.email || "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-card flex-col" data-testid="app-sidebar">
        <div className="px-6 py-6 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold tracking-tight text-foreground">MedAI</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Diagnosis Suite</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/"}
              data-testid={it.testid}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <it.icon className="w-4 h-4" />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="w-3.5 h-3.5 text-success" />
            <span>AI service: <span className="text-success font-medium">online</span></span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30 flex items-center px-4 md:px-8 justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {pageTitle(location.pathname)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              data-testid="theme-toggle"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
                  data-testid="user-menu-trigger"
                >
                  <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold">
                    {initials}
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="text-sm font-medium leading-tight">{user?.full_name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{user?.role}</div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">
                  <div className="font-medium">{user?.email}</div>
                  <div className="text-muted-foreground">{user?.specialty || "—"}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="logout-button" className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex justify-around py-2">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/"}
              data-testid={`${it.testid}-mobile`}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-3 py-1 text-[11px]",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <it.icon className="w-5 h-5" />
              {it.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-x-hidden pb-20 md:pb-0" data-testid="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function pageTitle(pathname) {
  if (pathname === "/") return "Overview";
  if (pathname.startsWith("/upload")) return "New Scan";
  if (pathname === "/patients") return "Patients";
  if (pathname.startsWith("/patients/")) return "Patient Timeline";
  if (pathname.startsWith("/history")) return "Patient History";
  if (pathname.startsWith("/scans")) return "Scan Detail";
  if (pathname.startsWith("/admin")) return "Administration";
  return "";
}
