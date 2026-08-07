// How winnable a COLD application realistically is - so daily effort goes where it converts.
// Reach = Staff/Principal at the most flooded, famous companies (apply, but the real path is
// a referral). Target = Senior/Staff at less-saturated companies (best cold odds). Near-home =
// local, prioritize regardless. (owner request 2026-08-06 - "right altitude")
const HOT = /\b(coinbase|airbnb|stripe|anthropic|openai|databricks|samsara|reddit|dropbox|gemini|instacart|nike|disney|gitlab|github|replit|gusto|affirm|mercury|robinhood|doordash|uber|lyft|meta|facebook|google|amazon|apple|netflix|microsoft|twilio|snowflake|notion|figma|ramp|brex|plaid|nvidia|linkedin|pinterest|snap|block|datadog|cloudflare|vercel|hashicorp|confluent|mongodb|elastic|scale ai|rippling|carta|chime)\b/i;

export type Altitude = "near-home" | "target" | "reach";

export function altitude(company: string | null, title: string | null, isNearHome: boolean): Altitude {
  if (isNearHome) return "near-home";
  const staff = /staff|principal|\blead\b|distinguished/i.test(title || "");
  if (staff && HOT.test(company || "")) return "reach";
  return "target";
}

export const ALT_META: Record<Altitude, { label: string; cls: string; hint: string }> = {
  "near-home": { label: "Near-home", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", hint: "Local - prioritize" },
  target: { label: "Target", cls: "bg-blue-50 text-blue-700 border-blue-200", hint: "Best cold odds - less-saturated company" },
  reach: { label: "Reach", cls: "bg-amber-50 text-amber-700 border-amber-200", hint: "Staff role at a flooded company - a referral is the real path in" },
};
