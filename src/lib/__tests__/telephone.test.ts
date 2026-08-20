import type { AuthError } from '@supabase/supabase-js';

import { cleErreurAuth, formaterNumero, numeroE164, numeroPlausible } from '../telephone';

/**
 * Le classement des erreurs d'authentification.
 *
 * Ce fichier existe à cause d'un vrai défaut : toute erreur de livraison Twilio
 * contient « to provider », et un filtre sur ce mot rangeait un refus de région
 * dans « fournisseur non branché ». L'écran conseillait donc d'aller voir
 * ailleurs alors que le fournisseur marchait. Les messages ci-dessous sont les
 * VRAIS, relevés contre le projet distant.
 */
const erreur = (message: string, code?: string, status = 422) =>
  ({ message, code, status, name: 'AuthApiError' }) as unknown as AuthError;

describe('cleErreurAuth', () => {
  it('un pays fermé chez Twilio n’est pas un fournisseur absent', () => {
    // Message relevé tel quel sur un +221, Geo Permissions fermées.
    const reel = erreur(
      "Error sending confirmation OTP to provider: Permission to send an SMS has not " +
        "been enabled for the region indicated by the 'To' number: +22177123XXXX More " +
        'information: https://www.twilio.com/docs/errors/21408',
      'sms_send_failed',
    );
    expect(cleErreurAuth(reel)).toBe('erreurs.smsPaysFerme');
  });

  it('un fournisseur réellement absent se distingue', () => {
    expect(cleErreurAuth(erreur('Unsupported phone provider', 'otp_disabled'))).toBe(
      'erreurs.smsIndisponible',
    );
  });

  it('un autre échec d’envoi ne s’invente pas de cause', () => {
    expect(cleErreurAuth(erreur('Error sending confirmation OTP to provider: boom', 'sms_send_failed'))).toBe(
      'erreurs.smsEchecEnvoi',
    );
  });

  it('un code expiré, un code faux, une limite de débit', () => {
    expect(cleErreurAuth(erreur('Token has expired or is invalid', 'otp_expired'))).toBe(
      'erreurs.codeExpire',
    );
    expect(cleErreurAuth(erreur('Invalid token', 'otp_invalid'))).toBe('erreurs.codeInvalide');
    expect(
      cleErreurAuth(
        erreur('For security purposes, you can only request this after 42 seconds', 'over_sms_send_rate_limit'),
      ),
    ).toBe('erreurs.tropDeTentatives');
  });

  it('une panne de réseau reste une panne de réseau', () => {
    expect(cleErreurAuth(erreur('Network request failed'))).toBe('erreurs.reseau');
  });

  it('rien de reconnu ne montre jamais le message brut', () => {
    expect(cleErreurAuth(erreur('relation "x" does not exist'))).toBe('erreurs.inconnue');
    expect(cleErreurAuth(null)).toBe('erreurs.inconnue');
  });
});

describe('le numéro', () => {
  it('assemble un E.164 sans espaces ni signes', () => {
    expect(numeroE164('221', '77 123 45 67')).toBe('+221771234567');
    expect(numeroE164('+1', '(343) 504-3148')).toBe('+13435043148');
  });

  it('juge une longueur plausible, pas un plan de numérotation', () => {
    expect(numeroPlausible('221', '771234567')).toBe(true);
    expect(numeroPlausible('1', '3435043148')).toBe(true);
    expect(numeroPlausible('221', '77')).toBe(false);
    expect(numeroPlausible('', '771234567')).toBe(false);
  });

  it('groupe par deux au Sénégal, laisse les autres tels quels', () => {
    // Espaces INSÉCABLES : un numéro coupé en fin de ligne ne se relit plus.
    expect(formaterNumero('221', '771234567')).toBe('+221\u00a077\u00a012\u00a034\u00a056\u00a07');
    expect(formaterNumero('1', '3435043148')).toBe('+1\u00a03435043148');
  });
});
