import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  User,
  Shield,
  Users,
  Files,
  Store,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import { t, type Language } from "@/lib/i18n";

export interface NavItem {
  href: string;
  title: string;
  titleKey: string;
  icon: LucideIcon;
}

export const mainNavItems: NavItem[] = [
  {
    href: "/member/dashboard",
    title: "概览",
    titleKey: "nav.dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/member/dashboard/profile",
    title: "个人资料",
    titleKey: "nav.profile",
    icon: User,
  },
  {
    href: "/member/dashboard/security",
    title: "安全设置",
    titleKey: "nav.security",
    icon: Shield,
  },
  {
    href: "/member/dashboard/activities",
    title: "我的活动",
    titleKey: "nav.activities",
    icon: CalendarDays,
  },
];

export const adminNavItems: NavItem[] = [
  {
    href: "/member/dashboard/admin/activities",
    title: "活动管理",
    titleKey: "nav.adminActivities",
    icon: ClipboardList,
  },
  {
    href: "/member/dashboard/admin/members",
    title: "会员申请",
    titleKey: "nav.adminMembers",
    icon: Users,
  },
  {
    href: "/member/dashboard/admin/collections",
    title: "资料征集",
    titleKey: "nav.adminCollections",
    icon: Files,
  },
  {
    href: "/member/dashboard/admin/projects",
    title: "项目广场",
    titleKey: "nav.adminProjects",
    icon: BriefcaseBusiness,
  },
  {
    href: "/member/dashboard/admin/plugins",
    title: "插件市场",
    titleKey: "nav.adminPlugins",
    icon: Store,
  },
];

export function getNavLabel(item: NavItem, language: Language): string {
  return t(item.titleKey, language);
}

export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/member/dashboard") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}
