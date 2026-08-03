import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const alt = "Jobs - the full job-hunt pipeline";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The full pipeline, every step, shown when the Jobs link is shared.
const STEPS: [string, string][] = [
  ["Scan", "LinkedIn, Indeed and Hacker News, every day"],
  ["Score", "auto-ranked against your profile, 50+ only"],
  ["Tailor", "staff-level resume and cover written per job"],
  ["Pre-test", "ATS forms filled, screening answers ready"],
  ["Apply", "one tap, the browser extension autofills"],
  ["Track", "status pipeline, marked applied automatically"],
  ["Archive", "expired and rejected fall off the board"],
];

export default function OpengraphImage() {
  const icon =
    "data:image/png;base64," +
    fs.readFileSync(path.join(process.cwd(), "public/icon.png")).toString("base64");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg,#0b3d2e 0%,#14532d 45%,#166534 100%)",
          color: "#ffffff",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 34 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} width={96} height={96} style={{ borderRadius: 22 }} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1 }}>Jobs</div>
            <div style={{ fontSize: 25, color: "#bbf7d0", marginTop: 6 }}>
              the full job-hunt pipeline, end to end
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {STEPS.map(([label, desc], i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: "#22c55e",
                  color: "#052e16",
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <div style={{ fontSize: 30, fontWeight: 700, width: 150 }}>{label}</div>
                <div style={{ fontSize: 24, color: "#d1fae5" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
