import { UserCog, Gauge, FileText } from "lucide-react";
import ProfilePanel from "@/components/ProfilePanel";
import LevelingRefEditor from "@/components/settings/LevelingRefEditor";
import ResumeUpload from "@/components/settings/ResumeUpload";
import SettingsCard from "@/components/settings/SettingsCard";

export const dynamic = "force-dynamic";

// Your candidate identity — who you apply as. The search profile, leveling anchor, and base résumé
// that the agents' fit, leveling, and tailoring read.
export default function ProfilePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Profile</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Who you apply as — the candidate identity the agents&apos; fit, leveling, and tailoring use.</p>
        </header>

        <div className="space-y-5">
          <SettingsCard
            icon={<UserCog size={17} />}
            accent="emerald"
            title="Search profile"
            description="What the agents use to judge fit and to filter which jobs a scan surfaces — your level, disciplines, and locations. Most fields are freeform text, so describe yourself in plain words."
          >
            <ProfilePanel />
          </SettingsCard>

          <SettingsCard
            icon={<Gauge size={17} />}
            accent="sky"
            title="Levels.fyi Reference"
            description="The anchor ladder every company is matched against. Changing it re-draws the level popover instantly."
          >
            <LevelingRefEditor />
          </SettingsCard>

          <SettingsCard
            icon={<FileText size={17} />}
            accent="violet"
            title="Base résumé"
            description="The .docx tailoring source of truth; its text also feeds the candidate profile fit & leveling judge against. Tailored resumes are generated per application by an agent."
          >
            <ResumeUpload />
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
