import { Page } from "@playwright/test";

import * as types from "../types";

type CAndANavigationNode = {
    ipimId: string;
    name: string;
    slug: string;
};

type CAndANavigation = {
    current: CAndANavigationNode;
    children: CAndANavigationNode[];
    siblings: CAndANavigationNode[];
};

type CAndAListResponse = {
    status: number;
    errorBody?: string;
    data?: {
        list?: {
            ipimId: string;
            navigation?: CAndANavigation;
            page?: number;
            productCount?: number;
            products?: Array<{
                usim: string;
                uri: string;
                name: string;
                variants?: Array<{
                    modelImage?: { file: string; folder: string };
                    variantImage?: { file: string; folder: string };
                    price?: { grossPrice: number; currency: string };
                }>;
            }>;
        };
    };
    errors?: Array<{ message: string }>;
};

type CAndAProductListing = {
    id: string;
    href: string;
    imageUrl: string;
    name: string;
    price: number;
    currency: string;
};

type CAndAProductPage = {
    page: number;
    productCount: number;
    products: CAndAProductListing[];
};

const listPersistedQueryHash = "aa4425d06d20317473858daed7406894b0ff69cf68e446befc7df59cb5199aac";

export class CAndA {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    getStorefrontUrl(countryCode: string): string {
        switch (countryCode) {
            case "pl":
                return "https://www.c-and-a.com/pl/pl/shop/kobiety";
            case "cz":
                return "https://www.c-and-a.com/eu/cz/shop/zeny";
            default:
                throw new Error(`Unsupported C&A country code "${countryCode}"`);
        }
    }

    getProductRootCategories(categories: types.Category[], countryCode: string): Array<{ id: string; url: string }> {
        const countryCategories = categories.flatMap((category) => {
            const url = category.names[countryCode]?.url;
            return url ? [{ id: category.id, url }] : [];
        });
        const categoryIds = new Set(countryCategories.map((category) => category.id));

        return countryCategories.filter(({ id }) => {
            let parentId = id;
            while (parentId.includes("-")) {
                parentId = parentId.slice(0, parentId.lastIndexOf("-"));
                if (categoryIds.has(parentId)) {
                    return false;
                }
            }
            return true;
        });
    }

    async getDepartmentUrls(countryCode: string): Promise<string[]> {
        const storefrontPrefix = this.getStorefrontPrefix(countryCode);
        const links = await this.page.locator('[data-testid="main-header"] a[href]').evaluateAll((anchors) => {
            return anchors.map((anchor) => (anchor as HTMLAnchorElement).getAttribute("href")).filter((href): href is string => href !== null);
        });

        return this.getCategoryUrls(links, storefrontPrefix);
    }

    getNavigationFromHtml(html: string): CAndANavigation | undefined {
        const markerIndex = html.indexOf('"navigation":{"parent"');
        if (markerIndex === -1) {
            return undefined;
        }

        const start = html.indexOf("{", markerIndex);
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = start; index < html.length; index++) {
            const character = html[index];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (character === "\\") {
                    escaped = true;
                } else if (character === '"') {
                    inString = false;
                }
                continue;
            }

            if (character === '"') {
                inString = true;
            } else if (character === "{") {
                depth++;
            } else if (character === "}" && --depth === 0) {
                const navigation = JSON.parse(html.slice(start, index + 1)) as CAndANavigation;
                if (!navigation.current || !Array.isArray(navigation.children)) {
                    throw new Error("C&A storefront returned an incomplete category navigation tree");
                }
                return navigation;
            }
        }

        throw new Error("Could not parse C&A category navigation from the storefront response");
    }

    getCategoryUrl(countryCode: string, node: CAndANavigationNode): string | undefined {
        const baseUrl = countryCode === "pl" ? "https://www.c-and-a.com/pl/pl/" : "https://www.c-and-a.com/eu/cz/";
        const url = new URL(node.slug, baseUrl);
        return this.getCategoryUrls([url.href], this.getStorefrontPrefix(countryCode))[0];
    }

    async getCategoryNavigation(countryCode: string, node: CAndANavigationNode, categoryUrl: string): Promise<CAndANavigation> {
        const response = await this.getCategoryList(countryCode, node.ipimId, categoryUrl, 1, true);
        const list = response.data?.list;
        if (!list?.navigation || list.ipimId !== node.ipimId) {
            throw new Error(`C&A category API returned no navigation for "${node.ipimId}"`);
        }

        return list.navigation;
    }

    async getCategoryProductPage(countryCode: string, categoryId: string, categoryUrl: string, pageNumber: number): Promise<CAndAProductPage> {
        const response = await this.getCategoryList(countryCode, categoryId, categoryUrl, pageNumber, false);
        const list = response.data?.list;
        if (!list || list.ipimId !== categoryId || list.page !== pageNumber || typeof list.productCount !== "number" || !Array.isArray(list.products)) {
            throw new Error(`C&A product API returned incomplete data for "${categoryId}" page ${pageNumber}`);
        }

        const products = list.products.map((product) => {
            const variant = product.variants?.[0];
            const image = variant?.modelImage?.file ? variant.modelImage : variant?.variantImage;
            const price = variant?.price?.grossPrice;
            if (!product.usim || !product.uri || !product.name || !image?.file || !image.folder || typeof price !== "number" || !Number.isFinite(price)) {
                throw new Error(`C&A product API returned incomplete product data for category "${categoryId}" page ${pageNumber}`);
            }

            const imagePath = image.file.replace(/^(v\d+)\//, `$1${image.folder}/`);
            if (imagePath === image.file) {
                throw new Error(`C&A product API returned an invalid image path "${image.file}"`);
            }

            const origin = "https://www.c-and-a.com";
            return {
                id: product.usim,
                href: new URL(product.uri, origin).href,
                imageUrl: new URL(`/img/product/q_auto:good,b_rgb:f9f8f2,c_scale,w_262/${imagePath}`, origin).href,
                name: product.name,
                price,
                currency: variant.price.currency,
            };
        });

        return { page: list.page, productCount: list.productCount, products };
    }

    private getCategoryUrls(links: string[], storefrontPrefix: string): string[] {
        const categoryUrls = new Set<string>();
        for (const link of links) {
            const url = new URL(link, this.page.url());
            if (
                url.origin !== "https://www.c-and-a.com" ||
                !url.pathname.startsWith(storefrontPrefix) ||
                url.search ||
                url.hash ||
                /\/(?:account|basket|foryou|newsletter|service|wishlist)(?:\/|$)|\/trend(?:-|\/|$)/i.test(url.pathname) ||
                /-\d+\/\d+$/.test(url.pathname)
            ) {
                continue;
            }

            categoryUrls.add(url.href);
        }
        return [...categoryUrls];
    }

    private getStorefrontPrefix(countryCode: string): string {
        switch (countryCode) {
            case "pl":
                return "/pl/pl/shop/";
            case "cz":
                return "/eu/cz/shop/";
            default:
                throw new Error(`Unsupported C&A country code "${countryCode}"`);
        }
    }

    private async getCategoryList(countryCode: string, categoryId: string, categoryUrl: string, pageNumber: number, fetchNavigation: boolean): Promise<CAndAListResponse> {
        const apiCountry = countryCode === "pl" ? "pl" : "eu";
        const language = countryCode === "pl" ? "pl" : "cz";
        const response = await this.page.evaluate(
            async ({ categoryId, apiCountry, language, categoryUrl, pageNumber, fetchNavigation, hash }) => {
                const apiResponse = await fetch("https://www.c-and-a.com/api?o=list", {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-country": apiCountry,
                        "x-language": language,
                        "x-request-url": categoryUrl,
                    },
                    body: JSON.stringify({
                        extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
                        variables: {
                            ipimId: categoryId,
                            filter: [],
                            fetchNavigation,
                            refetchOnZeroResults: false,
                            page: pageNumber,
                        },
                    }),
                });
                if (!apiResponse.ok) {
                    return { status: apiResponse.status, errorBody: (await apiResponse.text()).slice(0, 200) };
                }

                const result = await apiResponse.json();
                const list = result.data?.list;
                return {
                    status: apiResponse.status,
                    errors: result.errors,
                    data: list
                        ? {
                              list: {
                                  ipimId: list.ipimId,
                                  page: list.page,
                                  productCount: list.productCount,
                                  navigation: fetchNavigation ? list.navigation : undefined,
                                  products: fetchNavigation
                                      ? undefined
                                      : list.products?.map((product) => {
                                            const variant = product.variants?.find(
                                                (candidate) =>
                                                    candidate.price && Number.isFinite(candidate.price.grossPrice) && (candidate.modelImage?.file || candidate.variantImage?.file)
                                            );
                                            return {
                                                usim: product.usim,
                                                uri: product.uri,
                                                name: product.name,
                                                variants: variant
                                                    ? [
                                                          {
                                                              modelImage: variant.modelImage,
                                                              variantImage: variant.variantImage,
                                                              price: variant.price,
                                                          },
                                                      ]
                                                    : [],
                                            };
                                        }),
                              },
                          }
                        : undefined,
                };
            },
            { categoryId, apiCountry, language, categoryUrl, pageNumber, fetchNavigation, hash: listPersistedQueryHash }
        );
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`C&A category API failed for "${categoryId}" with status ${response.status}: ${response.errorBody ?? ""}`);
        }
        if (response.errors?.length) {
            throw new Error(`C&A category API returned an error for "${categoryId}" page ${pageNumber}: ${response.errors.map((error) => error.message).join("; ")}`);
        }

        return response;
    }
}
