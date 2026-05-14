"use client";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Loader2, ChefHat } from "lucide-react";
import toast from "react-hot-toast";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (result?.error) throw new Error("Invalid email or password");
      toast.success("Logged in!");
      setTimeout(() => router.push("/admin"), 400);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-orange-500 font-bold text-xl mb-5">
            <ChefHat className="w-7 h-7" /> Fee Free Ordering
          </Link>
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 font-semibold px-4 py-1.5 rounded-full text-sm mb-4">
            <LayoutDashboard className="w-4 h-4" /> Admin Panel
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign in to your account</h1>
          <p className="text-gray-500 text-sm mt-1">Manage orders, menu, customers & more</p>
          {params.get("registered") && (
            <div className="mt-3 bg-green-50 text-green-700 text-sm p-3 rounded-lg border border-green-200">
              Account created! Please sign in.
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
              placeholder="you@restaurant.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
              placeholder="Your password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {loading ? "Signing in..." : "Sign In to Admin Panel"}
          </button>
        </form>

        <div className="mt-5 p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-600">
          <div className="font-semibold mb-1.5 text-gray-700">Demo credentials</div>
          <div className="space-y-0.5">
            <div><span className="text-gray-500">Restaurant Admin:</span> owner@pizzapalace.com / restaurant123</div>
            <div><span className="text-gray-500">Superadmin:</span> admin@feefreeordering.com / admin123</div>
          </div>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-5 text-center space-y-3">
          <p className="text-gray-500 text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-orange-500 font-medium hover:underline">Start free trial</Link>
          </p>
          <div className="flex items-center justify-center gap-1.5 text-sm text-gray-400">
            <span>Looking for the</span>
            <Link
              href="/kitchen/login"
              className="inline-flex items-center gap-1 text-gray-600 font-medium hover:text-orange-500 transition underline underline-offset-2"
            >
              Kitchen Display login?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
