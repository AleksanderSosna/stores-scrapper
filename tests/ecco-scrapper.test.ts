import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

import * as types from "../types";
import { Shared } from "../page-objects/shared";
import { Ecco, type AlgoliaProductHit } from "../page-objects/ecco";
import countries from "../website/api/countries.json" with { type: "json" };

let shared: Shared;
let ecco: Ecco;

test.beforeEach(async ({ page }) => {
    shared = new Shared(page);
    ecco = new Ecco(page);
});

test.describe.configure({ mode: "serial" });
test.describe("Ecco Scrapper", () => {
    test.describe("Categories", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            await shared.writeJsonToFile(JSON.stringify([]), { directory: "website/api/ecco", fileName: "categories" });

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Categories Database`, async ({ page }) => {
                const categories: types.Category[] = await shared.readJson("website/api/ecco", "categories");

                await page.goto(`https://${country.code}.ecco.com/`, { waitUntil: "domcontentloaded" });
                if (await ecco.declineCookies.isVisible()) {
                    await ecco.declineCookies.click();
                }

                const categoryLinks = await ecco.categories.all();
                const categoryListings: Array<{ url: string; name: string }> = [];
                for (const categoryLink of categoryLinks) {
                    const testId = await categoryLink.getAttribute("data-testid");
                    if (!testId?.startsWith("pageProductListingPage") && !testId?.startsWith("pageProductCategoryPage")) {
                        continue;
                    }

                    const href = await categoryLink.getAttribute("href");
                    if (!href) {
                        continue;
                    }
                    categoryListings.push({
                        url: new URL(href, page.url()).href,
                        name: (await categoryLink.innerText()).split("\n")[0].trim(),
                    });
                }

                let categoriesFound = 0;
                for (const categoryListing of categoryListings) {
                    const searchResponsePromise = ecco.waitForCategorySearch(country.code);
                    await page.goto(categoryListing.url, { waitUntil: "domcontentloaded" });
                    const searchResponse = await searchResponsePromise;
                    const query = ecco.getProductQuery(searchResponse, country.code);
                    const categoryId = ecco.getCategoryId(query);
                    const index = categories.findIndex((category) => category.id === categoryId);

                    if (index !== -1) {
                        categories[index].names[country.code] = { name: categoryListing.name, url: categoryListing.url };
                    } else {
                        categories.push({ id: categoryId, names: { [country.code]: { name: categoryListing.name, url: categoryListing.url } } });
                    }
                    categoriesFound++;
                }

                if (categoriesFound === 0) {
                    throw new Error(`No ECCO product categories were found for ${country.code}`);
                }

                await shared.writeJsonToFile(JSON.stringify(categories), { directory: "website/api/ecco", fileName: "categories" });
            });
        }
    });

    test.describe("Products", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            await shared.deleteAllFilesFromDirectory("./website/api/ecco/products");

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Products Database`, async ({ page }) => {
                const countryCodes = countries.map((country) => {
                    return country.code;
                });
                const filteredCountryCodes = countryCodes.filter((code) => {
                    return code !== country.code;
                });
                const exchangeRates = {};
                for (const filteredCountryCode of filteredCountryCodes) {
                    exchangeRates[shared.currencies[filteredCountryCode]] = await shared.getExchangeRate(country.currency, shared.currencies[filteredCountryCode]);
                }

                const categories: types.Category[] = await shared.readJson("website/api/ecco", "categories");
                const products = new Map<string, types.Product>();
                const productDirectory = path.resolve("website/api/ecco/products");
                for (const fileName of await fs.promises.readdir(productDirectory)) {
                    if (!fileName.endsWith(".json")) {
                        continue;
                    }
                    const product = JSON.parse((await fs.promises.readFile(path.join(productDirectory, fileName))).toString()) as types.Product;
                    products.set(product.id, product);
                }

                const hitsById = new Map<string, AlgoliaProductHit>();
                for (const category of categories) {
                    const categoryUrl = category.names[country.code]?.url;
                    if (!categoryUrl) {
                        throw new Error(`Missing ${country.code} listing URL for ECCO category "${category.id}"`);
                    }

                    const searchResponsePromise = ecco.waitForCategorySearch(country.code);
                    await page.goto(categoryUrl, { waitUntil: "domcontentloaded" });
                    const searchResponse = await searchResponsePromise;
                    const query = ecco.getProductQuery(searchResponse, country.code);
                    if (ecco.getCategoryId(query) !== category.id) {
                        throw new Error(`ECCO category "${category.id}" did not match the listing query for ${categoryUrl}`);
                    }
                    for (const hit of await ecco.getCategoryProducts(searchResponse, query)) {
                        hitsById.set(hit.objectID, hit);
                    }
                }

                for (const hit of hitsById.values()) {
                    const imageUrl = ecco.getProductImage(hit);
                    if (!hit.objectID || !hit.articleNumber || !hit.colorCode || !hit.name || !imageUrl || !hit.priceRaw) {
                        throw new Error(`ECCO product search returned incomplete product data: ${JSON.stringify(hit)}`);
                    }

                    const productPrice = hit.priceRaw.centAmount / 10 ** hit.priceRaw.fractionDigits;
                    const product = products.get(hit.objectID) ?? {
                        id: hit.objectID,
                        itemNo: hit.objectID,
                        name: hit.name,
                        imageUrl,
                        urls: {},
                        prices: {},
                    };

                    product.name = hit.name;
                    product.imageUrl = imageUrl;
                    product.urls[country.code] = { url: ecco.getProductUrl(country.code, hit) };
                    product.prices[country.code] = { [country.currency]: productPrice };
                    for (const filteredCountryCode of filteredCountryCodes) {
                        const currency = shared.currencies[filteredCountryCode];
                        product.prices[country.code][currency] = productPrice * exchangeRates[currency];
                    }
                    products.set(product.id, product);
                }

                for (const hit of hitsById.values()) {
                    const product = products.get(hit.objectID);
                    if (!product) {
                        throw new Error(`ECCO product "${hit.objectID}" was not added to the product database`);
                    }
                    await fs.promises.writeFile(path.join(productDirectory, `${hit.objectID}.json`), JSON.stringify(product));
                }
            });
        }
    });

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

            await shared.writeJsonToFile(JSON.stringify(offerObject), { directory: "website/api/offers", fileName: "ecco" });

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Offers Database`, async ({ page }) => {
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

                const files = await fs.promises.readdir(path.resolve("website/api/ecco/products"));
                const offers: types.Offers = await shared.readJson("website/api/offers", "ecco");
                for (const file of files) {
                    const filePath = path.join("website/api/ecco/products", file);
                    const product: types.Product = JSON.parse((await fs.promises.readFile(path.resolve(filePath))).toString());
                    if (!product.prices[country.code]) {
                        continue;
                    }
                    const price = product.prices[country.code][country.currency];

                    let bestValue = 0;
                    let bestDiscount = 0;
                    for (const filteredCountryCode of filteredCountryCodes) {
                        if (!product.prices[filteredCountryCode]) {
                            continue;
                        }

                        const value = product.prices[filteredCountryCode][country.currency] - price;
                        bestValue = Math.max(bestValue, value);
                        bestDiscount = Math.max(bestDiscount, bestValue / (price + bestValue));
                    }

                    if (bestValue === 0 || bestDiscount === 0) {
                        continue;
                    }

                    const offer: types.Offer = {
                        id: product.id,
                        itemNo: product.itemNo,
                        name: product.name,
                        imageUrl: product.imageUrl,
                        urls: product.urls,
                        prices: product.prices,
                        bestDiscount: bestDiscount,
                        bestValue: { [country.currency]: bestValue },
                        worstPrice: { [country.currency]: price + bestValue },
                    };

                    for (const otherCurrency of filteredCountryCodes.map((code) => shared.currencies[code])) {
                        offer["bestValue"][otherCurrency] = bestValue / exchangeRates[otherCurrency];
                        offer["worstPrice"][otherCurrency] = (price + bestValue) / exchangeRates[otherCurrency];
                    }

                    for (const key of Object.keys(offers[country.code])) {
                        const best = key === "byValue" ? bestValue : bestDiscount;
                        const bestKey = key === "byValue" ? "bestValue" : "bestDiscount";

                        if (offers[country.code][key].length < 20) {
                            offers[country.code][key].push(offer);
                        } else {
                            const valuesOrDiscounts = offers[country.code][key].map((existingOffer) => {
                                return key === "byValue" ? existingOffer[bestKey][country.currency] : existingOffer[bestKey];
                            });
                            const minValueOrDiscount = Math.min(...valuesOrDiscounts);
                            if (best > minValueOrDiscount) {
                                const index = valuesOrDiscounts.indexOf(minValueOrDiscount);
                                offers[country.code][key][index] = offer;
                            }
                        }

                        offers[country.code][key].sort((firstOffer, secondOffer) => {
                            return key === "byValue"
                                ? secondOffer[bestKey][country.currency] - firstOffer[bestKey][country.currency]
                                : secondOffer[bestKey] - firstOffer[bestKey];
                        });
                    }
                }

                await shared.writeJsonToFile(JSON.stringify(offers), { directory: "website/api/offers", fileName: "ecco" });
            });
        }
    });
});
