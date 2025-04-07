import { Locator, Page, Response } from "@playwright/test";
import { ulid } from "ulid";
import fs from "fs";
import path from "path";

export class Ecco {
    readonly page: Page;

    readonly countryCodeAndLanguageCodeForCountryCode: (countryCode: string) => string;

    readonly declineCookies: Locator;
    readonly categories: Locator;

    constructor(page: Page) {
        this.page = page;

        this.countryCodeAndLanguageCodeForCountryCode = (countryCode) => {
            switch (countryCode) {
                case "pl":
                    return "pl-PL";
                    break;
                case "cz":
                    return "cs-CZ";
                    break;
                default:
                    console.log(`no matching language code for provided "${countryCode}" countryCode found`);
            }
        };

        this.declineCookies = page.locator("#declineButton");
        this.categories = page.locator("a.navigation__item__link");
    }
}
