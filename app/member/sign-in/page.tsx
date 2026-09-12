import { Button } from "@/components/ui/button";
import { signIn, logtoConfig } from "@/lib/logto";

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
