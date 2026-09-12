"use server";

import { signOut } from "@/lib/logto";

export async function signOutAction() {
  await signOut();
}
