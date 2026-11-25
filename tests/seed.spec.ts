import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

import * as types from "../types";
import { Shared } from "../page-objects/shared";
// import { Store } from "../page-objects/store";
import countries from "../website/api/countries.json" assert { type: "json" };

let shared: Shared;
// let store: Store;

test.beforeEach(async ({ page }) => {
    shared = new Shared(page);
    // store = new Store(page);
});

test.describe.configure({ mode: "serial" });
test.describe("Store Scrapper", () => {
    test.describe("Categories", () => {
        test.beforeAll(async ({ browser }) => {});

        for (const country of countries) {
            test.skip(`Create ${country.code} Categories Database`, async ({ page }) => {});
        }
    });

    test.describe("Products", () => {
        test.beforeAll(async ({ browser }) => {});

        for (const country of countries) {
            test.skip(`Create ${country.code} Products Database`, async ({ page }) => {});
        }
    });

    test.describe("Offers", () => {
        test.beforeAll(async ({ browser }) => {});

        for (const country of countries) {
            test.skip(`Create ${country.code} Offers Database`, async ({ page }) => {});
        }
    });
});
