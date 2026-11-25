# Repository instructions

## Project purpose

This repository collects country-specific product catalog data and offers from online stores and publishes the resulting JSON for the website. Playwright flows under `tests/` are data-collection jobs, not UI acceptance tests.

## Structure and data

- Store-specific collection flows are in `tests/<store>-scrapper.test.ts`; browser and API helpers are in `page-objects/`.
- Reuse shared helpers in `page-objects/shared.ts` and preserve the `Category`, `Product`, and `Offer` contracts in `types.d.ts`.
- Country codes and source currencies come from `website/api/countries.json`. Keep product identity stable across countries, and store country-specific URLs and prices under their country codes.
- Store catalog data is under `website/api/<store>/`; offer summaries are under `website/api/offers/`.

## Implementation guidance

- Inspect existing store integrations and representative output data before changing scraper behavior or schemas.
- Prefer observed catalog APIs when they provide complete data. Use browser navigation and network inspection to establish how the store works; do not guess endpoints or response fields.
- Handle pagination and country/currency mapping explicitly. Validate required fields and surface failed or incomplete collection instead of silently writing partial records.
- Keep changes focused, follow the existing TypeScript and formatting conventions, and avoid unrelated generated catalog or website bundle changes.

## Validation

- Scraper flows make live network requests and can create, overwrite, or delete files under `website/api/`. Do not run `npm test` or a store scraper as routine validation unless the user requests it or the change requires it.
- Prefer non-destructive checks, such as formatting and type checking, where available. If live collection is needed, explain the affected data and verify the resulting output.
