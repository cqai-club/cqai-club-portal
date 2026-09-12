"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

export default function SocialConnectPage({
  params,
}: {
  params: Promise<{ target: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { target } = use(params);

  useEffect(() => {
    let active = true;

    const startBinding = async () => {
      try {
        const res = await fetch("/member/api/account/identities/social/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || "社交账号绑定初始化失败");
        }

        if (!active) return;

        if (!data.authorizationUri) {
          throw new Error("未获取到授权地址");
        }

        window.location.href = data.authorizationUri;
      } catch (error) {
        if (!active) return;

        toast({
          variant: "destructive",
          title: "绑定失败",
          description: error instanceof Error ? error.message : "未知错误",
        });

        router.replace("/member/dashboard/connections");
      }
    };

    startBinding();

    return () => {
      active = false;
    };
  }, [target, router, toast]);

  return (
    <div className="flex items-center justify-center min-h-[320px]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">正在跳转到社交平台授权...</p>
      </div>
    </div>
  );
}
