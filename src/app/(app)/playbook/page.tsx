import type { Metadata } from "next";
import { PlaybookClient } from "./PlaybookClient";
import { getPlaybookLinks, getPlaybookSections } from "@/actions/playbook";

export const metadata: Metadata = {
  title: "Playbook & Links Úteis | Sala de Growth",
  description: "Repositório de links e ferramentas essenciais para o time de Growth.",
};

export default async function PlaybookPage() {
  const [links, sections] = await Promise.all([
    getPlaybookLinks(),
    getPlaybookSections(),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-ink">
          Playbook & Links Úteis
        </h1>
        <p className="text-ink-soft">
          Acesso rápido às principais ferramentas e documentos do time de Growth.
        </p>
      </div>

      <PlaybookClient initialLinks={links} sections={sections} />
    </div>
  );
}
