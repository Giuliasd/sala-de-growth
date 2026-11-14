import { getPlaybookLinks, getPlaybookSections } from "@/actions/playbook";
import { PlaybookList } from "@/components/configuracoes/PlaybookList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Configurações: Playbook | Sala de Growth",
};

export default async function ConfiguracoesPlaybookPage() {
  const [links, sections] = await Promise.all([
    getPlaybookLinks(),
    getPlaybookSections(),
  ]);

  return (
    <div className="animate-in fade-in duration-500">
      <PlaybookList links={links} sections={sections} />
    </div>
  );
}
