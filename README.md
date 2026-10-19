# Wallos for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration that brings your
[Wallos](https://github.com/ellite/Wallos) (the self-hosted subscription tracker) into Gladys: the
monthly and yearly cost of your subscriptions, the next payments, and a reminder before each one, with a
scene trigger, a scene action and a dashboard widget.

It only reads: the integration never writes to Wallos. Not affiliated with Wallos.

## Features

- **Devices**: a "Wallos" summary (monthly cost and estimated yearly cost in the main currency, number of
  active subscriptions, days before the next payment and its name), and one device per active
  subscription (price, days before the next payment, its date).
- **Dashboard widget** "Wallos: next payments": the monthly and yearly cost, then the next 8 payments with
  a badge (today in red, within 3 days in orange).
- **Scene trigger**: a payment due today, tomorrow, in 3 or 7 days, for every active subscription or one
  chosen. A monthly cost over a threshold is the standard "device state change" trigger of Gladys.
- **Scene action**: read the payments of the next 7, 14 or 31 days and their total, as a sentence to send
  or read aloud.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- Wallos (tested with 5.10.0), reachable from the Gladys host, and the API key of your user (Wallos →
  Profile → API Key).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-wallos` (or install it from the catalog once it is listed).
2. In **Configuration**, enter the address of Wallos and your API key, then save. **Test the connection**
   checks them.
3. Open the **Discover** tab and add the Wallos device and the subscriptions you want to follow.

The user guide is in [`docs/en.md`](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)); Gladys links it from the Configuration screen.

## How it works

Every hour by default (15 minutes to 6 hours), the container reads three endpoints of the Wallos API:
`status/version.php`, `currencies/get_currencies.php` and `subscriptions/get_subscriptions.php`, with the
API key in a POST form (never in a URL). It computes the monthly cost with the formula of the statistics
page of Wallos (its `get_monthly_cost.php` counts a one-time payment in every month before its date),
publishes only the values that changed, re-sends them every 12 hours, and fires the payment reminders.
Which reminders were sent is kept under `/data` (identifiers and dates only), so a restart sends nothing
twice.

Money is private: the logs never hold an amount, a subscription name, the API key or the address of the
server, even at debug level.

## Limitations

- Read only; one Wallos and one user (the one of the API key).
- Payment dates are the ones Wallos keeps (moved forward once a day by its own task); a reminder fires at
  the first reading of the day.
- Developed and tested against a real Wallos 5.10.0 in Docker (fake subscriptions), not yet on a Gladys
  installation with a real Wallos: feedback welcome.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the fake Gladys of the SDK and a fake Wallos serving answers recorded on Wallos
5.10.0 (`test/fixtures/wallos`, fake subscriptions). See [`CLAUDE.md`](CLAUDE.md) for the rules of the
project.

## Credits

- [Wallos](https://github.com/ellite/Wallos) by Miguel Ribeiro (ellite) and contributors (GPL-3.0): this
  integration only uses its API; no code is copied from it. The monthly cost follows the formula of its
  statistics page. The logo on the cover is the one of the Wallos repository.
- Built on the [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js) and the
  official JavaScript template.

## License

[Apache 2.0](LICENSE).
