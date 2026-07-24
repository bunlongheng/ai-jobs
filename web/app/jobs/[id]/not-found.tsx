import Link from "next/link";
export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#f6f8fa] flex items-center justify-center p-6">
      <div className="bg-white border border-gray-300 rounded-xl p-8 text-center">
        <div className="text-lg font-bold mb-1">Application not found</div>
        <p className="text-sm text-gray-500 mb-4">No job with that id in the tracker.</p>
        <Link href="/jobs" className="text-blue-700 text-sm">&larr; back to board</Link>
      </div>
    </main>
  );
}
