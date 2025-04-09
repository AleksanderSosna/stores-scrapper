import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

import * as types from "../types"
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
        test.skip(`Create ${country.code} Offers Database`, async ({ page }) => {
            const countryCodes = countries.map((country) => {
                return country.code;
            });
            const filteredCountryCodes = countryCodes.filter((code) => {
                return code !== country.code;
            });
            const exchangeRates = {};
            for (const filteredCountryCode of filteredCountryCodes) {
                exchangeRates[shared.currencies[filteredCountryCode]] = await shared.getExchangeRate(shared.currencies[filteredCountryCode], country.currency);
            }

            try {
                const files = await fs.promises.readdir(path.resolve("website/api/ikea/products"));
                for (const file of files) {
                    const filePath = path.join("website/api/ikea/products", file);
                    const product: types.Product = JSON.parse((await fs.promises.readFile(path.resolve(filePath))).toString());
                    if (!product.prices[country.code]) {
                        continue;
                    }
                    const price = product.prices[country.code].price;

                    let bestValue = 0;
                    let bestDiscount = 0;
                    for (const filteredCountryCode of filteredCountryCodes) {
                        if (!product.prices[filteredCountryCode]) {
                            continue;
                        }
                        const convertedPrice = product.prices[filteredCountryCode].price * exchangeRates[shared.currencies[filteredCountryCode]];
                        
                        bestValue = convertedPrice - price > bestValue ? convertedPrice - price : bestValue;
                        bestDiscount = 1 - price / convertedPrice > bestDiscount ? 1 - price / convertedPrice : bestDiscount;
                    }

                    if (bestValue === 0 || bestDiscount === 0) {
                        continue;
                    }

                    const offer = {
                        id: product.id,
                        itemNo: product.itemNo,
                        name: product.name,
                        imageUrl: product.imageUrl,
                        urls: product.urls,
                        prices: product.prices,
                        bestDiscount: bestDiscount,
                        bestValue: bestValue,
                        worstPrice: price + bestValue,
                    };

                    const offers: types.Offers = await shared.readJson("website/api/offers", "best");

                    if (offers[country.code].byDiscount.length < 10) {
                        offers[country.code].byDiscount.push(offer);
                    } else {
                        const discounts = offers[country.code].byDiscount.map((offer) => {
                            return offer.bestDiscount;
                        });
                        const minDiscount = Math.min(...discounts);
                        if (bestDiscount > minDiscount) {
                            const index = discounts.indexOf(minDiscount);
                            offers[country.code].byDiscount[index] = offer;
                        }
                    }

                    if (offers[country.code].byValue.length < 10) {
                        offers[country.code].byValue.push(offer);
                    } else {
                        const values = offers[country.code].byValue.map((offer) => {
                            return offer.bestValue;
                        });
                        const minValue = Math.min(...values);
                        if (bestValue > minValue) {
                            const index = values.indexOf(minValue);
                            offers[country.code].byValue[index] = offer;
                        }
                    }

                    await shared.writeJsonToFile(JSON.stringify(offers), { directory: "website/api/offers", fileName: "best" });
                }
            } catch (err) {
                if (process.env.SURPRESS_ERRORS !== "true") {
                    console.log(err);
                }
            }
        });
    }
});