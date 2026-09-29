"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslations();
  const { data: runtimeConfig, loading: configLoading } = usePublicConfig();
  const [mounted, setMounted] = useState(false);

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

  // 避免水合不匹配
  useEffect(() => {
    setMounted(true);
  }, []);

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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("settings.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
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
              variant="outline"
              onClick={() => setTheme("light")}
              aria-pressed={mounted && theme === "light"}
              className={cn("h-auto min-h-16 justify-start gap-3 py-4", mounted && theme === "light" && "border-primary bg-primary/5 text-primary")}
            >
              <Sun className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium">{t("settings.themeLight")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.themeLightDesc")}</p>
              </div>
            </Button>
            <Button
              variant="outline"
              onClick={() => setTheme("dark")}
              aria-pressed={mounted && theme === "dark"}
              className={cn("h-auto min-h-16 justify-start gap-3 py-4", mounted && theme === "dark" && "border-primary bg-primary/5 text-primary")}
            >
              <Moon className="h-5 w-5" />
              <div className="text-left">
                <p className="font-medium">{t("settings.themeDark")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.themeDarkDesc")}</p>
              </div>
            </Button>
            <Button
              variant="outline"
              onClick={() => setTheme("system")}
              aria-pressed={mounted && theme === "system"}
              className={cn("h-auto min-h-16 justify-start gap-3 py-4", mounted && theme === "system" && "border-primary bg-primary/5 text-primary")}
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                className="min-h-11 sm:shrink-0"
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
