import { listVersions, getVersion, defaultContent } from "@/lib/resumes";
import ResumeStudio from "./ResumeStudio";

export const dynamic = "force-dynamic";

export default function ResumePage() {
  const versions = listVersions();
  const selId = versions.find((v) => v.kind === "resume" && v.is_master)?.id || versions[0]?.id || null;
  const selected = selId ? getVersion(selId) ?? null : null;
  const defaults = { resume: defaultContent("resume"), cover: defaultContent("cover") };

  return (
    <main className="h-[100dvh] flex flex-col bg-[#f6f8fa] text-[#1f2328] overflow-hidden">
      <ResumeStudio versions={versions} selected={selected} defaults={defaults} />
    </main>
  );
}
