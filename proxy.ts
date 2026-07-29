import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRODUCTION_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hhoing-fit-check.vercel.app";
const PRODUCTION_HOST = new URL(PRODUCTION_ORIGIN).host;

function isLocalHost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  if (isLocalHost(host) || host === PRODUCTION_HOST) {
    return NextResponse.next();
  }

  if (host.endsWith(".vercel.app")) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = PRODUCTION_HOST;

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
