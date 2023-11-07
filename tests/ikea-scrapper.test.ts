import { expect, test } from "@playwright/test";

import { Shared } from "@page-objects/shared";
import categories from "@fixtures/categories.json";

let shared: Shared;

test.beforeEach(async ({ page }) => {
    shared = new Shared(page);
});

test.describe("Ikea Scrapper", () => {
    test("Get All Categories", async ({ page }) => {
        const categories: Array<{ key: string; name: string }> = [];

        await page.goto("/pl/pl/cat/produkty-products/", { waitUntil: "networkidle" });

        const seeAllInCategoryLinksLocators = await shared.seeAllInCategoryLinks.all();
        for (const seeAllInCategoryLinkLocator of seeAllInCategoryLinksLocators) {
            const hrefAttribute = await seeAllInCategoryLinkLocator.getAttribute("href");
            const category = hrefAttribute.split("/")[hrefAttribute.split("/").length - 2];
            const categoryName = category.split(`-${category.split("-").pop()}`)[0];
            const categoryKey = category.split("-").pop();
            categories.push({ key: categoryKey, name: categoryName });
        }

        shared.writeJsonToFile(JSON.stringify(categories), { directory: "fixtures", fileName: "categories" });
    });

    for (const category of categories) {
        test(`Get "${category.name}"-"${category.key}" Category Products`, async () => {
            await shared.getProducts(category.key, { start: 0, end: 10000 });
        });
    }

    for (const category of categories) {
        test(`Remove Unnecessary Data From "${category.name}"-"${category.key}" Category Products`, async () => {
            const categoryProducts = shared.readJson("files", category.key);
            const products: Array<{ id: number; name: string; categoryKey: string; prices: Array<{ currencyCode: string; price: number }> }> = [];

            for (const categoryProduct of categoryProducts.moreProducts.productWindow) {
                products.push({
                    id: categoryProduct.id,
                    name: categoryProduct.name,
                    categoryKey: category.key,
                    prices: [
                        {
                            currencyCode: categoryProduct.salesPrice.currencyCode,
                            price: categoryProduct.salesPrice.numeral,
                        },
                    ],
                });
            }

            shared.writeJsonToFile(JSON.stringify(products), { directory: "files", fileName: category.key });
        });
    }

    test("Create Products Database", async () => {
        const products: Array<{ id: number; name: string; categoryKey: string; prices: Array<{ currencyCode: string; price: number }> }> = [];

        for (const category of categories) {
            const categoryProducts = shared.readJson("files", category.key);
            for (const categoryProduct of categoryProducts) {
                products.push(categoryProduct);
            }
        }

        shared.writeJsonToFile(JSON.stringify(products), { directory: "fixtures", fileName: "products" });
    });

    test("Copy Fixtures To API", async () => {
        const categories = shared.readJson("fixtures", "categories");
        const products = shared.readJson("fixtures", "products");

        shared.writeJsonToFile(JSON.stringify(categories), { directory: "website/api", fileName: "categories" });
        shared.writeJsonToFile(JSON.stringify(products), { directory: "website/api", fileName: "products" });
    });
});
