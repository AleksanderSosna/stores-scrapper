export type Category = { id: string; names: { [countryCode: string]: { name: string } } };

export type Product = {
    id: string;
    itemNo: string;
    name: string;
    imageUrl: string;
    urls: { [countryCode: string]: { url: string } };
    prices: { [countryCode: string]: { [currencyCode: string]: number } };
};

export type Offer = {
    id: string;
    itemNo: string;
    name: string;
    imageUrl: string;
    urls: { [countryCode: string]: { url: string } };
    prices: { [countryCode: string]: { [currencyCode: string]: number } };
    bestDiscount: number;
    bestValue: { [currencyCode: string]: number };
    worstPrice: { [currencyCode: string]: number };
};

export type Offers = {
    [countryCode: string]: {
        byValue: Offer[];
        byDiscount: Offer[];
    };
};
