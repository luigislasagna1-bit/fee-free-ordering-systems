"use client";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChefHat, Loader2, Monitor, LayoutDashboard } from "lucide-react";
import toast from "react-hot-toast";

function KitchenLoginForm() {
  const router = useRouter();
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
      toast.success("Welcome to the Kitchen Display!");
      setTimeout(() => router.push("/kitchen"), 400);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4 shadow-lg shadow-orange-500/30">
            <ChefHat className="w-9 h-9 text-white" />
          </div>
          <div className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 text-orange-400 font-semibold px-4 py-1.5 rounded-full text-sm mb-3">
            <Monitor className="w-4 h-4" /> Kitchen Display System
          </div>
          <h1 className="text-3xl font-bold text-white">Kitchen Display</h1>
          <p className="text-gray-400 text-sm mt-1">Sign in to view and manage incoming orders</p>
        </div>

        {/* Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500 transition"
                placeholder="you@restaurant.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500 transition"
                placeholder="Your password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl hover:bg-orange-600 transition flex items-center justify-center gap-2 disabled:opacity-50 mt-2 text-base"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? "Signing in..." : "Open Kitchen Display"}
            </button>
          </form>

          <div className="mt-5 p-4 bg-gray-700/50 rounded-xl border border-gray-600 text-sm text-gray-400">
            <div className="font-semibold mb-1.5 text-gray-300">Demo credentials</div>
            <div className="space-y-0.5">
              <div><span className="text-gray-500">Restaurant Admin:</span> owner@pizzapalace.com / restaurant123</div>
              <div><span className="text-gray-500">Kitchen Staff:</span> kitchen@pizzapalace.com / kitchen123</div>
            </div>
          </div>
        </div>

        <div className="mt-5 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Admin Panel login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function KitchenLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    }>
      <KitchenLoginForm />
    </Suspense>
  );
}
