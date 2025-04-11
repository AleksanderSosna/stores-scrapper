import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

import * as types from "../types";
import { Shared } from "@page-objects/shared";
import { Ecco } from "@page-objects/ecco";
import countries from "@api/countries.json" assert { type: "json" };

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

                await page.goto(`https://${country.code}.ecco.com/${ecco.countryCodeAndLanguageCodeForCountryCode(country.code)}`);
                await ecco.declineCookies.click();

                const categoryLocators = await ecco.categories.all();
                categoryLocators.length = categoryLocators.length - 1;
                for (const categoryLocator of categoryLocators) {
                    let href = await categoryLocator.getAttribute("href");
                    href = href
                        .replace("ę", "%C4%99")
                        .replace("ł", "%C5%82")
                        .replace("ó", "%C3%B3")
                        .replace("ś", "%C5%9B")
                        .replace("ż", "%C5%BC")
                        .replace("ź", "%C5%BA")
                        .replace("ń", "%C5%84")
                        .replace("ć", "%C4%87")
                        .replace("ą", "%C4%85")
                        .replace("Ž", "%C5%BD")
                        .replace("Č", "%C4%8C")
                        .replace("š", "%C5%A1")
                        .replace("ž", "%C5%BE")
                        .replace("ě", "%C4%9B")
                        .replace("č", "%C4%8D")
                        .replace("ř", "%C5%99")
                        .replace("ý", "%C3%BD")
                        .replace("á", "%C3%A1")
                        .replace("í", "%C3%AD")
                        .replace("é", "%C3%A9")
                        .replace("ú", "%C3%BA")
                        .replace("ů", "%C5%AF")
                        .replace("ď", "%C4%8F")
                        .replace("ť", "%C5%A5")
                        .replace("ň", "%C5%88");
                    const [response] = await Promise.all([shared.getResponse([`https://${country.code}.ecco.com${href}`], { timeout: 20 * 1000 }), categoryLocator.click()]);
                    const responseText = await response.text();
                    const searchCategoryId = responseText.match(/this\.searchCategory\s*=\s*"(.*?)";/)[1];
                    const index = categories.findIndex((category) => category.id === searchCategoryId);

                    if (index !== -1) {
                        categories[index].names[country.code] = { name: href };
                    } else {
                        categories.push({ id: searchCategoryId, names: { [country.code]: { name: href } } });
                    }
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
            test(`Create ${country.code} Products Database`, async ({ request }) => {
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
                let productIds: string[] = [];
                for (const category of categories) {
                    let pages = 1;
                    for (let i = 1; i <= pages; i++) {
                        const response = await request.get(`https://${country.code}.ecco.com/search/find/`, {
                            params: {
                                page: 1,
                                definitionId: "",
                                facets: "",
                                sortField: "",
                                sortDirection: "",
                                currentCategoryId: category.id,
                                currentItemId: category.id,
                                includePromotion: false,
                                pageSize: "",
                                searchText: "",
                                excludeSoldOutProducts: true,
                                useLanguageInProductLink: true,
                                offset: (i - 1) * 90,
                                layoutColumnsCount: 5,
                            },
                        });
                        const data = await response.json();
                        pages = data.PageCount;

                        const regex = new RegExp(`/${ecco.countryCodeAndLanguageCodeForCountryCode(country.code)}/product/(\\d+)/`, "g");
                        const matches = [...data.ResultsHtml.matchAll(regex)];
                        const results = matches.map((match) => match[1]);
                        const uniqueProductIds = [...new Set(results)];
                        productIds = productIds.concat(uniqueProductIds);
                    }
                    productIds = [...new Set(productIds)];
                }
                productIds = [...new Set(productIds)];

                for (const productId of productIds) {
                    const response = await request.get(`https://${country.code}.ecco.com/api/dataLayer/getProductData`, {
                        params: {
                            productId: productId,
                        },
                    });
                    const data = await response.json();

                    if (fs.existsSync(path.resolve(`website/api/ecco/products/${data.id}.json`))) {
                        const product: types.Product = await shared.readJson("website/api/ecco/products", data.id);

                        product.urls[country.code] = {
                            url: `https://${country.code}.ecco.com/${ecco.countryCodeAndLanguageCodeForCountryCode(country.code)}/product/${data.id}`,
                        };
                        product.prices[country.code] = {
                            [country.currency]: Number(data.price),
                        };
                        for (const filteredCountryCode of filteredCountryCodes) {
                            product.prices[country.code][shared.currencies[filteredCountryCode]] =
                                product.prices[country.code][country.currency] * exchangeRates[shared.currencies[filteredCountryCode]];
                        }

                        await shared.writeJsonToFile(JSON.stringify(product), { directory: "website/api/ecco/products", fileName: data.id });
                    } else {
                        const product = {
                            id: data.id,
                            itemNo: data.itemNumber,
                            name: data.name,
                            imageUrl: data.src,
                            urls: { [country.code]: { url: `https://${country.code}.ecco.com/${ecco.countryCodeAndLanguageCodeForCountryCode(country.code)}/product/${data.id}` } },
                            prices: {
                                [country.code]: {
                                    [country.currency]: Number(data.price),
                                },
                            },
                        };
                        for (const filteredCountryCode of filteredCountryCodes) {
                            product.prices[country.code][shared.currencies[filteredCountryCode]] =
                                product.prices[country.code][country.currency] * exchangeRates[shared.currencies[filteredCountryCode]];
                        }

                        await shared.writeJsonToFile(JSON.stringify(product), { directory: "website/api/ecco/products", fileName: data.id });
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

                try {
                    const files = await fs.promises.readdir(path.resolve("website/api/ecco/products"));
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

                            bestValue =
                                product.prices[filteredCountryCode][country.currency] - price > bestValue
                                    ? product.prices[filteredCountryCode][country.currency] - price
                                    : 0;

                            bestDiscount = bestValue / (price + bestValue) > bestDiscount ? bestValue / (price + bestValue) : bestDiscount;
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

                        const offers: types.Offers = await shared.readJson("website/api/offers", "ecco");

                        for (const key of Object.keys(offers[country.code])) {
                            const best = key === "byValue" ? bestValue : bestDiscount;
                            const bestKey = key === "byValue" ? "bestValue" : "bestDiscount";

                            if (offers[country.code][key].length < 20) {
                                offers[country.code][key].push(offer);
                            } else {
                                const valuesOrDiscounts = offers[country.code][key].map((offer) => {
                                    if (key === "byValue") {
                                        return offer[bestKey][country.currency];
                                    } else if (key === "byDiscount") {
                                        return offer[bestKey];
                                    }
                                });
                                const minValueOrDiscount = Math.min(...valuesOrDiscounts);
                                if (best > minValueOrDiscount) {
                                    const index = valuesOrDiscounts.indexOf(minValueOrDiscount);
                                    offers[country.code][key][index] = offer;
                                }
                            }

                            offers[country.code][key].sort((a, b) => {
                                if (key === "byValue") {
                                    return b[bestKey][country.currency] - a[bestKey][country.currency];
                                } else if (key === "byDiscount") {
                                    return b[bestKey] - a[bestKey];
                                }
                            });
                        }

                        await shared.writeJsonToFile(JSON.stringify(offers), { directory: "website/api/offers", fileName: "ecco" });
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
