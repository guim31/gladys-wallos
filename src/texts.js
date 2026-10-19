// -----------------------------------------------------------------------------
// Texts produced by the container, in the four languages of Gladys (the
// language of the configuration for the feature names and the scene texts, the
// language of the dashboard for the widget), and the number and date formats.
// -----------------------------------------------------------------------------

export const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
export const LANGS = Object.keys(LOCALES);

// Feature names, frozen at creation in Gladys, keyed by feature key
// (src/devices.js).
export const NAMES = {
  en: {
    monthly_cost: 'Monthly cost',
    yearly_cost: 'Estimated yearly cost',
    active_count: 'Active subscriptions',
    days_next: 'Days before the next payment',
    next_name: 'Next payment',
    price: 'Price',
    days_left: 'Days before payment',
    next_due: 'Next payment date',
  },
  fr: {
    monthly_cost: 'Coût mensuel',
    yearly_cost: 'Coût annuel estimé',
    active_count: 'Abonnements actifs',
    days_next: 'Jours avant le prochain paiement',
    next_name: 'Prochain paiement',
    price: 'Prix',
    days_left: 'Jours avant le paiement',
    next_due: 'Date du prochain paiement',
  },
  de: {
    monthly_cost: 'Monatliche Kosten',
    yearly_cost: 'Geschätzte Jahreskosten',
    active_count: 'Aktive Abonnements',
    days_next: 'Tage bis zur nächsten Zahlung',
    next_name: 'Nächste Zahlung',
    price: 'Preis',
    days_left: 'Tage bis zur Zahlung',
    next_due: 'Datum der nächsten Zahlung',
  },
  es: {
    monthly_cost: 'Coste mensual',
    yearly_cost: 'Coste anual estimado',
    active_count: 'Suscripciones activas',
    days_next: 'Días hasta el próximo pago',
    next_name: 'Próximo pago',
    price: 'Precio',
    days_left: 'Días hasta el pago',
    next_due: 'Fecha del próximo pago',
  },
};

// Sentences of the scene action and of the scene trigger. Functions take `p`.
export const PHRASES = {
  en: {
    payment: (p) => `${p.name}: ${p.amount} ${p.when}`,
    noPayment: (p) => `No payment in the next ${p.days} days.`,
    total: (p) => `Total: ${p.amount}`,
    today: 'today',
    tomorrow: 'tomorrow',
    inDays: (p) => `in ${p.days} days`,
    paymentDue: (p) => `${p.name}: ${p.amount} to pay ${p.when}.`,
  },
  fr: {
    payment: (p) => `${p.name} : ${p.amount} ${p.when}`,
    noPayment: (p) => `Aucun paiement dans les ${p.days} prochains jours.`,
    total: (p) => `Total : ${p.amount}`,
    today: "aujourd'hui",
    tomorrow: 'demain',
    inDays: (p) => `dans ${p.days} jours`,
    paymentDue: (p) => `${p.name} : ${p.amount} à payer ${p.when}.`,
  },
  de: {
    payment: (p) => `${p.name}: ${p.amount} ${p.when}`,
    noPayment: (p) => `Keine Zahlung in den nächsten ${p.days} Tagen.`,
    total: (p) => `Summe: ${p.amount}`,
    today: 'heute',
    tomorrow: 'morgen',
    inDays: (p) => `in ${p.days} Tagen`,
    paymentDue: (p) => `${p.name}: ${p.amount} fällig ${p.when}.`,
  },
  es: {
    payment: (p) => `${p.name}: ${p.amount} ${p.when}`,
    noPayment: (p) => `Ningún pago en los próximos ${p.days} días.`,
    total: (p) => `Total: ${p.amount}`,
    today: 'hoy',
    tomorrow: 'mañana',
    inDays: (p) => `dentro de ${p.days} días`,
    paymentDue: (p) => `${p.name}: ${p.amount} a pagar ${p.when}.`,
  },
};

// Connection status and configuration action messages, keyed by message.
export const STATUS = {
  en: {
    initFailed: 'The integration could not start: see its logs.',
    noUrl: 'Enter the address of Wallos and your API key.',
    invalidUrl: 'The address of Wallos is not understood (no user or password in it).',
    noKey: 'Enter your API key of Wallos (Profile → API key).',
    unauthorized: 'Wallos refuses the API key: copy it again from Profile → API key.',
    unreachable: 'Wallos does not answer: the last values are kept.',
    certificate:
      'The certificate of Wallos is not trusted: enable "self-signed certificate" if it is yours.',
    notWallos: 'This address does not answer like the API of Wallos.',
    summary: (p) =>
      `Connected to Wallos ${p.version}: ${p.count} active subscription(s), ${p.monthly} per month.`,
  },
  fr: {
    initFailed: "L'intégration n'a pas pu démarrer : voir ses journaux.",
    noUrl: "Indiquez l'adresse de Wallos et votre clé d'API.",
    invalidUrl: "L'adresse de Wallos n'est pas comprise (sans utilisateur ni mot de passe).",
    noKey: "Indiquez votre clé d'API de Wallos (Profil → Clé API).",
    unauthorized: "Wallos refuse la clé d'API : copiez-la à nouveau depuis Profil → Clé API.",
    unreachable: 'Wallos ne répond pas : les dernières valeurs sont gardées.',
    certificate:
      "Le certificat de Wallos n'est pas reconnu : activez « certificat auto-signé » s'il est le vôtre.",
    notWallos: "Cette adresse ne répond pas comme l'API de Wallos.",
    summary: (p) =>
      `Connecté à Wallos ${p.version} : ${p.count} abonnement(s) actif(s), ${p.monthly} par mois.`,
  },
  de: {
    initFailed: 'Die Integration konnte nicht starten: siehe ihre Protokolle.',
    noUrl: 'Gib die Adresse von Wallos und deinen API-Schlüssel an.',
    invalidUrl: 'Die Adresse von Wallos wird nicht verstanden (ohne Benutzer und Passwort).',
    noKey: 'Gib deinen API-Schlüssel von Wallos an (Profil → API Key).',
    unauthorized: 'Wallos lehnt den API-Schlüssel ab: kopiere ihn erneut aus Profil → API Key.',
    unreachable: 'Wallos antwortet nicht: die letzten Werte bleiben erhalten.',
    certificate:
      'Das Zertifikat von Wallos ist nicht vertrauenswürdig: aktiviere „selbstsigniertes Zertifikat“, wenn es deins ist.',
    notWallos: 'Diese Adresse antwortet nicht wie die API von Wallos.',
    summary: (p) =>
      `Mit Wallos ${p.version} verbunden: ${p.count} aktive(s) Abonnement(s), ${p.monthly} pro Monat.`,
  },
  es: {
    initFailed: 'La integración no pudo iniciarse: consulte sus registros.',
    noUrl: 'Indique la dirección de Wallos y su clave de API.',
    invalidUrl: 'La dirección de Wallos no se entiende (sin usuario ni contraseña).',
    noKey: 'Indique su clave de API de Wallos (Perfil → Clave API).',
    unauthorized: 'Wallos rechaza la clave de API: cópiela de nuevo desde Perfil → Clave API.',
    unreachable: 'Wallos no responde: se conservan los últimos valores.',
    certificate:
      'El certificado de Wallos no es de confianza: active «certificado autofirmado» si es el suyo.',
    notWallos: 'Esta dirección no responde como la API de Wallos.',
    summary: (p) =>
      `Conectado a Wallos ${p.version}: ${p.count} suscripción(es) activa(s), ${p.monthly} al mes.`,
  },
};

/** A STATUS (or PHRASES) entry as a multi-language object. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGS.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

const locale = (language) => LOCALES[language] ?? LOCALES.en;
const ISO_CURRENCY = /^[A-Z]{3}$/;

/** An amount with its currency: "1 234,56 €", "-12.30 CHF". */
export function formatAmount(value, currency, language, decimals = 2) {
  if (value === null || value === undefined) {
    return '–';
  }
  const digits = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  if (currency && ISO_CURRENCY.test(currency)) {
    try {
      return new Intl.NumberFormat(locale(language), {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        ...digits,
      }).format(value);
    } catch {
      // An unknown code falls back on the plain number.
    }
  }
  const number = new Intl.NumberFormat(locale(language), digits).format(value);
  return currency ? `${number} ${currency}` : number;
}

/** A calendar date (YYYY-MM-DD) in words: "05/11/2026", "11/05/2026" in en-GB too. */
export function formatDay(day, language) {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

/** Date and time in the time zone of Gladys (TZ): "15/10 17:38". */
export function formatDate(ms, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

/** "today", "tomorrow", "in 5 days". */
export function when(days, language) {
  const phrases = PHRASES[language] ?? PHRASES.en;
  if (days === 0) {
    return phrases.today;
  }
  return days === 1 ? phrases.tomorrow : phrases.inDays({ days });
}
