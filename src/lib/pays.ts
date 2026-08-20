/**
 * Les pays du sélecteur de connexion.
 *
 * Pas les 250 : ceux d'où quelqu'un ouvre réellement Flex. Le Sénégal en tête,
 * puis l'Afrique de l'Ouest, le Maghreb, les pays de la diaspora sénégalaise,
 * et les routes commerciales. Une liste complète serait 250 lignes dont 200 ne
 * serviraient jamais, et une liste sans champ de recherche serait pire.
 *
 * Le drapeau n'est pas une image : il se calcule depuis le code ISO, deux
 * lettres devenant deux symboles indicateurs régionaux. Zéro octet embarqué,
 * zéro dépendance, et il suit la police du système.
 */
export type Pays = {
  /** ISO 3166-1 alpha-2. Sert de clé et de drapeau. */
  code: string;
  /** Indicatif international, sans le « + ». */
  indicatif: string;
  nom: string;
  /** Le nom anglais, quand il diffère. */
  nomEn?: string;
};

export function drapeau(code: string): string {
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export const PAYS: Pays[] = [
  { code: 'SN', indicatif: '221', nom: 'Sénégal', nomEn: 'Senegal' },

  // Afrique de l'Ouest — les voisins immédiats.
  { code: 'ML', indicatif: '223', nom: 'Mali' },
  { code: 'MR', indicatif: '222', nom: 'Mauritanie', nomEn: 'Mauritania' },
  { code: 'GM', indicatif: '220', nom: 'Gambie', nomEn: 'Gambia' },
  { code: 'GN', indicatif: '224', nom: 'Guinée', nomEn: 'Guinea' },
  { code: 'GW', indicatif: '245', nom: 'Guinée-Bissau', nomEn: 'Guinea-Bissau' },
  { code: 'CI', indicatif: '225', nom: 'Côte d’Ivoire' },
  { code: 'BF', indicatif: '226', nom: 'Burkina Faso' },
  { code: 'NE', indicatif: '227', nom: 'Niger' },
  { code: 'TG', indicatif: '228', nom: 'Togo' },
  { code: 'BJ', indicatif: '229', nom: 'Bénin', nomEn: 'Benin' },
  { code: 'GH', indicatif: '233', nom: 'Ghana' },
  { code: 'NG', indicatif: '234', nom: 'Nigeria' },
  { code: 'CM', indicatif: '237', nom: 'Cameroun', nomEn: 'Cameroon' },
  { code: 'CV', indicatif: '238', nom: 'Cap-Vert', nomEn: 'Cabo Verde' },
  { code: 'GA', indicatif: '241', nom: 'Gabon' },
  { code: 'CG', indicatif: '242', nom: 'Congo' },
  { code: 'CD', indicatif: '243', nom: 'RD Congo', nomEn: 'DR Congo' },

  // Maghreb.
  { code: 'MA', indicatif: '212', nom: 'Maroc', nomEn: 'Morocco' },
  { code: 'DZ', indicatif: '213', nom: 'Algérie', nomEn: 'Algeria' },
  { code: 'TN', indicatif: '216', nom: 'Tunisie', nomEn: 'Tunisia' },
  { code: 'LY', indicatif: '218', nom: 'Libye', nomEn: 'Libya' },
  { code: 'EG', indicatif: '20', nom: 'Égypte', nomEn: 'Egypt' },

  // Diaspora.
  { code: 'FR', indicatif: '33', nom: 'France' },
  { code: 'IT', indicatif: '39', nom: 'Italie', nomEn: 'Italy' },
  { code: 'ES', indicatif: '34', nom: 'Espagne', nomEn: 'Spain' },
  { code: 'PT', indicatif: '351', nom: 'Portugal' },
  { code: 'BE', indicatif: '32', nom: 'Belgique', nomEn: 'Belgium' },
  { code: 'DE', indicatif: '49', nom: 'Allemagne', nomEn: 'Germany' },
  { code: 'CH', indicatif: '41', nom: 'Suisse', nomEn: 'Switzerland' },
  { code: 'NL', indicatif: '31', nom: 'Pays-Bas', nomEn: 'Netherlands' },
  { code: 'GB', indicatif: '44', nom: 'Royaume-Uni', nomEn: 'United Kingdom' },
  { code: 'US', indicatif: '1', nom: 'États-Unis', nomEn: 'United States' },
  { code: 'CA', indicatif: '1', nom: 'Canada' },

  // Routes commerciales et Golfe.
  { code: 'TR', indicatif: '90', nom: 'Turquie', nomEn: 'Türkiye' },
  { code: 'AE', indicatif: '971', nom: 'Émirats arabes unis', nomEn: 'United Arab Emirates' },
  { code: 'SA', indicatif: '966', nom: 'Arabie saoudite', nomEn: 'Saudi Arabia' },
  { code: 'QA', indicatif: '974', nom: 'Qatar' },
  { code: 'CN', indicatif: '86', nom: 'Chine', nomEn: 'China' },
  { code: 'IN', indicatif: '91', nom: 'Inde', nomEn: 'India' },
  { code: 'BR', indicatif: '55', nom: 'Brésil', nomEn: 'Brazil' },
  { code: 'ZA', indicatif: '27', nom: 'Afrique du Sud', nomEn: 'South Africa' },
];

export const PAYS_PAR_DEFAUT = PAYS[0] as Pays;

/** Le premier pays qui porte cet indicatif — `+1` en rend deux, on prend les USA. */
export function paysPourIndicatif(indicatif: string): Pays | null {
  const i = indicatif.replace(/[^0-9]/g, '');
  return PAYS.find((p) => p.indicatif === i) ?? null;
}
