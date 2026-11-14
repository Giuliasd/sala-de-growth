import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";

// Sem <SessionProvider>: o app lê sessão só no servidor (`auth()` /
// `getCurrentMember()`), nenhum componente usa `useSession`. O provider ficava
// montado na raiz apenas para buscar /api/auth/session em todo carregamento de
// página e a cada foco de janela — cada chamada rodando o callback jwt, que faz
// SELECT no Postgres. Era tráfego e carga de banco sem nenhum consumidor, na
// exata rota que apaga o cookie de sessão quando o banco falha. Se algum dia um
// componente cliente precisar da sessão, prefira passá-la por prop do servidor.

// Resolve o tema antes da primeira pintura, evitando flash. O valor de cookie
// "system" só é conhecido no cliente (matchMedia), então o SSR renderiza claro e
// este script corrige em seguida — antes do paint, pois roda no <head>.
//
// Ele PRECISA do nonce da CSP (ver abaixo): sem isso a política estrita de
// produção bloqueia o script e o tema para de ser corrigido antes do paint —
// exatamente o flash que ele existe para evitar.
const THEME_SCRIPT = `(function(){try{
  var m=document.cookie.match(/(?:^|; )theme=([^;]+)/);
  var t=m?decodeURIComponent(m[1]):"light";
  if(t==="system"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
  document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");
}catch(e){}})();`;

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sala de Growth",
  description: "Gerenciador colaborativo para o time de Growth",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themePref = (await cookies()).get("theme")?.value;
  // "system" é resolvido no cliente pelo THEME_SCRIPT; no SSR usa claro.
  const initialTheme = themePref === "dark" ? "dark" : "light";

  // Nonce por request, gerado pelo middleware e repassado em x-nonce.
  //
  // O Next aplica nonce sozinho nos scripts DELE (runtime, bundles, inline do
  // framework) e nos <Script> com a prop — um <script> cru do layout, como o
  // do tema, fica de fora e é bloqueado pela CSP. Em dev não há nonce (a CSP
  // permissiva não exige) e o atributo simplesmente não é emitido.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="pt-BR"
      data-theme={initialTheme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={
        {
          "--font-sans": "var(--font-geist-sans), system-ui, sans-serif",
          "--font-mono": "var(--font-geist-mono), ui-monospace, monospace",
        } as React.CSSProperties
      }
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
