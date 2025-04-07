import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

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
                const categories: Array<{ id: string; names: { [countryCode: string]: { name: string } } }> = await shared.readJson("website/api/ikea", "categories");

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
                const categories: Array<{ id: string; names: Array<{ countryCode: string; name: string }> }> = await shared.readJson("website/api/ikea", "categories");

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
});
