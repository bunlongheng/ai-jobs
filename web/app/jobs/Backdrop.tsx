// Fixed animated backdrop behind the whole view - a soft drifting aurora (two blurred gradient
// layers that morph on different timings, no texture). AI (blue/cyan) vs Recruiter (teal/violet)
// so you know at a glance which view you're on. Pure CSS (globals.css), honours
// prefers-reduced-motion. (owner request 2026-08-10; retextured to aurora 2026-08-17)
export default function Backdrop({ variant }: { variant: "ai" | "rec" }) {
  return <div aria-hidden className={`backdrop ${variant === "ai" ? "backdrop-ai" : "backdrop-rec"}`} />;
}
