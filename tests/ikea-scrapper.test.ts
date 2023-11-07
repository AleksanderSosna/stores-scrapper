import { expect, test } from "@playwright/test";

import { Ikea } from "@page-objects/ikea";
import categories from "@api/ikea/categories.json";

let ikea: Ikea;

test.beforeEach(async ({ page }) => {
    ikea = new Ikea(page);
});

test.describe("Ikea Scrapper", () => {
    test("Create Categories Database", async ({ page }) => {
        const categories: Array<{ key: string; name: string }> = [];

        await page.goto("/pl/pl/cat/produkty-products/", { waitUntil: "networkidle" });

        const seeAllInCategoryLinksLocators = await ikea.seeAllInCategoryLinks.all();
        for (const seeAllInCategoryLinkLocator of seeAllInCategoryLinksLocators) {
            const hrefAttribute = await seeAllInCategoryLinkLocator.getAttribute("href");
            const category = hrefAttribute.split("/")[hrefAttribute.split("/").length - 2];
            const categoryName = category.split(`-${category.split("-").pop()}`)[0];
            const categoryKey = category.split("-").pop();
            categories.push({ key: categoryKey, name: categoryName });
        }

        ikea.writeJsonToFile(JSON.stringify(categories), { directory: "website/api/ikea", fileName: "categories" });
    });

    for (const category of categories) {
        test(`Get "${category.name}"-"${category.key}" Category Products`, async () => {
            await ikea.getProducts(category.key, { start: 0, end: 10000 });
        });
    }

    for (const category of categories) {
        test(`Remove Unnecessary Data From "${category.name}"-"${category.key}" Category Products`, async () => {
            const categoryProducts = ikea.readJson("files", category.key);
            const products: Array<{ id: string; name: string; categoryKey: string; prices: Array<{ currencyCode: string; price: number }> }> = [];

            for (const categoryProduct of categoryProducts.moreProducts.productWindow) {
                products.push({
                    id: categoryProduct.id.replace(/[^\d]/g, ""),
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

            ikea.writeJsonToFile(JSON.stringify(products), { directory: "files", fileName: category.key });
        });
    }

    test("Create Products Database", async () => {
        const products: Array<{ id: string; name: string; categoryKey: string; prices: Array<{ currencyCode: string; price: number }> }> = [];

        for (const category of categories) {
            const categoryProducts = ikea.readJson("files", category.key);
            for (const categoryProduct of categoryProducts) {
                products.push(categoryProduct);

                ikea.writeJsonToFile(JSON.stringify(categoryProduct), { directory: "website/api/ikea/products", fileName: categoryProduct.id });
            }
        }

        ikea.writeJsonToFile(JSON.stringify(products), { directory: "website/api/ikea", fileName: "products" });
    });
});
