export type Category = { id: string; names: { [countryCode: string]: { name: string } } };

export type Product = {
    id: string;
    itemNo: string;
    name: string;
    imageUrl: string;
    urls: { [countryCode: string]: { url: string } };
    prices: { [countryCode: string]: { currencyCode: string; price: number } };
};

export type Offer = {
    id: string;
    itemNo: string;
    name: string;
    imageUrl: string;
    urls: { [countryCode: string]: { url: string } };
    prices: { [countryCode: string]: { currencyCode: string; price: number } };
    bestDiscount: number;
    bestValue: number;
    worstPrice: number;
    shopName?: string;
};

export type Offers = {
    [countryCode: string]: {
        byValue: Offer[];
        byDiscount: Offer[];
    };
};
