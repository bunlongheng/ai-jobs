"use client";

// Error boundary for the /jobs subtree - any server-render failure shows this instead of Next's
// default gray screen. Styled to match the board, with a retry. (a11y/UX 2026-08-14)
export default function JobsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-[#f6f8fa] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl shadow-sm px-6 py-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" /></svg>
        </div>
        <h1 className="text-lg font-bold text-[#1f2328] mb-1">Something went wrong</h1>
        <p className="text-[13px] text-gray-500 mb-5">The board hit an unexpected error while rendering. Your data is safe - this is just the view.</p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={reset} className="text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2">Try again</button>
          <a href="/jobs" className="text-[13px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-4 py-2 no-underline">Back to board</a>
        </div>
        {error?.digest ? <p className="text-[11px] text-gray-300 mt-4">ref {error.digest}</p> : null}
      </div>
    </main>
  );
}
