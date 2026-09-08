import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-sm w-full px-8 py-10 text-center border border-black/10 dark:border-white/15 rounded-xl">
        <h1 className="text-lg font-semibold mb-2">PSL Control Room</h1>
        <p className="text-sm opacity-70 mb-6">
          Sign in with your @provelosuperleague.com Google account.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-[#00FF8A] text-black font-medium py-2.5 hover:opacity-90 transition"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
