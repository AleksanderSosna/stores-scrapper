import { Locator, Page, expect } from "@playwright/test";
import fs from "fs";
import { ulid } from "ulid";

export class Ikea {
    readonly page: Page;

    readonly seeAllInCategoryLinks: Locator;

    constructor(page: Page) {
        this.page = page;

        this.seeAllInCategoryLinks = page.locator("a.vn-link", { hasText: "Zobacz wszystko" });
    }

    readJson(directory: string, fileName: string): any {
        const fileContent = fs.readFileSync(`${directory}/${fileName}.json`).toString();
        return JSON.parse(fileContent);
    }

    writeJsonToFile(data: any, options?: { directory?: string; fileName?: string }): any {
        const directory = options ? (typeof options.directory == "string" ? options.directory : "files") : "files";
        const fileName = options ? (typeof options.fileName == "string" ? options.fileName : ulid()) : ulid();

        fs.writeFileSync(`${directory}/${fileName}.json`, data);
    }

    async getSessionIdFromLocalStorage(): Promise<string> {
        const sessionId = await this.page.evaluate(() => localStorage["search-sik-session-plpl"]);
        return sessionId;
    }

    async getProducts(category: string, options?: { start?: number; end?: number; c?: string; v?: number; sort?: string; store?: number; zip?: string }): Promise<any> {
        const queryParams = {
            category: category,
            start: options ? (typeof options.start == "number" ? options.start : 0) : 0,
            end: options ? (typeof options.end == "number" ? options.end : 25) : 25,
            c: options ? (typeof options.c == "string" ? options.c : "listaf") : "listaf",
            v: options ? (typeof options.v == "number" ? options.v : 20220826) : 20220826,
            sort: options ? (typeof options.sort == "string" ? options.sort : "RELEVANCE") : "RELEVANCE",
            store: options ? (typeof options.store == "number" ? options.store : 306) : 306,
            zip: options ? (typeof options.zip == "string" ? options.zip : "44-370") : "44-370",
        };

        const response = await this.page.request.get("https://sik.search.blue.cdtapps.com/pl/pl/product-list-page/more-products", {
            params: queryParams,
        });

        const responseJson = await response.json();

        this.writeJsonToFile(JSON.stringify(responseJson), { directory: "files", fileName: category });

        return responseJson;
    }
}
