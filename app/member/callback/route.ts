import { handleSignIn } from "@/lib/logto";
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  console.log(request.nextUrl.toString());
  try {
    await handleSignIn(searchParams);
  } catch (error) { 
    console.log(error);
  }
  redirect('/member/dashboard');
}
