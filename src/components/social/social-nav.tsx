// @ts-nocheck
import { useState } from "react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import {
  Home,
  Search,
  Compass,
  Film,
  MessageCircle,
  PlusSquare,
  Menu,
  Trophy,
  Bookmark,
  Activity as ActivityIcon,
  Users,
  Shield,
  Radio,
  TrendingUp,
  Settings,
  LogOut,
  User as UserIcon,
  LayoutDashboard,
  Circle,
  X,
  Bell,
  ChevronRight,
  Camera,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";

const primary = [
  { name: "Home", href: "/social", icon: Home, exact: true },
  { name: "Search", href: "/search", icon: Search },
  { name: "Explore", href: "/explore", icon: Compass },
  { name: "Flex", href: "/flex", icon: Film },
  { name: "Messages", href: "/messages", icon: MessageCircle },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Create", href: "/create", icon: PlusSquare },
];

const moreItems = [
  { name: "Stories", href: "/stories/", icon: Circle },
  { name: "Trending", href: "/trending", icon: TrendingUp },
  { name: "Live", href: "/live", icon: Radio },
  { name: "Saved", href: "/saved", icon: Bookmark },
  { name: "Squads", href: "/teams", icon: Shield },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
];

function useActive() {
  const location = useLocation();
  return (href: string, exact?: boolean) =>
    exact
      ? location.pathname === href
      : location.pathname === href || location.pathname.startsWith(href + "/");
}

function BrandLink({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link to="/social" className="flex items-center gap-2 group p-2 mb-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
        <Trophy className="h-6 w-6 text-primary drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
      </div>
      {!collapsed && (
        <span className="font-display text-2xl font-bold tracking-tight">
          Game<span className="text-primary text-gradient">Flex</span>
        </span>
      )}
    </Link>
  );
}

function MoreMenu({ collapsed }: { collapsed: boolean }) {
  const { user, profile, logout, isAdmin } = useAuth();
  const isActive = useActive();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-4 w-full rounded-full px-3 py-3 text-base font-medium transition-all outline-none",
          "text-foreground hover:bg-secondary/60",
          collapsed && "justify-center",
        )}
      >
        <Menu className="h-6 w-6 shrink-0 transition-transform group-hover:scale-110" />
        {!collapsed && <span>More</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align={collapsed ? "center" : "start"}
        className="w-64 bg-card border-border/50 p-2 shadow-2xl mb-2 rounded-2xl"
      >
        {user && (
          <>
            <DropdownMenuLabel className="font-normal px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-bold truncate">{profile?.username ?? "User"}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {profile?.email ?? user.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border/50" />
          </>
        )}
        {moreItems.map((it) => (
          <DropdownMenuItem key={it.name} asChild className="rounded-xl cursor-pointer">
            <Link
              to={it.href}
              className={cn("w-full py-2.5", isActive(it.href) && "bg-secondary/80 font-semibold")}
            >
              <it.icon className="mr-3 h-5 w-5 text-muted-foreground" />
              {it.name}
            </Link>
          </DropdownMenuItem>
        ))}
        {isAdmin && (
          <>
            <DropdownMenuSeparator className="bg-border/50" />
            <DropdownMenuItem asChild className="rounded-xl cursor-pointer">
              <Link to="/admin" className="w-full py-2.5">
                <Shield className="mr-3 h-5 w-5 text-primary" /> Admin Panel
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuItem asChild className="rounded-xl cursor-pointer">
          <Link to="/" className="w-full py-2.5">
            <Trophy className="mr-3 h-5 w-5 text-primary" /> Back to GameFlex
          </Link>
        </DropdownMenuItem>
        {user && (
          <DropdownMenuItem
            onClick={logout}
            className="rounded-xl cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive py-2.5"
          >
            <LogOut className="mr-3 h-5 w-5" /> Log out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarItem({ item, collapsed }: any) {
  const isActive = useActive();
  const active = isActive(item.href, item.exact);
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      className={cn(
        "relative flex items-center gap-4 rounded-full px-3 py-3 text-base transition-all group overflow-hidden",
        active ? "font-bold text-foreground" : "font-medium text-foreground hover:bg-secondary/60",
        collapsed && "justify-center",
      )}
    >
      {active && (
        <motion.div layoutId="nav-pill" className="absolute inset-0 bg-secondary/80 z-0" />
      )}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full shadow-[0_0_8px_rgba(34,197,94,0.8)] z-10" />
      )}
      <div className="relative z-10 flex items-center gap-4">
        <Icon
          className={cn(
            "h-6 w-6 shrink-0 transition-transform group-hover:scale-110",
            active && "stroke-[2.5] text-primary",
          )}
        />
        {!collapsed && <span>{item.name}</span>}
      </div>
    </Link>
  );
}

function DesktopSidebar() {
  const { user, profile } = useAuth();
  const isActive = useActive();
  const activeProfile = isActive("/social/profile");

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      // 🚀 CHANGED: "fixed left-0 top-0" converted to "sticky top-0 self-start" to freeze it on page scroll
      className="hidden md:flex sticky top-0 h-screen border-r border-border/30 z-40 self-start
                      w-[72px] xl:w-[245px] flex-col justify-between py-6 px-3
                      bg-background/95 backdrop-blur-2xl"
    >
      <div className="flex flex-col gap-1">
        <div className="hidden xl:block px-2">
          <BrandLink />
        </div>
        <div className="xl:hidden flex justify-center">
          <BrandLink collapsed />
        </div>

        <div className="flex flex-col gap-1 mt-2">
          {primary.map((it) => (
            <div key={it.name} className="xl:block">
              <div className="xl:hidden">
                <SidebarItem item={it} collapsed />
              </div>
              <div className="hidden xl:block">
                <SidebarItem item={it} collapsed={false} />
              </div>
            </div>
          ))}

          {user && (
            <Link
              to="/social/profile"
              className={cn(
                "relative flex items-center gap-4 rounded-full px-3 py-3 text-base transition-all group overflow-hidden mt-1",
                activeProfile ? "font-bold text-foreground" : "font-medium hover:bg-secondary/60",
                "xl:justify-start justify-center",
              )}
            >
              {activeProfile && (
                <motion.div layoutId="nav-pill" className="absolute inset-0 bg-secondary/80 z-0" />
              )}
              {activeProfile && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full shadow-[0_0_8px_rgba(34,197,94,0.8)] z-10" />
              )}
              <div className="relative z-10 flex items-center gap-4">
                <Avatar className="h-6 w-6 border border-border/40">
                  <AvatarImage src={profile?.avatar_url} />
                  <AvatarFallback><UserIcon className="h-4 w-4" /></AvatarFallback>
                </Avatar>
                {!activeProfile && <span className="hidden xl:inline">Profile</span>}
                {activeProfile && <span className="hidden xl:inline font-bold">Profile</span>}
              </div>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-auto">
        <div className="xl:block hidden">
          <MoreMenu collapsed={false} />
        </div>
        <div className="xl:hidden block">
          <MoreMenu collapsed />
        </div>
      </div>
    </motion.aside>
  );
}

export { DesktopSidebar };
