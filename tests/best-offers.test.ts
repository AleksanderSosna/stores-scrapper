import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

import * as types from "../types";
import { Shared } from "@page-objects/shared";
import countries from "@api/countries.json" assert { type: "json" };

let shared: Shared;

test.beforeEach(async ({ page }) => {
    shared = new Shared(page);
});

test.describe.configure({ mode: "serial" });
test.describe("Offers", () => {
    test.beforeAll(async ({ browser }) => {
        const page = await browser.newPage();
        shared = new Shared(page);

        const offerObject = {};
        for (const country of countries) {
            offerObject[country.code] = {
                byValue: [],
                byDiscount: [],
            };
        }

        await shared.writeJsonToFile(JSON.stringify(offerObject), { directory: "website/api/offers", fileName: "best" });

        await page.close();
    });

    for (const country of countries) {
        test(`Create ${country.code} Best Offers Database`, async ({ page }) => {
            try {
                const bestOffers: types.Offers = await shared.readJson("website/api/offers", "best");

                const files = await fs.promises.readdir(path.resolve("website/api/offers"));
                for (const file of files) {
                    if (file === "best.json") {
                        continue;
                    }

                    const filePath = path.join("website/api/offers", file);
                    const offers: types.Offers = JSON.parse((await fs.promises.readFile(path.resolve(filePath))).toString());

                    for (const key of Object.keys(offers[country.code])) {
                        bestOffers[country.code][key].push(...offers[country.code][key]);

                        bestOffers[country.code][key].sort((a, b) => {
                            return b.bestDiscount - a.bestDiscount;
                        });

                        bestOffers[country.code][key].length = 20;
                    }

                    await shared.writeJsonToFile(JSON.stringify(bestOffers), { directory: "website/api/offers", fileName: "best" });
                }
            } catch (err) {
                if (process.env.SURPRESS_ERRORS !== "true") {
                    console.log(err);
                }
            }
        });
    }
});
