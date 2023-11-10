import { test } from "@playwright/test";

import { Ikea } from "@page-objects/ikea";

let ikea: Ikea;

const countryCodes = process.env.COUNTRY_CODES ? JSON.parse(process.env.COUNTRY_CODES) : ["pl"];

test.beforeEach(async ({ page }) => {
    ikea = new Ikea(page);
});

test.describe("Ikea Scrapper", () => {
    test.describe("Categories", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            ikea = new Ikea(page);

            const categories: Array<{ key: string; names: Array<{ countryCode: string; name: string }> }> = [];
            ikea.writeJsonToFile(JSON.stringify(categories), { directory: "website/api/ikea", fileName: "categories" });

            await page.close();
        });

        for (const countryCode of countryCodes) {
            test(`Create ${countryCode} Categories Database`, async ({ page }) => {
                test.slow();

                const categories: Array<{ key: string; names: Array<{ countryCode: string; name: string }> }> = ikea.readJson("website/api/ikea", "categories");

                await page.goto(`${ikea.countryCodeAndLanguageCodeFromCountryCode(countryCode)}/cat/produkty-products/`, { waitUntil: "networkidle" });

                const seeAllInCategoryLinksLocators = await ikea.seeAllInCategoryLinks.all();
                for (const seeAllInCategoryLinkLocator of seeAllInCategoryLinksLocators) {
                    const hrefAttribute = await seeAllInCategoryLinkLocator.getAttribute("href");
                    const category = hrefAttribute.split("/")[hrefAttribute.split("/").length - 2];
                    const categoryName = category.split(`-${category.split("-").pop()}`)[0];
                    const categoryKey = category.split("-").pop();

                    const categoryExists = categories.some((category) => {
                        return category.key === categoryKey;
                    });

                    if (categoryExists) {
                        const index = categories.findIndex((category) => {
                            return category.key === categoryKey;
                        });
                        categories[index].names.push({ countryCode: countryCode, name: categoryName });
                    } else {
                        categories.push({ key: categoryKey, names: [{ countryCode: countryCode, name: categoryName }] });
                    }
                }

                ikea.writeJsonToFile(JSON.stringify(categories), { directory: "website/api/ikea", fileName: "categories" });
            });
        }
    });

    test.describe("Products", () => {
        test.beforeAll(async ({ browser }) => {
            const page = await browser.newPage();
            ikea = new Ikea(page);

            const products: Array<{ id: string; itemNo: string; name: string; categoryKey: string; prices: Array<{ countryCode: string; currencyCode: string; price: number }> }> =
                [];
            ikea.writeJsonToFile(JSON.stringify(products), { directory: "website/api/ikea", fileName: "products" });

            await page.close();
        });

        for (const countryCode of countryCodes) {
            test(`Create ${countryCode} Products Database`, async () => {
                test.slow();

                const categories: Array<{ key: string; names: Array<{ countryCode: string; name: string }> }> = ikea.readJson("website/api/ikea", "categories");
                const products: Array<{
                    id: string;
                    itemNo: string;
                    name: string;
                    categoryKey: string;
                    prices: Array<{ countryCode: string; currencyCode: string; price: number }>;
                }> = ikea.readJson("website/api/ikea", "products");

                for (const category of categories) {
                    const response = await ikea.getProducts(countryCode, category.key, { start: 0, end: 10000 });

                    if (response) {
                        if (response.moreProducts) {
                            for (const productFromResponse of response.moreProducts.productWindow) {
                                const productExists = products.some((product) => {
                                    return product.id === productFromResponse.id;
                                });

                                if (productExists) {
                                    const index = products.findIndex((product) => {
                                        return product.id === productFromResponse.id;
                                    });
                                    const priceForCountryCodeExists = products[index].prices.some((prices) => {
                                        return prices.countryCode === countryCode;
                                    });
                                    if (!priceForCountryCodeExists) {
                                        products[index].prices.push({
                                            countryCode: countryCode,
                                            currencyCode: productFromResponse.salesPrice.currencyCode,
                                            price: productFromResponse.salesPrice.numeral,
                                        });

                                        ikea.writeJsonToFile(JSON.stringify(products[index]), {
                                            directory: "website/api/ikea/products",
                                            fileName: productFromResponse.id,
                                        });
                                    }
                                } else {
                                    products.push({
                                        id: productFromResponse.id,
                                        itemNo: productFromResponse.itemNo,
                                        name: productFromResponse.name,
                                        categoryKey: category.key,
                                        prices: [
                                            {
                                                countryCode: countryCode,
                                                currencyCode: productFromResponse.salesPrice.currencyCode,
                                                price: productFromResponse.salesPrice.numeral,
                                            },
                                        ],
                                    });

                                    ikea.writeJsonToFile(
                                        JSON.stringify({
                                            id: productFromResponse,
                                            itemNo: productFromResponse.itemNo,
                                            name: productFromResponse.name,
                                            categoryKey: category.key,
                                            prices: [
                                                {
                                                    countryCode: countryCode,
                                                    currencyCode: productFromResponse.salesPrice.currencyCode,
                                                    price: productFromResponse.salesPrice.numeral,
                                                },
                                            ],
                                        }),
                                        { directory: "website/api/ikea/products", fileName: productFromResponse.id }
                                    );
                                }
                            }
                        }
                    }
                }

                ikea.writeJsonToFile(JSON.stringify(products), { directory: "website/api/ikea", fileName: "products" });
            });
        }
    });
});
