---
name: adding-store-scraper
description: Add a new online store integration to the stores-scrapper catalog.
---

# Adding a store scraper

Use this skill when implementing support for another retailer or extending a store's catalog extraction.

## Repository shape

- Store-specific Playwright data-collection flows live in `tests/<store>-scrapper.test.ts`.
- Store-specific browser and API helpers live in `page-objects/<store>.ts`.
- Shared browser, file, and exchange-rate helpers are in `page-objects/shared.ts`.
- Countries and base currencies are defined in `website/api/countries.json`.
- Shared catalog contracts are defined in `types.d.ts`.
- Store categories and products are written under `website/api/<store>/`; offer summaries are written under `website/api/offers/`.

## Workflow

1. Inspect at least one existing store integration and the shared helpers before designing a new one.
2. Explore the retailer with the Playwright MCP server. Inspect page structure and network responses to identify category listings, product data, pagination, stable IDs, URLs, image URLs, and price/currency fields.
3. Prefer a directly observed catalog endpoint when it returns complete data. Use browser navigation when necessary to discover or trigger the endpoint; do not guess undocumented request parameters or response fields.
4. Implement store-specific behavior in its page object and scraper flow. Reuse shared helpers and keep the flow consistent with the existing country-by-country data collection.
5. Normalize output to the existing `Category`, `Product`, and `Offer` types. Preserve product identity across countries and store country-specific URLs and prices under their country codes.
6. Handle pagination until the source indicates there is no more data. Validate required fields and fail explicitly on failed responses or incomplete extraction.
7. Run the narrowest relevant validation. Do not clear or regenerate large catalog data unless the user requested a live scrape or it is necessary to validate the change.

## Boundaries

- Treat Playwright here as a scraping and source-inspection tool, not as a request to create UI acceptance tests.
- Keep changes focused on the new store integration and directly related shared behavior.
- Do not commit generated secrets, credentials, or session data.
