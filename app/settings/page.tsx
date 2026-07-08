import { UserCog, Gauge, FileText, FolderOpen, FileUser } from "lucide-react";
import GmailConnect from "@/components/GmailConnect";
import ProfilePanel from "@/components/ProfilePanel";
import LevelingRefEditor from "@/components/settings/LevelingRefEditor";
import CandidateProfilePanel from "@/components/settings/CandidateProfilePanel";
import ResumeUpload from "@/components/settings/ResumeUpload";
import AssetBrowser from "@/components/settings/AssetBrowser";
import SettingsCard from "@/components/settings/SettingsCard";

export const dynamic = "force-dynamic";

// One place to configure everything: connections, the candidate profile + leveling the playbooks
// read, the base résumé, and a read-only view of the asset folder.
export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Settings</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Connections, your candidate profile, résumé, and the asset folder.</p>
        </header>

        <div className="space-y-5">
          <GmailConnect />

          <SettingsCard
            icon={<UserCog size={17} />}
            accent="emerald"
            title="Search profile"
            description="Level baseline, disciplines, and locations — what CoWork treats as a fit (read via getContext)."
          >
            <ProfilePanel />
          </SettingsCard>

          <SettingsCard
            icon={<Gauge size={17} />}
            accent="sky"
            title="Leveling reference"
            description="The anchor ladder every company is matched against. Changing it re-draws the level popover instantly."
          >
            <LevelingRefEditor />
          </SettingsCard>

          <SettingsCard
            icon={<FileUser size={17} />}
            accent="emerald"
            title="Candidate profile"
            description="The résumé prose the fit & leveling playbooks judge against, seeded from your base résumé."
          >
            <CandidateProfilePanel />
          </SettingsCard>

          <SettingsCard
            icon={<FileText size={17} />}
            accent="violet"
            title="Base résumé"
            description="The .docx tailoring source of truth. Tailored resumes are generated per application by CoWork."
          >
            <ResumeUpload />
          </SettingsCard>

          <SettingsCard
            icon={<FolderOpen size={17} />}
            accent="sky"
            title="Asset folder"
            description="Browse the files the app and agent share. Relocating the folder is an .env change + restart."
          >
            <AssetBrowser />
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
