import { type APIResponse, type Page } from "@playwright/test";

export type DeichmannCategoryLink = {
    id: string;
    name: string;
    url: string;
};

export type DeichmannProductListing = {
    id: string;
    itemNo: string;
    name: string;
    imageUrl: string;
    url: string;
    price: number;
};

type DeichmannCategoryPageData = {
    hasResults: boolean;
    products: DeichmannProductListing[];
    nextPageUrl?: string;
};

type DeichmannCategoryApiPage = {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalResults: number;
    products: DeichmannProductListing[];
};

const apiRequestConcurrency = 4;
const productsPerApiPage = 48;
const assetTransformUrl =
    "https://asset.deichmann.com/images/f_auto,q_auto,d_fallback-dse.png/e_trim:5,w_3000/b_rgb:f8f8f8,c_lpad,g_south,h_3000,w_2625/b_auto,c_lpad,h_4000,w_3000/w_306,h_409/if_md:!is_ai_generated!_eq_!true!/l_ai_icon/fl_layer_apply,g_south_west,w_24,x_24,y_24/if_end/dpr_1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAttributeLabel(attributes: Record<string, unknown>, name: string): string {
    const attribute = attributes[name];
    if (!isRecord(attribute) || !isRecord(attribute.values) || typeof attribute.values.label !== "string") {
        return "";
    }
    return attribute.values.label.trim();
}

function parseCategoryApiPage(value: unknown, requestedPage: number, url: string): DeichmannCategoryApiPage {
    if (!isRecord(value) || !Array.isArray(value.products) || !isRecord(value.pagination)) {
        throw new Error(`Deichmann returned an invalid category response for ${url}`);
    }

    const { currentPage, pageSize, totalPages, totalResults } = value.pagination;
    if (
        typeof currentPage !== "number" ||
        !Number.isInteger(currentPage) ||
        currentPage !== requestedPage - 1 ||
        typeof pageSize !== "number" ||
        !Number.isInteger(pageSize) ||
        pageSize <= 0 ||
        typeof totalPages !== "number" ||
        !Number.isInteger(totalPages) ||
        totalPages < 0 ||
        typeof totalResults !== "number" ||
        !Number.isInteger(totalResults) ||
        totalResults < 0
    ) {
        throw new Error(`Deichmann returned invalid pagination data for ${url}`);
    }

    const products = value.products.map((value) => {
        if (!isRecord(value) || typeof value.referenceKey !== "string" || !isRecord(value.attributes) || !Array.isArray(value.images)) {
            throw new Error(`Deichmann returned an invalid product in ${url}`);
        }

        const image = value.images[0];
        const brand = getAttributeLabel(value.attributes, "brand");
        const productType = getAttributeLabel(value.attributes, "productType");
        const displayName = typeof value.displayName === "string" ? value.displayName.trim() : "";
        const urlPath = typeof value.url === "string" ? value.url : "";
        const priceRange = value.priceRange;
        const minimumPrice = isRecord(priceRange) && isRecord(priceRange.min) ? priceRange.min.withTax : undefined;

        if (
            !isRecord(image) ||
            typeof image.public_id !== "string" ||
            !Array.isArray(image.metaname) ||
            typeof image.metaname[0] !== "string" ||
            typeof image.metaname[1] !== "string" ||
            !urlPath.startsWith("/p/") ||
            typeof minimumPrice !== "number" ||
            !Number.isFinite(minimumPrice)
        ) {
            throw new Error(`Deichmann returned incomplete product data for ${value.referenceKey} in ${url}`);
        }

        const imageName = `${image.metaname[0]}-${image.metaname[1]}`.trim().toLowerCase().replace(/\s+/g, "-");
        const imageUrl = `${assetTransformUrl}/${encodeURIComponent(image.public_id)}/${encodeURIComponent(imageName)}`;
        const name = [brand, productType || displayName].filter(Boolean).join(" ");

        if (!name) {
            throw new Error(`Deichmann returned no product name for ${value.referenceKey} in ${url}`);
        }

        return {
            id: value.referenceKey,
            itemNo: value.referenceKey,
            name,
            imageUrl,
            url: new URL(urlPath, "https://www.deichmann.com").href,
            price: minimumPrice / 100,
        };
    });

    return {
        currentPage,
        pageSize,
        totalPages,
        totalResults,
        products,
    };
}

export class Deichmann {
    readonly page: Page;
    private categoryPageData?: DeichmannCategoryPageData;
    private apiCategoryUrl?: string;
    private apiRequestHeaders?: Record<string, string>;

    private readonly storefronts = {
        pl: { url: "https://www.deichmann.com/pl-pl/", path: "pl-pl" },
        cz: { url: "https://www.deichmann.com/cs-cz/", path: "cs-cz" },
    } as const;

    constructor(page: Page) {
        this.page = page;
    }

    private getStorefront(countryCode: string) {
        if (countryCode === "pl" || countryCode === "cz") {
            return this.storefronts[countryCode];
        }
        throw new Error(`Unsupported Deichmann country code: ${countryCode}`);
    }

    async openStorefront(countryCode: string): Promise<void> {
        await this.page.goto(this.getStorefront(countryCode).url, { waitUntil: "domcontentloaded" });
        await this.dismissCookieDialog(true);
    }

    async getCategoryLinks(countryCode: string): Promise<DeichmannCategoryLink[]> {
        const locale = this.getStorefront(countryCode).path;
        const links = await this.page.locator(`a[href*="/${locale}/c/"]`).evaluateAll((anchors) =>
            anchors.map((anchor) => ({
                name: (anchor.textContent ?? "").trim().replace(/\s+/g, " "),
                url: (anchor as HTMLAnchorElement).href,
            }))
        );

        const categories = new Map<string, DeichmannCategoryLink>();
        for (const link of links) {
            const categoryId = new URL(link.url).pathname.match(/-(\d+)$/)?.[1];
            if (!categoryId || !link.name || categories.has(link.url)) {
                continue;
            }

            categories.set(link.url, { id: categoryId, name: link.name, url: link.url });
        }

        if (categories.size === 0) {
            throw new Error(`No Deichmann category links were found for ${countryCode}`);
        }

        return [...categories.values()];
    }

    async openCategoryPage(url: string): Promise<void> {
        if (new URL(this.page.url()).origin !== new URL(url).origin) {
            throw new Error(`Open the Deichmann storefront before loading a category: ${url}`);
        }

        const categoryId = new URL(url).pathname.match(/-(\d+)$/)?.[1];
        if (!categoryId) {
            throw new Error(`Could not find a Deichmann category ID in ${url}`);
        }

        if (this.apiRequestHeaders && this.apiCategoryUrl) {
            await this.loadCategoryFromApi(categoryId);
            return;
        }

        const response = await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        if (!response || !response.ok()) {
            throw new Error(`Deichmann category request failed for ${url}: ${response?.status() ?? "no response"}`);
        }

        await this.dismissCookieDialog(true);
        if ((await this.page.locator("#ng-state").count()) === 0) {
            throw new Error(`Deichmann category state was not found for ${url}`);
        }

        const nextPage = this.page.locator('[data-testid="switch-to-next-page"]');
        if ((await nextPage.count()) === 0) {
            this.categoryPageData = await this.readRenderedCategoryPage(url);
            return;
        }
        const nextPageHref = await nextPage.getAttribute("href");
        if (!nextPageHref) {
            this.categoryPageData = await this.readRenderedCategoryPage(url);
            return;
        }

        const apiResponsePromise = this.page.waitForResponse(
            (apiResponse) => {
                const requestUrl = new URL(apiResponse.url());
                return requestUrl.hostname === "api.deichmann.com" && requestUrl.pathname.endsWith(`/categories/${categoryId}`) && requestUrl.searchParams.get("page") === "2";
            },
            { timeout: 30000 }
        );
        const [apiResponse] = await Promise.all([apiResponsePromise, nextPage.click()]);

        const headers = await apiResponse.request().allHeaders();
        const charybdisHeader = headers["x-charybdis"];
        const hydraHeader = headers["x-hydra"];
        if (!charybdisHeader || !hydraHeader) {
            throw new Error(`Deichmann API context headers were missing for ${url}`);
        }

        this.apiCategoryUrl = apiResponse.url();
        this.apiRequestHeaders = {
            accept: headers.accept ?? "application/json, text/plain, */*",
            "x-charybdis": charybdisHeader,
            "x-hydra": hydraHeader,
        };

        await this.loadCategoryFromApi(categoryId);
    }

    private async readRenderedCategoryPage(url: string): Promise<DeichmannCategoryPageData> {
        return this.page.evaluate((requestUrl) => {
            const products = [...document.querySelectorAll("deich-lib-product-tile")].map((tile) => {
                const productId = tile.getAttribute("data-id") ?? "";
                const brand = tile.querySelector(".brandname")?.textContent?.trim() ?? "";
                const productType = tile.querySelector(".taglist")?.textContent?.trim() ?? "";
                const image = tile.querySelector("img");
                const productLink = tile.querySelector('a[href*="/p/"]');
                const priceText = tile.querySelector(".main .price")?.textContent?.trim() ?? "";
                const priceValue = priceText.replace(/[^\d,.-]/g, "");
                const normalizedPrice = priceValue.includes(",") ? priceValue.replace(/\./g, "").replace(",", ".") : priceValue;

                return {
                    id: productId,
                    itemNo: productId,
                    name: [brand, productType].filter(Boolean).join(" "),
                    imageUrl: image?.getAttribute("src") ?? "",
                    url: productLink?.getAttribute("href") ?? "",
                    price: normalizedPrice ? Number(normalizedPrice) : Number.NaN,
                };
            });
            const nextPageHref = document.querySelector('[data-testid="switch-to-next-page"]')?.getAttribute("href");

            return {
                hasResults: document.querySelector(".searchresults") !== null,
                products,
                nextPageUrl: nextPageHref ? new URL(nextPageHref, requestUrl).href : undefined,
            };
        }, url);
    }

    private getCategoryApiUrl(categoryId: string, pageNumber: number): string {
        if (!this.apiCategoryUrl) {
            throw new Error("Deichmann API has not been initialized");
        }

        const apiUrl = new URL(this.apiCategoryUrl);
        const categoryPath = apiUrl.pathname.match(/^(.*\/categories\/)\d+$/);
        if (!categoryPath) {
            throw new Error(`Could not find a Deichmann category API path in ${this.apiCategoryUrl}`);
        }

        apiUrl.pathname = `${categoryPath[1]}${categoryId}`;
        apiUrl.searchParams.set("page", String(pageNumber));
        apiUrl.searchParams.set("perPage", String(productsPerApiPage));
        return apiUrl.href;
    }

    private async requestCategoryApiPage(categoryId: string, pageNumber: number): Promise<DeichmannCategoryApiPage> {
        if (!this.apiRequestHeaders) {
            throw new Error("Deichmann API request headers have not been initialized");
        }

        const url = this.getCategoryApiUrl(categoryId, pageNumber);
        for (let attempt = 0; attempt < 3; attempt++) {
            let response: APIResponse;
            try {
                response = await this.page.context().request.get(url, { headers: this.apiRequestHeaders, timeout: 30000 });
            } catch (error) {
                if (attempt === 2) {
                    throw new Error(`Deichmann category API request failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
                }
                await this.page.waitForTimeout(500 * 2 ** attempt);
                continue;
            }

            if (!response.ok()) {
                const status = response.status();
                if ((status !== 429 && status < 500) || attempt === 2) {
                    throw new Error(`Deichmann category API request failed for ${url}: ${status}`);
                }

                const retryAfter = response.headers()["retry-after"];
                const retrySeconds = retryAfter ? Number(retryAfter) : Number.NaN;
                const delay = Number.isFinite(retrySeconds) ? Math.min(retrySeconds * 1000, 30000) : 500 * 2 ** attempt;
                await this.page.waitForTimeout(delay);
                continue;
            }

            let result: unknown;
            try {
                result = await response.json();
            } catch (error) {
                if (attempt === 2) {
                    throw new Error(`Deichmann returned invalid JSON for ${url}: ${error instanceof Error ? error.message : String(error)}`);
                }
                await this.page.waitForTimeout(500 * 2 ** attempt);
                continue;
            }

            const page = parseCategoryApiPage(result, pageNumber, url);
            if (page.pageSize !== productsPerApiPage) {
                throw new Error(`Deichmann ignored the requested page size for ${url}: ${page.pageSize}`);
            }
            return page;
        }

        throw new Error(`Deichmann category API request failed for ${url}`);
    }

    private async loadCategoryFromApi(categoryId: string): Promise<void> {
        const firstPage = await this.requestCategoryApiPage(categoryId, 1);
        const pages = new Map<number, DeichmannCategoryApiPage>([[1, firstPage]]);

        let totalPages = firstPage.totalPages;
        let pageNumber = 2;
        while (pageNumber <= totalPages) {
            const batchPageNumbers = Array.from({ length: Math.min(apiRequestConcurrency, totalPages - pageNumber + 1) }, (_, index) => pageNumber + index);
            const batch = await Promise.all(
                batchPageNumbers.map((number) => {
                    const existingPage = pages.get(number);
                    return existingPage ? Promise.resolve(existingPage) : this.requestCategoryApiPage(categoryId, number);
                })
            );

            for (let index = 0; index < batch.length; index++) {
                const page = batch[index];
                pages.set(batchPageNumbers[index], page);
                totalPages = Math.max(totalPages, page.totalPages);
            }
            pageNumber += batchPageNumbers.length;
        }

        const orderedPages = [...pages.entries()].sort(([first], [second]) => first - second);
        const products = orderedPages.flatMap(([, page]) => page.products);
        const reportedTotalResults = Math.max(...orderedPages.map(([, page]) => page.totalResults));
        if (products.length < reportedTotalResults) {
            throw new Error(`Deichmann returned ${products.length} of ${reportedTotalResults} products for category ${categoryId}`);
        }

        this.categoryPageData = {
            hasResults: products.length > 0,
            products,
        };
    }

    async hasCategoryResults(): Promise<boolean> {
        if (!this.categoryPageData) {
            throw new Error("Deichmann category page has not been loaded");
        }
        return this.categoryPageData.hasResults;
    }

    async getProductsFromPage(): Promise<DeichmannProductListing[]> {
        if (!this.categoryPageData) {
            throw new Error("Deichmann category page has not been loaded");
        }

        const products = this.categoryPageData.products.map((product) => ({
            ...product,
            imageUrl: product.imageUrl ? new URL(product.imageUrl, this.page.url()).href : "",
            url: product.url ? new URL(product.url, this.page.url()).href : "",
        }));

        for (const product of products) {
            if (!product.id || !product.name || !product.imageUrl || !product.url || !Number.isFinite(product.price)) {
                throw new Error(`Deichmann returned incomplete product data: ${JSON.stringify(product)}`);
            }
        }

        return products;
    }

    async getNextPageUrl(): Promise<string | undefined> {
        if (!this.categoryPageData) {
            throw new Error("Deichmann category page has not been loaded");
        }
        return this.categoryPageData.nextPageUrl;
    }

    async dismissCookieDialog(waitForPopup = false): Promise<void> {
        const rejectButton = this.page.getByRole("button", { name: /odrzu\u0107 wszystko|odm\u00edtnout v\u0161e|v\u0161echny odm\u00edtnout/i });
        if (waitForPopup) {
            try {
                await rejectButton.waitFor({ state: "visible", timeout: 2000 });
            } catch (error) {
                if (error instanceof Error && error.name === "TimeoutError") {
                    return;
                }
                throw error;
            }
        }
        if (await rejectButton.isVisible()) {
            await rejectButton.click();
        }
    }
}
