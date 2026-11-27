import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

import * as types from "../types";
import { Deichmann } from "../page-objects/deichmann";
import { Shared } from "../page-objects/shared";
import countries from "../website/api/countries.json" with { type: "json" };

let shared: Shared;
let deichmann: Deichmann;

test.beforeEach(async ({ page }) => {
    shared = new Shared(page);
    deichmann = new Deichmann(page);
});

test.describe.configure({ mode: "serial" });
test.describe("Deichmann Scrapper", () => {
    test.describe("Categories", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            await shared.writeJsonToFile(JSON.stringify([]), { directory: "website/api/deichmann", fileName: "categories" });

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Categories Database`, async () => {
                const categories: types.Category[] = await shared.readJson("website/api/deichmann", "categories");

                await deichmann.openStorefront(country.code);
                for (const categoryLink of await deichmann.getCategoryLinks(country.code)) {
                    const index = categories.findIndex((category) => category.id === categoryLink.id);
                    if (index === -1) {
                        categories.push({
                            id: categoryLink.id,
                            names: { [country.code]: { name: categoryLink.name, url: categoryLink.url } },
                        });
                    } else {
                        categories[index].names[country.code] = { name: categoryLink.name, url: categoryLink.url };
                    }
                }

                await shared.writeJsonToFile(JSON.stringify(categories), { directory: "website/api/deichmann", fileName: "categories" });
            });
        }
    });

    test.describe("Products", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            await shared.deleteAllFilesFromDirectory("./website/api/deichmann/products");

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Products Database`, async ({ page }) => {
                test.setTimeout(45 * 60 * 1000);

                const countryCodes = countries.map((market) => market.code);
                const otherCountryCodes = countryCodes.filter((code) => code !== country.code);
                const exchangeRates: Record<string, number> = {};
                for (const otherCountryCode of otherCountryCodes) {
                    const currency = shared.currencies[otherCountryCode];
                    exchangeRates[currency] = await shared.getExchangeRate(country.currency, currency);
                }

                const categories: types.Category[] = await shared.readJson("website/api/deichmann", "categories");
                await deichmann.openStorefront(country.code);
                const productDirectory = path.resolve("website/api/deichmann/products");
                const products = new Map<string, types.Product>();
                for (const fileName of await fs.promises.readdir(productDirectory)) {
                    if (!fileName.endsWith(".json")) {
                        continue;
                    }

                    const product = JSON.parse((await fs.promises.readFile(path.join(productDirectory, fileName))).toString()) as types.Product;
                    products.set(product.id, product);
                }

                let categoryCount = 0;
                let productCount = 0;
                for (const category of categories) {
                    let pageUrl = category.names[country.code]?.url;
                    if (!pageUrl) {
                        continue;
                    }

                    const visitedPages = new Set<string>();
                    while (pageUrl) {
                        if (visitedPages.has(pageUrl)) {
                            throw new Error(`Deichmann repeated a product page for category ${category.id}: ${pageUrl}`);
                        }
                        visitedPages.add(pageUrl);

                        await deichmann.openCategoryPage(pageUrl);
                        await deichmann.dismissCookieDialog();
                        if (!(await deichmann.hasCategoryResults())) {
                            delete category.names[country.code];
                            break;
                        }
                        categoryCount++;

                        for (const listing of await deichmann.getProductsFromPage()) {
                            productCount++;
                            const product = products.get(listing.id) ?? {
                                id: listing.id,
                                itemNo: listing.itemNo,
                                name: listing.name,
                                imageUrl: listing.imageUrl,
                                urls: {},
                                prices: {},
                            };

                            product.name = listing.name;
                            product.imageUrl = listing.imageUrl;
                            product.urls[country.code] = { url: listing.url };
                            product.prices[country.code] = { [country.currency]: listing.price };
                            for (const otherCountryCode of otherCountryCodes) {
                                const currency = shared.currencies[otherCountryCode];
                                product.prices[country.code][currency] = listing.price * exchangeRates[currency];
                            }
                            products.set(product.id, product);
                        }

                        pageUrl = await deichmann.getNextPageUrl();
                    }
                }

                if (categoryCount === 0 || productCount === 0) {
                    throw new Error(`No Deichmann products were collected for ${country.code}`);
                }

                await fs.promises.mkdir(productDirectory, { recursive: true });
                for (const product of products.values()) {
                    await fs.promises.writeFile(path.join(productDirectory, `${product.id}.json`), JSON.stringify(product));
                }
                await shared.writeJsonToFile(JSON.stringify(categories.filter((category) => Object.keys(category.names).length > 0)), {
                    directory: "website/api/deichmann",
                    fileName: "categories",
                });
            });
        }
    });

    test.describe("Offers", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            const offerObject: types.Offers = {};
            for (const country of countries) {
                offerObject[country.code] = { byValue: [], byDiscount: [] };
            }

            await shared.writeJsonToFile(JSON.stringify(offerObject), { directory: "website/api/offers", fileName: "deichmann" });

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Offers Database`, async () => {
                const otherCountryCodes = countries.map((market) => market.code).filter((code) => code !== country.code);
                const exchangeRates: Record<string, number> = {};
                for (const otherCountryCode of otherCountryCodes) {
                    const currency = shared.currencies[otherCountryCode];
                    exchangeRates[currency] = await shared.getExchangeRate(currency, country.currency);
                }

                const offers: types.Offers = await shared.readJson("website/api/offers", "deichmann");
                const productDirectory = path.resolve("website/api/deichmann/products");
                for (const fileName of await fs.promises.readdir(productDirectory)) {
                    if (!fileName.endsWith(".json")) {
                        continue;
                    }

                    const product = JSON.parse((await fs.promises.readFile(path.join(productDirectory, fileName))).toString()) as types.Product;
                    const countryPrices = product.prices[country.code];
                    const price = countryPrices?.[country.currency];
                    if (price === undefined) {
                        continue;
                    }

                    let bestValue = 0;
                    for (const otherCountryCode of otherCountryCodes) {
                        const otherPrice = product.prices[otherCountryCode]?.[country.currency];
                        if (otherPrice !== undefined) {
                            bestValue = Math.max(bestValue, otherPrice - price);
                        }
                    }
                    const bestDiscount = bestValue / (price + bestValue);
                    if (bestValue <= 0 || bestDiscount <= 0) {
                        continue;
                    }

                    const offer: types.Offer = {
                        id: product.id,
                        itemNo: product.itemNo,
                        name: product.name,
                        imageUrl: product.imageUrl,
                        urls: product.urls,
                        prices: product.prices,
                        bestDiscount,
                        bestValue: { [country.currency]: bestValue },
                        worstPrice: { [country.currency]: price + bestValue },
                    };
                    for (const currency of otherCountryCodes.map((code) => shared.currencies[code])) {
                        offer.bestValue[currency] = bestValue / exchangeRates[currency];
                        offer.worstPrice[currency] = (price + bestValue) / exchangeRates[currency];
                    }

                    for (const key of ["byValue", "byDiscount"] as const) {
                        const list = offers[country.code][key];
                        const value = key === "byValue" ? bestValue : bestDiscount;
                        const currentValues = list.map((existingOffer) => (key === "byValue" ? existingOffer.bestValue[country.currency] : existingOffer.bestDiscount));

                        if (list.length < 50) {
                            list.push(offer);
                        } else {
                            const minimum = Math.min(...currentValues);
                            if (value > minimum) {
                                list[currentValues.indexOf(minimum)] = offer;
                            }
                        }

                        list.sort((first, second) =>
                            key === "byValue" ? second.bestValue[country.currency] - first.bestValue[country.currency] : second.bestDiscount - first.bestDiscount
                        );
                    }
                }

                await shared.writeJsonToFile(JSON.stringify(offers), { directory: "website/api/offers", fileName: "deichmann" });
            });
        }
    });
});
