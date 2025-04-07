import { Locator, Page } from "@playwright/test";
import { ulid } from "ulid";
import fs from "fs";
import path from "path";

export class Ikea {
    readonly page: Page;

    readonly countryCodeAndLanguageCodeForCountryCode: (countryCode: string) => string;
    readonly storeNameFromStoreId: (storeId: string) => string;

    readonly seeAllInCategoryLinks: Locator;

    constructor(page: Page) {
        this.page = page;

        this.countryCodeAndLanguageCodeForCountryCode = (countryCode) => {
            switch (countryCode) {
                case "pl":
                    return "/pl/pl";
                    break;
                case "cz":
                    return "/cz/cs";
                    break;
                default:
                    console.log(`no matching language code for provided "${countryCode}" countryCode found`);
            }
        };

        this.seeAllInCategoryLinks = page.locator("a.vn-link", { hasText: "Zobacz wszystko" }).or(page.locator("a.vn-link", { hasText: "Všechny kategorie" }));
    }

    async getProducts(
        countryCode: string,
        category: string,
        options?: { start?: number; end?: number; c?: string; v?: number; sort?: string; store?: number; zip?: string }
    ): Promise<any> {
        const queryParams = {
            category: category,
            start: options ? (typeof options.start == "number" ? options.start : 0) : 0,
            end: options ? (typeof options.end == "number" ? options.end : 25) : 25,
            c: options ? (typeof options.c == "string" ? options.c : "listaf") : "listaf",
            v: options ? (typeof options.v == "number" ? options.v : 20241114) : 20241114,
            sort: options ? (typeof options.sort == "string" ? options.sort : "RELEVANCE") : "RELEVANCE",
        };

        const response = await this.page.request.get(
            `https://sik.search.blue.cdtapps.com${this.countryCodeAndLanguageCodeForCountryCode(countryCode)}/product-list-page/more-products`,
            {
                params: queryParams,
            }
        );

        const responseJson = await response.json();
        return responseJson;
    }
}
