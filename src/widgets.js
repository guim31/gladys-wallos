// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `upcoming`.
//
// A `status` list with the monthly cost and the estimated yearly cost of the
// active subscriptions, then the next payments as a `card-list` (8 rows at
// most, the core's cap): the subscription as title, the price and the date as
// subtitle, "today", "tomorrow" or "in N days" as a badge, red today, orange
// within 3 days, neutral beyond. The footer gives the time of the reading.
// Budget: 1 status, 1 card-list, 2 texts at most.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY, upcoming } from './monitor.js';
import { NAMES, formatAmount, formatDate, formatDay, when } from './texts.js';
import { localDay } from './wallos.js';

export const MAX_PAYMENTS = 8;
export const TTL_SECONDS = 600;

export const TEXT = {
  waiting: {
    en: 'Waiting for Wallos…',
    fr: 'En attente de Wallos…',
    de: 'Warte auf Wallos…',
    es: 'Esperando a Wallos…',
  },
  empty: {
    en: 'No upcoming payment',
    fr: 'Aucun paiement à venir',
    de: 'Keine anstehende Zahlung',
    es: 'Ningún pago próximo',
  },
  unreachable: {
    en: 'Wallos does not answer',
    fr: 'Wallos ne répond pas',
    de: 'Wallos antwortet nicht',
    es: 'Wallos no responde',
  },
  readAt: { en: 'Read', fr: 'Lu le', de: 'Gelesen', es: 'Leído' },
  // Short forms: a badge holds 16 characters.
  inDays: { en: 'in {n} d', fr: 'dans {n} j', de: 'in {n} T.', es: 'en {n} d' },
};

const LANGS = Object.keys(TEXT.readAt);
const t = (text, language) => text[language] ?? text.en;
const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** The colour of a payment: red today, orange within 3 days, neutral beyond. */
export function dueColor(days) {
  if (days === 0) {
    return WIDGET_COLORS.DANGER;
  }
  return days <= 3 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL;
}

/** "today", "tomorrow", then "in 5 d": 16 characters at most. */
export function badgeText(days, language) {
  return days <= 1 ? when(days, language) : t(TEXT.inDays, language).replace('{n}', days);
}

/** One row of the next payments. */
export function paymentItem(item, language) {
  const price = formatAmount(item.price, item.currency, language);
  return {
    title: clip(item.name, 60),
    subtitle: clip(`${price} · ${formatDay(item.nextDue, language)}`, 60),
    badge: { text: badgeText(item.days, language), color: dueColor(item.days) },
    ...(item.category ? { description: clip(item.category, 200) } : {}),
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { language = 'en' } = {}) {
      const lang = LANGS.includes(language) ? language : 'en';
      const snapshot = monitor.snapshot;
      if (!snapshot) {
        const text = monitor.problem ? t(TEXT.unreachable, lang) : t(TEXT.waiting, lang);
        return { ttl_seconds: 60, components: [{ type: 'text', variant: 'heading', text }] };
      }
      const names = NAMES[lang];
      const money = (value) => clip(formatAmount(value, snapshot.currency, lang), 40);
      const components = [
        {
          type: 'status',
          items: [
            {
              label: names.monthly_cost,
              value: money(snapshot.summary.monthlyCost),
              icon: 'calendar',
              color: WIDGET_COLORS.NEUTRAL,
            },
            {
              label: names.yearly_cost,
              value: money(snapshot.summary.yearlyCost),
              icon: 'trending-up',
              color: WIDGET_COLORS.NEUTRAL,
            },
          ],
        },
      ];
      const next = upcoming(snapshot, localDay(monitor.now())).slice(0, MAX_PAYMENTS);
      if (next.length === 0) {
        components.push({ type: 'text', variant: 'body', text: t(TEXT.empty, lang) });
      } else {
        components.push({
          type: 'card-list',
          display: 'list',
          items: next.map((item) => paymentItem(item, lang)),
        });
      }
      const unreachable = monitor.problem ? ` · ${t(TEXT.unreachable, lang)}` : '';
      components.push({
        type: 'text',
        variant: 'caption',
        text: clip(
          `Wallos · ${t(TEXT.readAt, lang)} ${formatDate(monitor.lastSuccessAt, lang)}${unreachable}`,
          80,
        ),
      });
      return { ttl_seconds: TTL_SECONDS, components };
    },
  },
};
