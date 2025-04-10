import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

import * as types from "../types"
import { Shared } from "@page-objects/shared";
import { Ikea } from "@page-objects/ikea";
import countries from "@api/countries.json" assert { type: "json" };

let shared: Shared;
let ikea: Ikea;

test.beforeEach(async ({ page }) => {
    shared = new Shared(page);
    ikea = new Ikea(page);
});

test.describe.configure({ mode: "serial" });
test.describe("Ikea Scrapper", () => {
    test.describe("Categories", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            await shared.writeJsonToFile(JSON.stringify([]), { directory: "website/api/ikea", fileName: "categories" });

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Categories Database`, async ({ page }) => {
                const categories: types.Category[] = await shared.readJson("website/api/ikea", "categories");

                await page.goto(`https://www.ikea.com${ikea.countryCodeAndLanguageCodeForCountryCode(country.code)}/cat/produkty-products/`, { waitUntil: "networkidle" });

                const seeAllInCategoryLinksLocators = await ikea.seeAllInCategoryLinks.all();
                for (const seeAllInCategoryLinkLocator of seeAllInCategoryLinksLocators) {
                    const hrefAttribute = await seeAllInCategoryLinkLocator.getAttribute("href");
                    const category = hrefAttribute.split("/")[hrefAttribute.split("/").length - 2];
                    const categoryName = category.split(`-${category.split("-").pop()}`)[0];
                    const categoryKey = category.split("-").pop();
                    const index = categories.findIndex((category) => category.id === categoryKey);

                    if (index !== -1) {
                        categories[index].names[country.code] = { name: categoryName };
                    } else {
                        categories.push({ id: categoryKey, names: { [country.code]: { name: categoryName } } });
                    }
                }

                await shared.writeJsonToFile(JSON.stringify(categories), { directory: "website/api/ikea", fileName: "categories" });
            });
        }
    });

    test.describe("Products", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            await shared.deleteAllFilesFromDirectory("./website/api/ikea/products");

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Products Database`, async ({ page }) => {
                const categories: types.Category[] = await shared.readJson("website/api/ikea", "categories");

                for (const category of categories) {
                    let productsFromResponse = [];
                    let offset = 0;
                    do {
                        var response = await ikea.getProducts(country.code, category.id, { start: offset, end: offset + 1000 });
                        productsFromResponse = productsFromResponse.concat(response.moreProducts.productWindow);

                        offset += 1000;
                    } while (response.moreProducts.productWindow.length !== 0);

                    for (const productFromResponse of productsFromResponse) {
                        if (fs.existsSync(path.resolve(`website/api/ikea/products/${productFromResponse.id}.json`))) {
                            const product: {
                                id: string;
                                itemNo: string;
                                name: string;
                                imageUrl: string;
                                urls: { [countryCode: string]: { url: string } };
                                prices: { [countryCode: string]: { currencyCode: string; price: number } };
                            } = await shared.readJson("website/api/ikea/products", productFromResponse.id);

                            product.urls[country.code] = {
                                url: productFromResponse.pipUrl,
                            };
                            product.prices[country.code] = {
                                currencyCode: productFromResponse.salesPrice.currencyCode,
                                price: productFromResponse.salesPrice.numeral,
                            };

                            await shared.writeJsonToFile(JSON.stringify(product), { directory: "website/api/ikea/products", fileName: productFromResponse.id });
                        } else {
                            const product = {
                                id: productFromResponse.id,
                                itemNo: productFromResponse.itemNo,
                                name: productFromResponse.name,
                                imageUrl: productFromResponse.mainImageUrl,
                                urls: {
                                    [country.code]: {
                                        url: productFromResponse.pipUrl,
                                    },
                                },
                                prices: {
                                    [country.code]: {
                                        currencyCode: productFromResponse.salesPrice.currencyCode,
                                        price: productFromResponse.salesPrice.numeral,
                                    },
                                },
                            };

                            await shared.writeJsonToFile(JSON.stringify(product), { directory: "website/api/ikea/products", fileName: productFromResponse.id });
                        }
                    }
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

            await shared.writeJsonToFile(JSON.stringify(offerObject), { directory: "website/api/offers", fileName: "ikea" });

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

                        const offers: types.Offers = await shared.readJson("website/api/offers", "ikea");

                        for (const key of Object.keys(offers[country.code])) {
                            const best = key === "bestValue" ? bestValue : bestDiscount;

                            if (offers[country.code][key].length < 20) {
                                offers[country.code][key].push(offer);
                            } else {
                                const valuesOrDiscounts = offers[country.code][key].map((offer) => {
                                    return offer[key];
                                });
                                const minDiscount = Math.min(...valuesOrDiscounts);
                                if (best > minDiscount) {
                                    const index = valuesOrDiscounts.indexOf(minDiscount);
                                    offers[country.code][key][index] = offer;
                                }
                            }

                            offers[country.code][key].sort((a, b) => {
                                return b[key] - a[key];
                            });
                        }

                        await shared.writeJsonToFile(JSON.stringify(offers), { directory: "website/api/offers", fileName: "ikea" });
                    }
                } catch (err) {
                    if (process.env.SURPRESS_ERRORS !== "true") {
                        console.log(err);
                    }
                }
            });
        }
    });
});
