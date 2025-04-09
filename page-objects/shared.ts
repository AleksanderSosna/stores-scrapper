import { Locator, Page, Response } from "@playwright/test";
import { ulid } from "ulid";
import fs from "fs";
import path from "path";

export class Shared {
    readonly page: Page;

    readonly currencies: { [key: string]: string }

    constructor(page: Page) {
        this.page = page;
        
        this.currencies = {
            pl: "PLN",
            cz: "CZK",
        };
    }

    async getResponse(urls: Array<string>, options?: { timeout?: number; notIncludedUrls?: Array<string> }): Promise<Response> {
        const response = await this.page.waitForResponse(
            (response) => {
                const bool =
                    urls.every((url) => {
                        return response.url().toLowerCase().includes(url.toLowerCase());
                    }) &&
                    response.ok() &&
                    !options?.notIncludedUrls?.some((notIncludedUrl) => {
                        return response.url().toLowerCase().includes(notIncludedUrl.toLowerCase());
                    });
                return bool;
            },
            { timeout: options?.timeout ? options.timeout : 10 * 1000 }
        );
        return response;
    }

    async createDirectory(directory: string): Promise<any> {
        try {
            await fs.promises.access(path.resolve(`${directory}/`));
        } catch (error) {
            await fs.promises.mkdir(path.resolve(`${directory}/`), { recursive: true });
        }
    }

    async deleteAllFilesFromDirectory(directory: string): Promise<void> {
        await this.createDirectory(directory);
        try {
            const files = await fs.promises.readdir(directory);
            const deleteFilePromises = files.map((file) => fs.promises.unlink(path.join(directory, file)));
            await Promise.all(deleteFilePromises);
        } catch (err) {
            if (process.env.SURPRESS_ERRORS !== "true") {
                console.log(err);
            }
        }
    }

    async readJson(directory: string, fileName: string): Promise<any> {
        await this.createDirectory(directory);
        try {
            const fileContent = (await fs.promises.readFile(path.resolve(`${directory}/${fileName}.json`))).toString();
            return JSON.parse(fileContent);
        } catch (err) {
            if (process.env.SURPRESS_ERRORS !== "true") {
                console.log(err);
            }
        }
    }

    async writeJsonToFile(data: any, options?: { directory?: string; fileName?: string }): Promise<void> {
        const directory = options ? (typeof options.directory == "string" ? options.directory : "files") : "files";
        const fileName = options ? (typeof options.fileName == "string" ? options.fileName : ulid()) : ulid();

        await this.createDirectory(directory);
        try {
            await fs.promises.writeFile(path.resolve(`${directory}/${fileName}.json`), data);
        } catch (err) {
            if (process.env.SURPRESS_ERRORS !== "true") {
                console.log(err);
            }
        }
    }

    async getExchangeRate(currencyCode: string, expectedCurrencyCode: string): Promise<number> {
        const exchangeRateResponse = await this.page.request.get(`https://api.nbp.pl/api/exchangerates/rates/A/${currencyCode !== "PLN" ? currencyCode: expectedCurrencyCode}/`,
            {
                params: {
                    format: "json",
                },
            });
        const exchangeRateResJson = await exchangeRateResponse.json();
        const exchangeRate = exchangeRateResJson.rates[0].mid;

        return currencyCode === "PLN" ? 1 / exchangeRate : exchangeRate
    }
}
