import { Locator, Page } from "@playwright/test";

export class Ecco {
    readonly page: Page;

    readonly declineCookies: Locator;
    readonly categories: Locator;

    constructor(page: Page) {
        this.page = page;

        this.declineCookies = page.locator("#declineButton");
        this.categories = page.locator('[data-testid="DesktopNavItem"] a[data-desktop-nav-primary="true"]');
    }
}
