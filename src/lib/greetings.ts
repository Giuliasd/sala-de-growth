const ENERGY_EMOJIS = ['🚀', '✨', '💪', '🔥', '🎯', '⚡', '🌟', '☀️', '🌱', '🎨', '🧠', '☕'];

export function getRandomEnergyEmoji(): string {
  return ENERGY_EMOJIS[Math.floor(Math.random() * ENERGY_EMOJIS.length)];
}

export function getGreeting(name: string, emoji?: string): string {
  const day = new Date().getDay(); // 0=dom, 1=seg, ..., 6=sáb
  const e = emoji ?? '';
  switch (day) {
    case 1: return `Bora começar com tudo, ${name}${e ? ` ${e}` : ''}`;
    case 2: return `Bom dia, ${name}. Bora rodar?${e ? ` ${e}` : ''}`;
    case 3: return `Meio da semana chegando, ${name}${e ? ` ${e}` : ''}`;
    case 4: return `Quinta é quase sexta, ${name}.${e ? ` ${e}` : ''}`;
    case 5: return `Sextou, ${name}. Bora fechar?${e ? ` ${e}` : ''}`;
    default: return `Oi, ${name}. Trabalhando no fim de semana?${e ? ` ${e}` : ''}`;
  }
}
