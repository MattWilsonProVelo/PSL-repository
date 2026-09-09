import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { staffAccessForEmail, BOARDS, canAccessBoard } from "@/lib/access";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ board: string }>;
}) {
  const { board: slug } = await params;

  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const boardDef = BOARDS.find((b) => b.slug === slug);
  if (!boardDef) notFound();

  const access = await staffAccessForEmail(session.user.email);
  if (!canAccessBoard(access, boardDef.key)) {
    // Same 404 whether the slug is bogus or you're just not allowed to see
    // it — Finances in particular should read as "doesn't exist" for
    // anyone without finance_access, not as a visible-but-blocked page.
    notFound();
  }

  return (
    <div className="flex-1 p-8 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm opacity-60 hover:opacity-100">
          ← Control Room
        </Link>
      </div>
      <h1 className="text-xl font-semibold mb-6">{boardDef.label}</h1>
      <div className="border border-black/10 dark:border-white/15 rounded-xl p-6">
        <p className="text-sm opacity-70">
          This board&apos;s real view is still being built — currently a
          placeholder confirming access control works end to end for{" "}
          <strong>{boardDef.label}</strong>.
        </p>
      </div>
    </div>
  );
}
