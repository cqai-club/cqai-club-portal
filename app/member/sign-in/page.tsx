import { Button } from "@/components/ui/button";
import Link from "next/link";
import { signIn, logtoConfig, isLogtoConfigured } from "@/lib/logto";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  async function handleSignIn() {
    "use server";
    // @logto/next's signIn() defaults to `${baseUrl}/callback`, but the
    // callback route lives under the /member surface. Pass the explicit
    // redirect URI so it matches the Logto console registration
    // (http://localhost:3000/member/callback or https://cqaiclub.asia/member/callback).
    await signIn(`${logtoConfig.baseUrl}/callback`);
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <form action={handleSignIn}>
        <Button type="submit" className="w-full">
          登录中，点击继续
        </Button>
      </form>
    </div>
  );
}
