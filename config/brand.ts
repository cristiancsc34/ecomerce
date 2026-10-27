/**
 * Configuração central da marca. Nome, slogan, contatos e links ficam aqui
 * para que a marca provisória possa ser trocada sem mexer em componentes.
 *
 * Campos vazios ("") são tratados como "não configurado" e escondidos na
 * interface: nunca inventar telefone, e-mail, CNPJ ou endereço.
 */
export type BrandConfig = {
  name: string;
  slogan: string;
  tagline: string;
  description: string;
  /** Barra de aviso opcional no topo. `null` = desligada. Nunca usar promoção falsa. */
  announcement: { text: string; href?: string } | null;
  contact: {
    email: string;
    whatsapp: string;
    phone: string;
    hours: string;
  };
  social: { label: string; href: string }[];
  legal: {
    companyName: string;
    cnpj: string;
    address: string;
  };
  /** Mostra aviso nas páginas de política enquanto o texto não for revisado. */
  policiesUnderReview: boolean;
};

export const brand: BrandConfig = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Cuxões",
  slogan: "Seu melhor descanso começa aqui.",
  tagline: "Poltronas, cadeiras e produtos de descanso.",
  description:
    "Loja de poltronas, cadeiras e produtos de descanso, com fotos de todos os ângulos e visualização em 3D.",
  announcement: null,
  contact: {
    email: "",
    whatsapp: "",
    phone: "",
    hours: "",
  },
  social: [],
  legal: {
    companyName: "",
    cnpj: "",
    address: "",
  },
  policiesUnderReview: true,
};

export function hasAnyContact(config: BrandConfig = brand): boolean {
  const { email, whatsapp, phone } = config.contact;
  return Boolean(email || whatsapp || phone);
}

/** Link wa.me a partir de um número em qualquer formato. */
export function whatsappHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}
