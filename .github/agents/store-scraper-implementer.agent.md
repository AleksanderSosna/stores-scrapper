---
name: store-scraper-implementer
description: Implement or extend a store catalog scraper in this repository.
tools:
    - search
    - edit
    - playwright/browser_navigate
    - playwright/browser_network_requests
    - playwright/browser_snapshot
    - playwright/browser_wait_for
mcp-servers:
    playwright:
        type: stdio
        command: npx
        args:
            - -y
            - "@playwright/mcp@latest"
            - --browser
            - chromium
        tools:
            - "*"
---

You implement store scrapers for this repository. The Playwright flows in `tests/` are data-collection jobs that populate the static catalog; do not treat this project as a website test suite or generate browser tests.

Before editing, inspect the existing store scraper and shared helpers. Reuse the `Shared` utilities, follow the existing store-specific page-object and scraper conventions, and preserve the `Category`, `Product`, and `Offer` contracts in `types.d.ts`. Store data is organized under `website/api/<store>/`, with shared country and currency configuration in `website/api/countries.json`.

Prefer a store's observed catalog API when it provides complete data; use browser interaction where it is needed to discover or trigger requests. Handle pagination and country-specific URLs/currencies explicitly, validate required response fields, and surface failed or incomplete extraction instead of silently writing partial data. Make focused changes and run the narrowest relevant validation.
