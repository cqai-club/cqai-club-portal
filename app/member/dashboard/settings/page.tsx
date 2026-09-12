"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Moon,
  Sun,
  Monitor,
  Globe,
  Trash2,
  TriangleAlert,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import type { FeaturesConfig } from "@/config/types";
import { isFeatureEnabled as isFeatureEnabledFromConfig } from "@/lib/config/feature-helpers";
import { usePublicConfig } from "@/hooks/use-public-config";
import { signOutAction } from "@/app/member/actions/auth";
import { normalizeLocale } from "@/lib/i18n";
import { useTranslations } from "@/lib/i18n/client";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { t, language: i18nLanguage, setLanguage: setI18nLanguage } = useTranslations();
  const { data: runtimeConfig, loading: configLoading } = usePublicConfig();
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState(i18nLanguage === "en" ? "en" : "zh-CN");
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);

  // 账户删除状态
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    confirmation: "",
    deleting: false,
  });

  const runtimeFeatures = runtimeConfig?.features;

  const isFeatureEnabled = useCallback(
    (featureKey: keyof FeaturesConfig, subFeatureKey?: string): boolean => {
      if (!runtimeFeatures) {
        return false;
      }

      return isFeatureEnabledFromConfig(runtimeFeatures, featureKey, subFeatureKey);
    },
    [runtimeFeatures]
  );

  // 避免水合不匹配，并同步 i18n 语言状态
  useEffect(() => {
    setMounted(true);
    setLanguage(i18nLanguage === "en" ? "en" : "zh-CN");
  }, [i18nLanguage]);

  // 处理语言切换 - 同时保存到 localStorage 和 OIDC profile
  const handleLanguageChange = useCallback(async (value: string) => {
    const nextLanguage = normalizeLocale(value);
    setI18nLanguage(nextLanguage);
    setLanguage(value);
    setIsUpdatingLanguage(true);

    try {
      // 调用 API 更新到 OIDC profile 的 locale 字段
      const res = await fetch("/member/api/account/profile/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: value }),
      });

      if (!res.ok) {
        throw new Error("Failed to update language");
      }

      toast({
        title: t("settings.languageUpdatedTitle"),
        description: t("settings.languageUpdatedDesc"),
      });
    } catch {
      // 即使 API 调用失败，localStorage 中的设置仍然保留
      toast({
        title: t("settings.languageUpdatedTitle"),
        description: t("settings.languageUpdatedLocalDesc"),
      });
    } finally {
      setIsUpdatingLanguage(false);
    }
  }, [setI18nLanguage, t, toast]);

  // 处理账户删除
  const handleDeleteAccount = async () => {
    if (deleteDialog.confirmation !== "DELETE") {
      toast({
        variant: "destructive",
        title: t("settings.deleteWrongTextTitle"),
        description: t("settings.deleteWrongTextDesc"),
      });
      return;
    }

    setDeleteDialog((prev) => ({ ...prev, deleting: true }));

    try {
      const res = await fetch("/member/api/account/delete", {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "删除失败");
      }

      toast({
        title: t("settings.deleteSuccessTitle"),
        description: t("settings.deleteSuccessDesc"),
      });

      // 删除后立即登出并离开 dashboard
      try {
        await signOutAction();
      } catch {
        router.replace("/");
        router.refresh();
      }
    } catch (error) {
      console.error("Account deletion error:", error);
      setDeleteDialog((prev) => ({ ...prev, deleting: false }));

      toast({
        variant: "destructive",
        title: t("settings.deleteFailTitle"),
        description: error instanceof Error ? error.message : t("settings.deleteFailDesc"),
      });
    }
  };

  if (configLoading && !runtimeConfig) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">
          {t("settings.description")}
        </p>
      </div>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t("settings.appearanceTitle")}</CardTitle>
          </div>
          <CardDescription>
            {t("settings.appearanceDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Button
              variant={mounted && theme === "light" ? "default" : "outline"}
              onClick={() => setTheme("light")}
              className="justify-start gap-3 h-auto py-4"
            >
              <Sun className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium">{t("settings.themeLight")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.themeLightDesc")}</p>
              </div>
            </Button>
            <Button
              variant={mounted && theme === "dark" ? "default" : "outline"}
              onClick={() => setTheme("dark")}
              className="justify-start gap-3 h-auto py-4"
            >
              <Moon className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium">{t("settings.themeDark")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.themeDarkDesc")}</p>
              </div>
            </Button>
            <Button
              variant={mounted && theme === "system" ? "default" : "outline"}
              onClick={() => setTheme("system")}
              className="justify-start gap-3 h-auto py-4"
            >
              <Monitor className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium">{t("settings.themeSystem")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.themeSystemDesc")}</p>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Language Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t("settings.languageTitle")}</CardTitle>
          </div>
          <CardDescription>
            {t("settings.languageDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:max-w-xs">
            <Label>{t("settings.interfaceLanguage")}</Label>
            <Select value={language} onValueChange={handleLanguageChange} disabled={isUpdatingLanguage}>
              <SelectTrigger>
                <SelectValue placeholder={t("settings.languagePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN">简体中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isUpdatingLanguage ? t("settings.languageSaving") : t("settings.languageSynced")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone - 危险操作区 */}
      {isFeatureEnabled("accountDeletion") && (
        <Card className="border-destructive/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">{t("settings.dangerZone")}</CardTitle>
            </div>
            <CardDescription>
              {t("settings.dangerZoneDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trash2 className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">{t("settings.deleteAccount")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.deleteAccountDesc")}
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() =>
                  setDeleteDialog((prev) => ({ ...prev, open: true }))
                }
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("settings.deleteAccount")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Account Confirmation Dialog */}
      {isFeatureEnabled("accountDeletion") && (
        <Dialog
          open={deleteDialog.open}
          onOpenChange={(open) =>
            !deleteDialog.deleting &&
            setDeleteDialog((prev) => ({ ...prev, open, confirmation: "" }))
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("settings.deleteConfirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("settings.deleteConfirmDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>{t("settings.deleteWarningTitle")}</AlertTitle>
                <AlertDescription>
                  {t("settings.deleteWarningDesc")}
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label>{t("common.confirm")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.deleteNeedText")}
                </p>
                <Input
                  placeholder={t("settings.deleteInputPlaceholder")}
                  value={deleteDialog.confirmation}
                  onChange={(e) =>
                    setDeleteDialog((prev) => ({
                      ...prev,
                      confirmation: e.target.value,
                    }))
                  }
                  disabled={deleteDialog.deleting}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={deleteDialog.deleting}
                onClick={() =>
                  setDeleteDialog((prev) => ({
                    ...prev,
                    open: false,
                    confirmation: "",
                  }))
                }
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deleteDialog.deleting}
              >
                {deleteDialog.deleting && (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("settings.deleteConfirmButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
