---
name: store-catalog-data
description: Work with this repository's country-specific store catalog, currency, and offer data.
---

# Store catalog data

Use this skill when changing scraper output, catalog schemas, currency conversion, or offer aggregation.

## Data contracts

- A category has a stable store category `id` and localized `names` keyed by country code; each localized value has a `name` and may have a listing `url`.
- A product uses a stable `id` and `itemNo`, plus `name`, `imageUrl`, country-keyed `urls`, and country-keyed `prices`.
- Each country price maps currency codes to numeric amounts. The source country's currency comes from `website/api/countries.json`; conversions use the shared exchange-rate helper.
- Offers retain the product fields and include `bestDiscount`, `bestValue`, and `worstPrice`; offer lists are grouped by country and by value or discount.

## Safe updates

1. Read the corresponding type definitions and representative JSON files before changing the output shape.
2. Keep country codes and currency codes distinct; do not assume one country or one currency.
3. Merge country-specific product data by stable product ID so collecting another country does not discard existing URLs or prices.
4. Validate that source prices are numeric and that each written product has the fields required by `types.d.ts`.
5. Preserve the current JSON organization under `website/api/` and avoid rewriting unrelated catalog files.
6. For offer calculations, compare prices expressed in the same currency and keep value and discount rankings independently sorted.

If a retailer's response does not provide a required field, report that gap rather than writing fabricated data or a success-shaped partial record.
