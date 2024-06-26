import { NextResponse } from "next/server";
import { createClient } from "@/server/sb/server";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const supabase = createClient();

  await supabase.auth.signOut();

  return NextResponse.redirect(`${origin}/auth/login`);
}
