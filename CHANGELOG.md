# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A **Wallos** device: monthly cost and estimated yearly cost of the active subscriptions (main currency,
  computed like the statistics of Wallos), number of active subscriptions, days before the next payment
  and its name.
- One device per active subscription: price, days before the next payment and its date.
- Dashboard widget "Wallos: next payments": monthly and yearly cost, then the next 8 payments with a
  coloured badge (today, tomorrow, in N days).
- Scene trigger "Wallos: payment due soon": a payment due today, tomorrow, in 3 or 7 days, once per
  subscription and date, for every active subscription or one chosen.
- Scene action "Wallos: read the next payments": the payments of the next 7, 14 or 31 days and their
  total, as a sentence to send or read aloud.
- "Test the connection" action, refresh every hour by default (15 minutes to 6 hours), self-signed
  certificates accepted on demand.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-wallos/commits/main
