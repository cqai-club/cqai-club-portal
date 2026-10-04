import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Shield,
  Users,
  Files,
  Store,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Crown,
  Settings2,
} from "lucide-react";
import { t, type Language } from "@/lib/i18n";

export interface NavItem {
  href: string;
  title: string;
  titleKey: string;
  icon: LucideIcon;
  external?: boolean;
  innovationMemberOnly?: boolean;
}

export const mainNavItems: NavItem[] = [
  {
    href: "/member/dashboard",
    title: "概览",
    titleKey: "nav.dashboard",
    icon: LayoutDashboard,
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
  {
    href: "/member/dashboard/plans",
    title: "会员类型",
    titleKey: "nav.plans",
    icon: Crown,
  },
  {
    href: "/member/dashboard/resources",
    title: "资料中心",
    titleKey: "nav.resources",
    icon: Files,
  },
  {
    href: "/member/dashboard/project-submission",
    title: "项目征集",
    titleKey: "nav.projectSubmission",
    icon: BriefcaseBusiness,
  },
];

export const adminNavItems: NavItem[] = [
  {
    href: "/member/dashboard/admin/member-settings",
    title: "会员设置",
    titleKey: "nav.adminMemberSettings",
    icon: Settings2,
  },
  {
    href: "/member/dashboard/admin/resources",
    title: "资料管理",
    titleKey: "nav.adminResources",
    icon: Files,
  },
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
    title: "项目征集",
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
  {
    href: "https://auth-admin.cqaiclub.asia/",
    title: "Logto 管理后台",
    titleKey: "nav.adminLogto",
    icon: Shield,
    external: true,
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

export function getVisibleMainNavItems(canAccessInnovationMember: boolean): NavItem[] {
  return mainNavItems.filter(item => !item.innovationMemberOnly || canAccessInnovationMember);
}
