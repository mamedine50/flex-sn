import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AccrocheBienvenue,
  AccrocheOnVousRepond,
  AccrocheVotrePrix,
} from '../src/components/IllustrationsAccroche';
import { useT } from '../src/i18n';
import { marquerAccrocheVue } from '../src/lib/accroche';
import { ouvrirDocument } from '../src/lib/legal';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';

/**
 * Le mini-tour de bienvenue — trois cartes, une seule fois.
 *
 * Il ne s'affiche qu'au tout premier lancement. La marque vit dans le stockage
 * local et survit à une déconnexion : on ne réexplique pas le produit à
 * quelqu'un qui l'a déjà utilisé.
 *
 * TROIS CHOSES QUI NE SONT PAS DÉCORATIVES :
 *
 * 1. **« Passer » mène à la carte 3, pas à la sortie.** La ligne légale de la
 *    dernière carte est le consentement qui rend l'inscription valable — un
 *    bouton qui la contournerait produirait des comptes créés sans elle. On
 *    saute l'explication, jamais l'accord.
 * 2. **Les points sont de vrais boutons.** Un carrousel qui ne se parcourt
 *    qu'au doigt est inutilisable au lecteur d'écran et pénible à qui a la main
 *    qui tremble. Le point visible fait 8 pt, sa zone d'appui 44.
 * 3. **La largeur est mesurée, pas devinée.** C'est le pas de la pagination :
 *    une constante ferait dériver les cartes dès le premier appareil qui n'a
 *    pas la largeur prévue.
 */

const TOTAL = 3;

export default function Bienvenue() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const defilement = useRef<ScrollView>(null);
  const [largeur, setLargeur] = useState(0);

  // `carte` s'ouvre en paramètre : c'est par là que l'assertion de la dernière
  // carte se déclenche sans main humaine, et rien en production n'y mène.
  const { carte: depart } = useLocalSearchParams<{ carte?: string }>();
  const [carte, setCarte] = useState(() => borner(Number.parseInt(depart ?? '', 10)));

  // Deux variantes : le bouton n'existe que sur la dernière carte, et une
  // assertion qui attend une mesure qui ne viendra jamais ne se prononce
  // jamais. Le `+` garde les mesures déjà prises d'une variante à l'autre.
  const derniere = carte === TOTAL - 1;
  configurerGabarit(
    derniere ? 'bienvenue+fin' : 'bienvenue',
    derniere ? { points: 44, continuer: 56 } : { points: 44 },
  );

  const mesurer = useCallback((e: LayoutChangeEvent) => {
    setLargeur(e.nativeEvent.layout.width);
  }, []);

  const aller = useCallback(
    (index: number) => {
      setCarte(index);
      defilement.current?.scrollTo({ x: index * largeur, animated: true });
    },
    [largeur],
  );

  const suivreDoigt = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (largeur <= 0) return;
      const index = Math.round(e.nativeEvent.contentOffset.x / largeur);
      setCarte(Math.max(0, Math.min(TOTAL - 1, index)));
    },
    [largeur],
  );

  // Le tour mène à la CONNEXION. On vient d'expliquer le produit ; on demande
  // maintenant de quoi s'en servir. C'est l'ordre de toutes les applications de
  // transport, et celui d'inDrive en particulier.
  const continuer = () => {
    void marquerAccrocheVue();
    router.replace('/connexion');
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: marges.top + 16 }}>
      <View className="h-32 flex-row items-center justify-between px-16">
        <Text className="text-[20px] font-extrabold text-ink">Flex</Text>
        {/* Discret, mais présent dès la carte 1 : qui connaît déjà le produit
            n'a pas à subir trois écrans pour arriver au bouton. Sur la dernière
            carte il DISPARAÎT — le laisser transparent mais posé garderait une
            cible que le lecteur d'écran annonce et que l'œil ne voit pas. */}
        {!derniere && (
          <Pressable
            accessibilityRole="button"
            onPress={() => aller(TOTAL - 1)}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text className="text-[15px] font-bold text-muted">
              {t('accroche.passer')}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={defilement}
        horizontal
        pagingEnabled
        contentOffset={{ x: carte * largeur, y: 0 }}
        showsHorizontalScrollIndicator={false}
        onLayout={mesurer}
        onMomentumScrollEnd={suivreDoigt}
        className="flex-1"
      >
        {largeur > 0 && (
          <>
            <Carte largeur={largeur} illustration={<AccrocheVotrePrix />} cle="Un" />
            <Carte largeur={largeur} illustration={<AccrocheOnVousRepond />} cle="Deux" />
            <Carte largeur={largeur} illustration={<AccrocheBienvenue />} cle="Trois" />
          </>
        )}
      </ScrollView>

      <View
        className="h-[44px] flex-row items-center justify-center"
        onLayout={(e) => noterMesure('points', e.nativeEvent.layout.height)}
      >
        {[0, 1, 2].map((i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityState={{ selected: i === carte }}
            accessibilityLabel={t('accroche.carte', { n: i + 1, total: TOTAL })}
            onPress={() => aller(i)}
            className="h-[44px] w-[44px] items-center justify-center"
          >
            <View
              className={`h-8 w-8 rounded-full ${i === carte ? 'bg-accFill' : 'bg-line'}`}
            />
          </Pressable>
        ))}
      </View>

      <View className="px-16" style={{ paddingBottom: marges.bottom + 16 }}>
        {/* Le bouton n'existe que sur la dernière carte, mais sa PLACE est
            réservée sur les trois : sans ça, la colonne se recompose au premier
            balayage et le pied de page saute sous le doigt. */}
        {derniere ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={continuer}
              onLayout={(e) => noterMesure('continuer', e.nativeEvent.layout.height)}
              className="min-h-driving items-center justify-center rounded-button bg-accFill"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[16px] font-extrabold text-onAcc">
                {t('accroche.continuer')}
              </Text>
            </Pressable>
            <MentionLegale />
          </>
        ) : (
          <View className="min-h-driving" />
        )}
      </View>
    </View>
  );
}

/** Un index de carte qui tient dans le tour, quoi qu'on lui passe. */
function borner(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(TOTAL - 1, n));
}

/** Une carte : l'illustration, le titre, la ligne en dessous. */
function Carte({
  largeur,
  illustration,
  cle,
}: {
  largeur: number;
  illustration: React.ReactNode;
  cle: 'Un' | 'Deux' | 'Trois';
}) {
  const t = useT();
  return (
    <View className="items-center justify-center px-24" style={{ width: largeur }}>
      {illustration}
      <Text className="mt-32 text-center text-[28px] font-extrabold text-ink">
        {t(`accroche.titre${cle}`)}
      </Text>
      <Text className="mt-12 text-center text-[16px] font-semibold text-muted">
        {t(`accroche.sous${cle}`)}
      </Text>
    </View>
  );
}

/**
 * La phrase légale, avec ses deux liens.
 *
 * Elle vit sur la DERNIÈRE carte, collée au bouton qui vaut acceptation. La
 * poser ailleurs reviendrait à faire consentir plus tôt qu'on ne s'engage.
 *
 * Les liens mènent au texte HÉBERGÉ — celui qu'Apple lit et qu'un juriste
 * corrigera sans qu'on republie l'application. Voir `src/lib/legal.ts` pour le
 * repli quand aucune URL n'est configurée.
 */
function MentionLegale() {
  const t = useT();

  const morceaux = t('accroche.legal')
    .split(/(\{conditions\}|\{confidentialite\})/)
    .filter(Boolean);

  return (
    <Text className="mt-16 text-center text-[12px] font-semibold text-muted">
      {morceaux.map((m, i) => {
        if (m !== '{conditions}' && m !== '{confidentialite}') {
          return <Text key={i}>{m}</Text>;
        }
        const conditions = m === '{conditions}';
        return (
          <Text
            key={i}
            accessibilityRole="link"
            className="font-bold text-accInk underline"
            onPress={() =>
              ouvrirDocument(conditions ? 'conditions' : 'confidentialite')
            }
          >
            {t(conditions ? 'accroche.conditions' : 'accroche.confidentialite')}
          </Text>
        );
      })}
    </Text>
  );
}
