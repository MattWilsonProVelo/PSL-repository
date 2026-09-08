export { auth as proxy } from "@/auth";

export const config = {
  // Everything except the login page, the NextAuth API routes, and static
  // assets requires a signed-in @provelosuperleague.com session.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
