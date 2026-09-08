import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

// This page is the whole point of §11: it renders per the *logged-in*
// person, not per the link. Every data query that eventually replaces the
// placeholder below MUST filter by this session's email (resolved to a
// staff_id server-side) — never pass staff_id in from the client, and never
// fetch "everyone's rows then hide some in the UI." Hiding in the UI is not
// the security boundary; the WHERE clause is.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  return (
    <div className="flex-1 p-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {session.user.name}</h1>
          <p className="text-sm opacity-60">{session.user.email}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="text-sm border border-black/15 dark:border-white/20 rounded-md px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            Sign out
          </button>
        </form>
      </div>

      <div className="border border-black/10 dark:border-white/15 rounded-xl p-6">
        <p className="text-sm opacity-70">
          This is where your personal inbox / Drive / calendar summary will
          render — scoped server-side to <strong>{session.user.email}</strong>{" "}
          only, via a Postgres query on <code>staff_id</code> (see{" "}
          <code>schema.sql</code>). Not wired up yet — this scaffold proves
          the login and per-viewer identity work; the data queries are the
          next piece to build.
        </p>
      </div>
    </div>
  );
}
