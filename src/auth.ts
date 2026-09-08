import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// The one setting that makes this "PSL staff only" rather than "anyone with a
// Google account": Google's ID token includes a `hd` (hosted domain) claim
// when the account belongs to a Google Workspace domain. We check it twice —
// once in `signIn` (blocks the sign-in outright) and again by trusting only
// `session.user.email` ending in this domain anywhere we read staff data —
// belt and braces, since a signIn check alone can be bypassed by bugs
// elsewhere, but a check that never runs is worse than one that runs twice.
const ALLOWED_DOMAIN = "provelosuperleague.com";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // These two env vars come from a Google Cloud OAuth client (NOT the
      // service account from §8 — this is a separate, ordinary "Web
      // application" OAuth client, created the same way any app with
      // "Sign in with Google" does it). Set them in Vercel's Environment
      // Variables once deployed; for local dev, put them in .env.local
      // (already gitignored by create-next-app).
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Nudges Google's account chooser toward Workspace accounts on
          // this domain; it is a UX hint only, NOT a security boundary —
          // the real enforcement is the signIn callback below.
          hd: ALLOWED_DOMAIN,
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email ?? "";
      return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
    },
    async session({ session }) {
      // Nothing else to attach yet — staff_id gets resolved server-side,
      // per-request, from session.user.email against the `staff` table
      // (§2), rather than trusted from anything set at login time.
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
