"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) router.push(params.get("next") || "/jobs");
    else setErr("Wrong password");
  }

  return (
    <main className="min-h-screen bg-[#f6f8fa] flex items-center justify-center p-6">
      <form onSubmit={submit} className="bg-white border border-gray-300 rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-blue-700 mb-1">Jobs</h1>
        <p className="text-sm text-gray-500 mb-5">This app holds personal data. Enter your password.</p>
        <input
          type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus
          placeholder="Password" aria-label="Password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-blue-500"
        />
        {err ? <div className="text-sm text-red-600 mb-3">{err}</div> : null}
        <button type="submit" className="w-full bg-blue-700 text-white font-semibold text-sm py-2 rounded-lg">Unlock</button>
      </form>
    </main>
  );
}

export default function Login() {
  return <Suspense><LoginForm /></Suspense>;
}
