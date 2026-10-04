import { Button } from "@/components/ui/button";
import Link from "next/link";
import { signIn, logtoConfig, isLogtoConfigured } from "@/lib/logto";
import { normalizeMemberReturnTo } from "@/lib/member/return-to";
import { normalizeMemberLoginError } from "@/lib/member/login-error";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = normalizeMemberReturnTo(params.returnTo);
  const reason = normalizeMemberLoginError(params.error);
  const loginError = reason === "authorization-failed"
    ? "认证服务未接受本次登录请求，请重新发起登录。"
    : reason === "invalid-session"
      ? "登录会话已失效或与回调不匹配，请重新发起登录。"
      : null;
  async function handleSignIn() {
    "use server";
    // @logto/next's signIn() defaults to `${baseUrl}/callback`, but the
    // callback route lives under the /member surface. Pass the explicit
    // redirect URI so it matches the Logto console registration
    // (http://localhost:3000/member/callback or https://cqaiclub.asia/member/callback).
    await signIn(`${logtoConfig.baseUrl}/callback`, returnTo);
  }

  if (!isLogtoConfigured()) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="text-2xl font-semibold">登录暂不可用</h1>
        <p className="text-muted-foreground">当前预览环境尚未连接会员登录服务。</p>
        <Link href="/events/" className="text-primary underline">返回活动交流</Link>
      </main>
    );
  }

  return (
    <div className="member-center flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
      <form action={handleSignIn} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold">登录会员中心</h1>
        {loginError ? (
          <div role="alert" className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <h2 className="font-medium">登录未完成</h2>
            <p className="text-sm leading-6 text-muted-foreground">{loginError}</p>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">登录后继续访问会员中心。</p>
        )}
        <Button type="submit" className="min-h-11 w-full rounded-lg">
          {loginError ? "重新登录" : "登录会员中心"}
        </Button>
        <Link href="/" className="flex min-h-11 items-center justify-center rounded-lg text-sm text-muted-foreground underline-offset-4 hover:underline">返回首页</Link>
      </form>
    </div>
  );
}
