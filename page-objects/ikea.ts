import { Locator, Page } from "@playwright/test";
import { ulid } from "ulid";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

export class Ikea {
    readonly page: Page;

    readonly countryCodeAndLanguageCodeFromCountryCode: (countryCode: string) => string;
    readonly storeNameFromStoreId: (storeId: string) => string;

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
                    console.log(`no matching language code for provided "${countryCode}" countryCode found`);
            }
        };
        this.storeNameFromStoreId = (storeId) => {
            switch (storeId) {
                case "188":
                    return "Warszawa Janki";
                    break;
                case "203":
                    return "Gdańsk";
                    break;
                case "204":
                    return "Kraków";
                    break;
                case "205":
                    return "Poznań";
                    break;
                case "294":
                    return "Wrocław";
                    break;
                case "306":
                    return "Katowice";
                    break;
                case "307":
                    return "Warszawa Targówek";
                    break;
                case "311":
                    return "Lublin";
                    break;
                case "329":
                    return "Łódź";
                    break;
                case "429":
                    return "Bydgoszcz";
                    break;
                case "583":
                    return "Szczecin";
                    break;
                case "178":
                    return "Praha Zličín";
                    break;
                case "278":
                    return "Brno";
                    break;
                case "309":
                    return "Ostrava";
                    break;
                case "408":
                    return "Černý Most";
                    break;
                default:
                    console.log(`no matching store for provided "${storeId}" storeId found`);
            }
        };

        this.seeAllInCategoryLinks = page.locator("a.vn-link", { hasText: "Zobacz wszystko" }).or(page.locator("a.vn-link", { hasText: "Všechny kategorie" }));
    }

    readJson(directory: string, fileName: string): any {
        const fileContent = fs.readFileSync(`${directory}/${fileName}.json`).toString();
        return JSON.parse(fileContent);
    }

    writeJsonToFile(data: any, options?: { directory?: string; fileName?: string }): void {
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
            v: options ? (typeof options.v == "number" ? options.v : 20241114) : 20241114,
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

    async getAvailabilitiesForItemNo(
        countryCode: string,
        itemNo: string
    ): Promise<
        Array<{
            countryCode: string;
            storeId: string;
            storeName: string;
            quantity: number;
        }>
    > {
        const queryParams = {
            itemNos: itemNo,
            expand: "StoresList,Restocks,SalesLocations,DisplayLocations,",
        };

        const response = await this.page.request.get(`https://api.ingka.ikea.com/cia/availabilities/ru/${countryCode}`, {
            params: queryParams,
            headers: {
                "X-Client-Id": "b6c117e5-ae61-4ef5-b4cc-e0b1e37f0631",
            },
        });

        const responseJson = await response.json();
        const availabilities: Array<{
            countryCode: string;
            storeId: string;
            storeName: string;
            quantity: number;
        }> = [];
        if (responseJson.availabilities) {
            for (const availability of responseJson.availabilities) {
                availabilities.push({
                    countryCode: countryCode,
                    storeId: availability.classUnitKey.classUnitCode,
                    storeName: this.storeNameFromStoreId(availability.classUnitKey.classUnitCode),
                    quantity: availability.buyingOption.cashCarry.availability.quantity,
                });
            }
        } else {
            for (const availability of responseJson.data) {
                if (availability.classUnitKey.classUnitCode === countryCode.toUpperCase()) {
                    continue;
                }

                let index = -1;
                if (availability.isInCashAndCarryRange) {
                    index = availability.availableStocks.findIndex((availableStock) => {
                        return availableStock.type === "CASHCARRY";
                    });
                }
                const quantity = index >= 0 ? availability.availableStocks[index].quantity : 0;

                availabilities.push({
                    countryCode: countryCode,
                    storeId: availability.classUnitKey.classUnitCode,
                    storeName: this.storeNameFromStoreId(availability.classUnitKey.classUnitCode),
                    quantity: quantity,
                });
            }
        }

        return availabilities;
    }
}
