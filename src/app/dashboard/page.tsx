import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { staffAccessForEmail, BOARDS, canAccessBoard } from "@/lib/access";

// The Control Room hub — lands here right after login, shows one tile per
// board this specific person has access to. Which tiles appear is driven
// entirely by staffAccessForEmail (server-resolved from the session email,
// never from anything client-supplied); the per-board pages under
// /dashboard/[board] re-check access themselves too, so a hidden tile is
// not the only thing standing between someone and a board they shouldn't see.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const access = await staffAccessForEmail(session.user.email);
  const visibleBoards = BOARDS.filter((b) => canAccessBoard(access, b.key));

  return (
    <div className="flex-1 p-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Image
            src="/psl-logo-black.svg"
            alt="ProVelo Super League"
            width={56}
            height={31}
            className="dark:hidden"
          />
          <Image
            src="/psl-logo-white.svg"
            alt="ProVelo Super League"
            width={56}
            height={31}
            className="hidden dark:block"
          />
          <div>
            <h1 className="text-xl font-semibold">PSL Control Room</h1>
            <p className="text-sm opacity-60">
              {session.user.name} · {session.user.email}
            </p>
          </div>
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

      {!access ? (
        <div className="border border-black/10 dark:border-white/15 rounded-xl p-6">
          <p className="text-sm opacity-70">
            Your account isn&apos;t set up as PSL staff yet — ask Matt or
            Aaron to add you to the staff list.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {visibleBoards.map((b) => (
            <Link
              key={b.key}
              href={`/dashboard/${b.slug}`}
              className="group border border-black/10 dark:border-white/15 rounded-xl p-6 hover:border-[#00FF8A] hover:shadow-[0_0_0_1px_#00FF8A] transition"
            >
              <h2 className="font-medium group-hover:text-[#00b366] dark:group-hover:text-[#00FF8A]">
                {b.label}
              </h2>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
