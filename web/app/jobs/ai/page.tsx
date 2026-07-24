import { aiAbleReady } from "@/lib/queries";
import { getLogo } from "@/lib/logos";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Logo({ uri }: { uri: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={uri} alt="" width={24} height={24} className="rounded object-contain" />;
}

export default function AiList() {
  const rows = aiAbleReady();
  return (
    <main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
      <div className="max-w-[900px] mx-auto px-5 py-7 pb-16">
        <Link href="/jobs" className="text-xs text-blue-700 no-underline">&larr; board</Link>
        <h1 className="text-2xl font-bold text-blue-700 mt-2 mb-1">AI-able - ready to fire</h1>
        <p className="text-[13px] text-gray-500 mb-4">{rows.length} clean single-page forms JobFill can drive end to end.</p>
        {rows.length === 0 ? <div className="bg-white border border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">None right now.</div> : null}
        <div className="grid gap-2.5">
          {rows.map((r) => {
            const uri = getLogo(r.company);
            return (
              <div key={r.id} className="bg-white border border-gray-300 rounded-xl px-4 py-3 flex items-center gap-3">
                {uri ? <Logo uri={uri} /> : <span className="w-6 h-6 rounded bg-gray-100" />}
                <div className="flex-1 min-w-0">
                  <Link href={`/jobs/${r.id}`} className="font-semibold text-[#1f2328] no-underline hover:text-blue-700">{r.company}</Link>
                  <div className="text-xs text-gray-500 truncate">{r.title}</div>
                </div>
                {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-white bg-green-700 px-3 py-1.5 rounded-lg no-underline">Apply</a> : null}
                <span className="text-blue-700 font-bold text-sm w-8 text-right">{r.score}</span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
