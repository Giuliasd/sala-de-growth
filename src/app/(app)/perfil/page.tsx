import type { Metadata } from "next";
import { getCurrentMember } from "@/lib/session";
import { ProfileForm } from "@/components/perfil/ProfileForm";
import { ThemeToggle } from "@/components/perfil/ThemeToggle";
import { Avatar } from "@/components/shared/Avatar";
import { Card } from "@/components/shared/Card";
import { PreferenciasDeNotificacao } from "@/components/perfil/PreferenciasDeNotificacao";
import { lerSilenciadas } from "@/lib/notificacoes-db";


export const metadata: Metadata = {
  title: "Perfil | Sala de Growth",
};

export default async function PerfilPage() {
  const member = await getCurrentMember();
  const silenciadas = await lerSilenciadas(member.id).catch(() => []);

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Meu Perfil
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Edite suas informações pessoais
        </p>
      </div>

      <Card padding="28px">
        {/* Avatar preview */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <Avatar name={member.name} size={72} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Seu ícone é gerado automaticamente a partir do nome
          </p>
        </div>

        <ProfileForm currentName={member.name} currentEmail={member.email} />
      </Card>

      {/* Aparência */}
      <Card padding="28px" className="mt-6">
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Aparência
        </h3>
        <p className="text-sm mt-0.5 mb-4" style={{ color: "var(--text-muted)" }}>
          Escolha o tema da Sala de Growth. &ldquo;Sistema&rdquo; segue a preferência do seu dispositivo.
        </p>
        <ThemeToggle />
      </Card>

      {/* Notificações */}
      <Card padding="28px" className="mt-6">
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Notificações
        </h3>
        <p className="text-sm mt-0.5 mb-4" style={{ color: "var(--text-muted)" }}>
          Escolha quais avisos chegam para você. O que ficar desligado deixa de ser criado.
        </p>
        <PreferenciasDeNotificacao silenciadas={silenciadas} />
      </Card>
    </div>
  );
}
