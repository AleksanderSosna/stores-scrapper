import { Locator, Page } from "@playwright/test";
import { ulid } from "ulid";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

export class Ikea {
    readonly page: Page;

    readonly countryCodeAndLanguageCodeFromCountryCode: (countryCode: string) => string;

    readonly seeAllInCategoryLinks: Locator;

    constructor(page: Page) {
        this.page = page;

        this.countryCodeAndLanguageCodeFromCountryCode = (countryCode) => {
            switch (countryCode) {
                case "pl":
                    return `/${countryCode}/pl`;
                    break;
                case "cz":
                    return `/${countryCode}/cs`;
                    break;
                default:
                    console.log(`no matching language code for provided "${countryCode}" found`);
            }
        };

        this.seeAllInCategoryLinks = page.locator("a.vn-link", { hasText: "Zobacz wszystko" }).or(page.locator("a.vn-link", { hasText: "Všechny kategorie" }));
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

    async deleteAllFilesFromDirectory(directory: string): Promise<void> {
        try {
            const files = await fsPromises.readdir(directory);
            const deleteFilePromises = files.map((file) => fsPromises.unlink(path.join(directory, file)));
            await Promise.all(deleteFilePromises);
        } catch (err) {
            console.log(err);
        }
    }

    async getSessionIdFromLocalStorage(): Promise<string> {
        const sessionId = await this.page.evaluate(() => localStorage["search-sik-session-plpl"]);
        return sessionId;
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
            v: options ? (typeof options.v == "number" ? options.v : 20220826) : 20220826,
            sort: options ? (typeof options.sort == "string" ? options.sort : "RELEVANCE") : "RELEVANCE",
        };

        const response = await this.page.request.get(
            `https://sik.search.blue.cdtapps.com${this.countryCodeAndLanguageCodeFromCountryCode(countryCode)}/product-list-page/more-products`,
            {
                params: queryParams,
            }
        );

        const responseJson = await response.json();
        return responseJson;
    }
}
