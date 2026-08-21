import Board from "./jobs/page";

// Root renders the board directly - so http://localhost:3017 IS the jobs board (no /jobs suffix,
// no redirect). The /jobs/* routes still exist for the detail/settings sub-pages. (owner 2026-08-18)
export const dynamic = "force-dynamic";

export default function Home(props: { searchParams: Promise<{ min?: string }> }) {
  return <Board {...props} />;
}
