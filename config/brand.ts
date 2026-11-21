/**
 * Configuração central da marca. Nome, slogan, contatos e links ficam aqui
 * para que a marca (AzConfort) possa ser ajustada sem mexer em componentes.
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
  /**
   * Endereço da loja/expedição em partes, para o Google (LocalBusiness). Só é
   * publicado com rua, cidade, CEP e UF preenchidos. Use o mesmo endereço do
   * Perfil da Empresa no Google.
   */
  location: {
    streetAddress: string;
    addressLocality: string;
    postalCode: string;
    addressRegion: string;
  };
  /** Mostra aviso nas páginas de política enquanto o texto não for revisado. */
  policiesUnderReview: boolean;
};

export const brand: BrandConfig = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "AzConfort",
  slogan: "Móveis para a sua casa.",
  tagline: "Colchões, sofás, poltronas, mesas e cadeiras",
  description:
    "Loja online de colchões, sofás, poltronas, mesas e cadeiras no Paraná, com visualização em 3D nos modelos com o selo.",
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
    // TODO(Cristian, issue #13): CNPJ da empresa.
    cnpj: "",
    address: "",
  },
  // TODO(Cristian, issue #13): endereço físico real (rua e número, cidade, CEP, UF).
  location: {
    streetAddress: "",
    addressLocality: "",
    postalCode: "",
    addressRegion: "",
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
