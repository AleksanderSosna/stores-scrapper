# Stores Scrapper

A TypeScript and Playwright data pipeline that collects product catalogs from
retailer storefronts and highlights cross-market price differences. It currently
covers C&A, Deichmann, ECCO, and IKEA in Poland and Czechia.

**Live website:** [stores-api-polyu.ondigitalocean.app](https://stores-api-polyu.ondigitalocean.app/)

The project combines browser automation, retailer catalog APIs, pagination,
country-aware data normalization, and currency conversion to produce reusable
JSON data for a lightweight static website.

## What it does

- Discovers product categories and collects products from C&A, Deichmann, ECCO,
  and IKEA.
- Captures stable product identifiers, names, images, and country-specific
  product links.
- Records prices in each market's local currency and converts prices using
  exchange-rate data from the National Bank of Poland.
- Ranks up to 50 cross-market offers per store and country by potential value
  and discount.
- Writes the catalog as static JSON, which the website can use without a
  separate application server.

Prices are snapshots from the last collection run, not live quotes. Always
confirm current availability and pricing with the retailer.

## Current coverage

| Store     | Poland | Czechia | Collection approach                                                         |
| --------- | ------ | ------- | --------------------------------------------------------------------------- |
| C&A       | PLN    | CZK     | Persisted-query APIs for category navigation and paginated product listings |
| Deichmann | PLN    | CZK     | Storefront category links and paginated product listings                    |
| ECCO      | PLN    | CZK     | Browser-discovered categories and paginated Algolia product search          |
| IKEA      | PLN    | CZK     | Browser-discovered categories and paginated product-list API                |

Country and currency settings are maintained in
[countries.json](website/api/countries.json). Example output:
[ECCO offers](website/api/offers/ecco.json) ·
[IKEA offers](website/api/offers/ikea.json) ·
[Deichmann offers](website/api/offers/deichmann.json).

## How it works

1. A store-specific Playwright flow discovers categories and collects catalog
   data from the storefront or its observed catalog API.
2. The scraper normalizes country-specific URLs and prices into shared
   [TypeScript data contracts](types.d.ts), preserving product identity across
   markets.
3. Offer generation compares prices in a common currency and writes separate
   value- and discount-ranked lists for each country.
4. The generated JSON under `website/api/` is available to the static frontend
   in `website/`.

The Playwright files under `tests/` are data-collection jobs, not isolated UI
acceptance tests.

## Tech stack

- TypeScript and Node.js
- Playwright for browser automation and retailer API requests
- React-based static frontend
- JSON catalog data
- GitHub Actions for manually triggered collection runs

## Run a collection

Requirements: Node.js and npm.

```bash
npm ci
npx playwright install chromium
```

Optionally copy [.env.example](.env.example) to `.env` to configure the browser
to run headlessly.

```bash
npm test
```

> **Caution:** `npm test` makes live requests to retailer and exchange-rate
> services. It regenerates categories, products, and offers, and clears the
> existing product JSON directories for all supported stores before collecting
> fresh data. Review your working tree and back up any catalog data you need
> before running it.

The [GitHub Actions workflow](.github/workflows/stores-scrapper.yml) is manually
triggered with `workflow_dispatch` and runs the same collection process.

## Project layout

```text
page-objects/       Store-specific browser and API helpers
tests/              Playwright catalog-collection flows
website/api/        Country, category, product, and offer JSON
website/            Static frontend and published data assets
types.d.ts          Shared catalog data contracts
```

## License

This repository is public, but the project is proprietary and all rights are
reserved. Public availability does not grant permission to reuse, modify, or
distribute the project. See [LICENSE](LICENSE); third-party components retain
their own license terms.

---

Maintained by [Aleksander Sosna](https://github.com/AleksanderSosna).
