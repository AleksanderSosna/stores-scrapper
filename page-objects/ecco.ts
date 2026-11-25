import { Locator, Page, Response } from "@playwright/test";

type AlgoliaQuery = {
    indexName: string;
    params?: string | Record<string, unknown>;
    [key: string]: unknown;
};

export type AlgoliaProductHit = {
    objectID: string;
    articleNumber: string;
    colorCode: string;
    name: string;
    image?: string;
    productColors?: Array<{
        colorCode: string;
        image?: string;
    }>;
    images?: string[];
    priceRaw: {
        currencyCode: string;
        centAmount: number;
        fractionDigits: number;
    };
};

type AlgoliaSearchResponse = {
    results: Array<{
        hits: AlgoliaProductHit[];
        nbPages: number;
    }>;
};

export class Ecco {
    readonly page: Page;

    readonly declineCookies: Locator;
    readonly categories: Locator;

    constructor(page: Page) {
        this.page = page;

        this.declineCookies = page.locator("#declineButton");
        this.categories = page.locator('[data-testid="DesktopNavItem"] a[data-desktop-nav-primary="true"]');
    }

    private getAlgoliaParams(query: AlgoliaQuery): URLSearchParams {
        if (typeof query.params === "string") {
            return new URLSearchParams(query.params);
        }

        const queryParams = query.params && typeof query.params === "object" ? query.params : query;
        return new URLSearchParams(
            Object.entries(queryParams)
                .filter(([key, value]) => key !== "indexName" && typeof value !== "object")
                .map(([key, value]) => [key, String(value)])
        );
    }

    getCategoryId(query: AlgoliaQuery): string {
        const filters = this.getAlgoliaParams(query).get("filters") ?? "";
        const categoryId = filters.match(/categories:"([^"]+)"/)?.[1];
        if (!categoryId) {
            throw new Error(`Could not find a category filter in Algolia query "${filters}"`);
        }
        return categoryId;
    }

    async waitForCategorySearch(countryCode: string): Promise<Response> {
        const response = await this.page.waitForResponse((response) => {
            if (!response.url().includes("algolia.net/1/indexes/*/queries")) {
                return false;
            }

            return response.request().postData()?.includes(`prod_${countryCode.toUpperCase()}_`) ?? false;
        });
        if (!response.ok()) {
            throw new Error(`ECCO category search failed with status ${response.status()}`);
        }
        return response;
    }

    getProductQuery(response: Response, countryCode: string): AlgoliaQuery {
        const requestBody = response.request().postDataJSON() as { requests?: AlgoliaQuery[] };
        const query = requestBody.requests?.find((request) => request.indexName.includes(`prod_${countryCode.toUpperCase()}_`) && this.getAlgoliaParams(request).has("filters"));
        if (!query) {
            throw new Error(`Could not find the ${countryCode.toUpperCase()} product query in the ECCO listing response`);
        }
        return query;
    }

    async getCategoryProducts(searchResponse: Response, query: AlgoliaQuery): Promise<AlgoliaProductHit[]> {
        const params = this.getAlgoliaParams(query);
        params.set("hitsPerPage", "1000");

        const getPage = async (pageNumber: number): Promise<AlgoliaSearchResponse["results"][number]> => {
            let pageQuery: AlgoliaQuery;
            if (typeof query.params === "string") {
                const pageParams = new URLSearchParams(params);
                pageParams.set("page", String(pageNumber));
                pageQuery = { indexName: query.indexName, params: pageParams.toString() };
            } else {
                pageQuery = { ...query, hitsPerPage: 1000, page: pageNumber };
            }

            const response = await this.page.request.post(searchResponse.request().url(), {
                data: {
                    requests: [pageQuery],
                },
                headers: {
                    "content-type": "text/plain",
                },
            });
            if (!response.ok()) {
                throw new Error(`ECCO Algolia search failed with status ${response.status()}`);
            }

            const searchResult = (await response.json()) as AlgoliaSearchResponse;
            const result = searchResult.results[0];
            if (!result) {
                throw new Error("ECCO Algolia search returned no product results");
            }
            return result;
        };

        const firstPage = await getPage(0);
        const hits = [...firstPage.hits];
        for (let pageNumber = 1; pageNumber < firstPage.nbPages; pageNumber++) {
            const result = await getPage(pageNumber);
            hits.push(...result.hits);
        }
        return hits;
    }

    getProductUrl(countryCode: string, hit: AlgoliaProductHit): string {
        const slug = hit.name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9.]+/g, "-")
            .replace(/^-|-$/g, "");
        return `https://${countryCode}.ecco.com/produkt/${slug}/${hit.articleNumber}/${hit.colorCode}`;
    }

    getProductImage(hit: AlgoliaProductHit): string | undefined {
        return (
            hit.image ?? hit.productColors?.find((color) => color.colorCode === hit.colorCode)?.image ?? hit.productColors?.find((color) => color.image)?.image ?? hit.images?.[0]
        );
    }
}
