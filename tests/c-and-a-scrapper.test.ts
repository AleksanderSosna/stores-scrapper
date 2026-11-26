import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

import * as types from "../types";
import { CAndA } from "../page-objects/c-and-a";
import { Shared } from "../page-objects/shared";
import countries from "../website/api/countries.json" with { type: "json" };

let shared: Shared;
let cAndA: CAndA;

test.beforeEach(async ({ page }) => {
    shared = new Shared(page);
    cAndA = new CAndA(page);
});

test.describe.configure({ mode: "serial" });
test.describe("C&A Scrapper", () => {
    test.describe("Categories", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            await shared.writeJsonToFile(JSON.stringify([]), { directory: "website/api/c-and-a", fileName: "categories" });

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Categories Database`, async ({ page }) => {
                const categories: types.Category[] = await shared.readJson("website/api/c-and-a", "categories");
                const storefrontUrl = cAndA.getStorefrontUrl(country.code);
                const storefrontResponse = await page.goto(storefrontUrl, { waitUntil: "domcontentloaded" });
                if (!storefrontResponse?.ok()) {
                    throw new Error(`C&A storefront failed to load for ${country.code}`);
                }

                const storefrontHtml = await storefrontResponse.text();
                const departmentUrls = await cAndA.getDepartmentUrls(country.code);
                const rootNavigations = await Promise.all(
                    departmentUrls.map(async (departmentUrl) => {
                        const departmentResponse = departmentUrl === storefrontUrl ? storefrontResponse : await page.request.get(departmentUrl);
                        if (!departmentResponse.ok()) {
                            throw new Error(`C&A department page failed to load: ${departmentUrl} (${departmentResponse.status()})`);
                        }

                        const departmentHtml = departmentUrl === storefrontUrl ? storefrontHtml : await departmentResponse.text();
                        const navigation = cAndA.getNavigationFromHtml(departmentHtml);
                        if (!navigation) {
                            throw new Error(`C&A department page returned no category navigation: ${departmentUrl}`);
                        }
                        return navigation;
                    })
                );

                const nodesById = new Map<string, { node: { ipimId: string; name: string; slug: string }; url: string }>();
                const queuedIds = new Set<string>();
                const pendingNodes: Array<{ ipimId: string; name: string; slug: string }> = [];
                const enqueueNode = (node: { ipimId: string; name: string; slug: string }) => {
                    const categoryUrl = cAndA.getCategoryUrl(country.code, node);
                    if (!categoryUrl) {
                        return;
                    }

                    nodesById.set(node.ipimId, { node, url: categoryUrl });
                    if (!queuedIds.has(node.ipimId)) {
                        queuedIds.add(node.ipimId);
                        pendingNodes.push(node);
                    }
                };

                for (const navigation of rootNavigations) {
                    for (const node of [...navigation.children, ...navigation.siblings]) {
                        enqueueNode(node);
                    }
                }

                const apiConcurrency = 4;
                while (pendingNodes.length > 0) {
                    const batch = pendingNodes.splice(0, apiConcurrency);
                    const navigations = await Promise.all(
                        batch.map((node) => {
                            const categoryUrl = nodesById.get(node.ipimId)?.url;
                            if (!categoryUrl) {
                                throw new Error(`Missing C&A category URL for "${node.ipimId}"`);
                            }
                            return cAndA.getCategoryNavigation(country.code, node, categoryUrl);
                        })
                    );

                    for (const navigation of navigations) {
                        enqueueNode(navigation.current);
                        for (const node of [...navigation.children, ...navigation.siblings]) {
                            enqueueNode(node);
                        }
                    }
                }

                if (nodesById.size === 0) {
                    throw new Error(`No C&A product categories were found for ${country.code}`);
                }

                for (const { node, url } of nodesById.values()) {
                    const existingCategory = categories.find((category) => category.id === node.ipimId);
                    if (existingCategory) {
                        existingCategory.names[country.code] = { name: node.name, url };
                    } else {
                        categories.push({
                            id: node.ipimId,
                            names: { [country.code]: { name: node.name, url } },
                        });
                    }
                }

                await shared.writeJsonToFile(JSON.stringify(categories), { directory: "website/api/c-and-a", fileName: "categories" });
            });
        }
    });

    test.describe("Products", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            shared = new Shared(page);

            await shared.deleteAllFilesFromDirectory("./website/api/c-and-a/products");

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Products Database`, async ({ page }) => {
                const countryCodes = countries.map((storeCountry) => storeCountry.code);
                const otherCountryCodes = countryCodes.filter((code) => code !== country.code);
                const exchangeRates = {};
                for (const otherCountryCode of otherCountryCodes) {
                    exchangeRates[shared.currencies[otherCountryCode]] = await shared.getExchangeRate(country.currency, shared.currencies[otherCountryCode]);
                }

                const categories: types.Category[] = await shared.readJson("website/api/c-and-a", "categories");
                const productRootCategories = cAndA.getProductRootCategories(categories, country.code);
                if (productRootCategories.length === 0) {
                    throw new Error(`No C&A product categories were available for ${country.code}`);
                }

                const products = new Map<string, types.Product>();
                const productDirectory = path.resolve("website/api/c-and-a/products");
                for (const fileName of await fs.promises.readdir(productDirectory)) {
                    if (!fileName.endsWith(".json")) {
                        continue;
                    }
                    const product = JSON.parse((await fs.promises.readFile(path.join(productDirectory, fileName))).toString()) as types.Product;
                    products.set(product.id, product);
                }

                const storefrontResponse = await page.goto(cAndA.getStorefrontUrl(country.code), { waitUntil: "domcontentloaded" });
                if (!storefrontResponse?.ok()) {
                    throw new Error(`C&A storefront failed to load for ${country.code}`);
                }

                let nextCategoryIndex = 0;
                let pagesProcessed = 0;
                let emptyRootCategories = 0;
                const countryProductIds = new Set<string>();
                const productsPerApiPage = 60;
                const processCategories = async () => {
                    while (nextCategoryIndex < productRootCategories.length) {
                        const category = productRootCategories[nextCategoryIndex++];
                        let pageNumber = 0;
                        while (true) {
                            const productPage = await cAndA.getCategoryProductPage(country.code, category.id, category.url, pageNumber);
                            pagesProcessed++;
                            if (productPage.products.length === 0) {
                                if (pageNumber === 0 && productPage.productCount > 0) {
                                    emptyRootCategories++;
                                }
                                break;
                            }

                            for (const listing of productPage.products) {
                                if (listing.currency !== country.currency) {
                                    throw new Error(`C&A product "${listing.id}" returned unexpected currency "${listing.currency}" for ${country.code}`);
                                }

                                const product = products.get(listing.id) ?? {
                                    id: listing.id,
                                    itemNo: listing.id,
                                    name: listing.name,
                                    imageUrl: listing.imageUrl,
                                    urls: {},
                                    prices: {},
                                };

                                product.name = listing.name;
                                product.imageUrl = listing.imageUrl;
                                product.urls[country.code] = { url: listing.href };
                                product.prices[country.code] = { [country.currency]: listing.price };
                                for (const otherCountryCode of otherCountryCodes) {
                                    const currency = shared.currencies[otherCountryCode];
                                    product.prices[country.code][currency] = listing.price * exchangeRates[currency];
                                }
                                products.set(listing.id, product);
                                countryProductIds.add(listing.id);
                            }

                            if (pagesProcessed % 50 === 0) {
                                console.log(`C&A ${country.code}: processed ${pagesProcessed} product API pages (${countryProductIds.size} unique products)`);
                            }

                            const declaredPageCount = Math.ceil(productPage.productCount / productsPerApiPage);
                            if (pageNumber + 1 >= declaredPageCount || (pageNumber > 0 && productPage.products.length < productsPerApiPage)) {
                                break;
                            }
                            pageNumber++;
                        }
                    }
                };
                await Promise.all(Array.from({ length: 4 }, () => processCategories()));

                if (countryProductIds.size === 0) {
                    throw new Error(`No C&A products were returned for ${country.code}`);
                }
                if (emptyRootCategories > 0) {
                    console.log(`C&A ${country.code}: skipped ${emptyRootCategories} non-list category roots`);
                }

                for (const product of products.values()) {
                    if (!product.prices[country.code]) {
                        continue;
                    }
                    await fs.promises.writeFile(path.join(productDirectory, `${product.id}.json`), JSON.stringify(product));
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

            await shared.writeJsonToFile(JSON.stringify(offerObject), { directory: "website/api/offers", fileName: "c-and-a" });

            await page.close();
        });

        for (const country of countries) {
            test(`Create ${country.code} Offers Database`, async ({ page }) => {
                const countryCodes = countries.map((storeCountry) => storeCountry.code);
                const otherCountryCodes = countryCodes.filter((code) => code !== country.code);
                const exchangeRates = {};
                for (const otherCountryCode of otherCountryCodes) {
                    exchangeRates[shared.currencies[otherCountryCode]] = await shared.getExchangeRate(shared.currencies[otherCountryCode], country.currency);
                }

                const files = await fs.promises.readdir(path.resolve("website/api/c-and-a/products"));
                const offers: types.Offers = await shared.readJson("website/api/offers", "c-and-a");
                for (const file of files) {
                    const filePath = path.join("website/api/c-and-a/products", file);
                    const product: types.Product = JSON.parse((await fs.promises.readFile(path.resolve(filePath))).toString());
                    if (!product.prices[country.code]) {
                        continue;
                    }

                    const price = product.prices[country.code][country.currency];
                    let bestValue = 0;
                    let bestDiscount = 0;
                    for (const otherCountryCode of otherCountryCodes) {
                        if (!product.prices[otherCountryCode]) {
                            continue;
                        }

                        const value = product.prices[otherCountryCode][country.currency] - price;
                        bestValue = Math.max(bestValue, value);
                        bestDiscount = Math.max(bestDiscount, bestValue / (price + bestValue));
                    }

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
                    for (const otherCurrency of otherCountryCodes.map((code) => shared.currencies[code])) {
                        offer.bestValue[otherCurrency] = bestValue / exchangeRates[otherCurrency];
                        offer.worstPrice[otherCurrency] = (price + bestValue) / exchangeRates[otherCurrency];
                    }

                    for (const key of Object.keys(offers[country.code])) {
                        const bestKey = key === "byValue" ? "bestValue" : "bestDiscount";
                        const best = key === "byValue" ? bestValue : bestDiscount;
                        if (offers[country.code][key].length < 50) {
                            offers[country.code][key].push(offer);
                        } else {
                            const values = offers[country.code][key].map((existingOffer) => {
                                return key === "byValue" ? existingOffer[bestKey][country.currency] : existingOffer[bestKey];
                            });
                            const minimum = Math.min(...values);
                            if (best > minimum) {
                                offers[country.code][key][values.indexOf(minimum)] = offer;
                            }
                        }

                        offers[country.code][key].sort((firstOffer, secondOffer) => {
                            return key === "byValue" ? secondOffer[bestKey][country.currency] - firstOffer[bestKey][country.currency] : secondOffer[bestKey] - firstOffer[bestKey];
                        });
                    }
                }

                await shared.writeJsonToFile(JSON.stringify(offers), { directory: "website/api/offers", fileName: "c-and-a" });
            });
        }
    });
});
