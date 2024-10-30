import ccxt from "ccxt";

export type ExchangeCtorProps = {
    isTestnet?: boolean;
    privateKey: `0x{string}`;
    account: `0x{string}`;
};

export class Exchange {
    privateKey: `0x{string}`;
    account: `0x{string}`;

    isTestnet: boolean;
    hyperliquid: any;

    static instance: Exchange[] = [];

    constructor(props: ExchangeCtorProps) {
        this.isTestnet = !!props.isTestnet;
        this.privateKey = props.privateKey;
        this.account = props.account;
        this.hyperliquid = new ccxt.hyperliquid() as any;

        this.hyperliquid.setSandboxMode(this.isTestnet);
        this.hyperliquid.walletAddress = props.account;
        this.hyperliquid.privateKey = props.privateKey;
        this.hyperliquid.checkRequiredCredentials();
    }

    static get(
        useTestnet: boolean,
        credentials?: { account: `0x{string}`; privateKey: `0x{string}` }
    ): Exchange {
        if (!this.instance[useTestnet ? 0 : 1]) {
            if (!credentials) {
                credentials = {
                    account: process.env.NEXT_PUBLIC_ADDRESS as `0x{string}`,
                    privateKey: process.env
                        .NEXT_PUBLIC_PRIVATE_KEY as `0x{string}`,
                };
            }
            this.instance[useTestnet ? 0 : 1] = new Exchange({
                ...credentials,
                isTestnet: useTestnet,
            });
        }
        return this.instance[useTestnet ? 0 : 1];
    }

    async fetchMarkPrice(asset: string): Promise<number | undefined> {
        const markets = await this.hyperliquid.fetchMarkets();
        const market = markets.find((market: any) => market.base === asset);
        if (!market) return undefined;
        const price = Number.parseFloat(market.info.markPx);
        return price;
    }

    async fetchBalance(): Promise<{ amount: number; symbol: "USDC" }> {
        const response = await this.hyperliquid.fetchBalance();
        return { amount: response.free.USDC, symbol: "USDC" };
    }

    async fetchPosition(asset: string): Promise<{
        symbol: string;
        notional: number;
        size: number;
        margin: number;
        pnl: number;
        leverage: { start: number; current: number };
    }> {
        const positions = await this.hyperliquid.fetchPositions();
        // await this.hyperliquid.fetchPositions();
        const matcher = new RegExp("^" + asset + "/", "g");
        const position = positions
            .filter(
                (pos: any) => matcher.test(pos.symbol) && pos.side === "short"
            )
            .map((pos: any) => {
                const symbol = asset;
                const notional = pos.notional;
                const size = -pos.contracts * pos.contractSize;
                const margin = pos.collateral;
                const leverage = {} as { current: number; start: number };
                leverage.current = Math.round((notional * 100) / margin) / 100;
                const pnl = pos.unrealizedPnl;
                leverage.start = pos.leverage;
                return {
                    notional,
                    symbol,
                    margin,
                    size,
                    pnl,
                    leverage,
                };
            })[0];
        return position;
    }

    async marketSell(symbol: string, amount: number): Promise<any> {
        const price = await this.fetchMarkPrice(symbol);
        symbol += "/USDC:USDC";
        const response = await this.apiCall(
            "createOrder",
            symbol,
            "market",
            "sell",
            amount,
            price
        );
        const size = response.info.filled.totalSz;
        const fillPrice = response.info.filled.avgPx;
        const orderId = response.info.filled.oid;
        return { size, fillPrice, orderId };
    }

    async marketBuy(symbol: string, amount: number): Promise<any> {
        const price = await this.fetchMarkPrice(symbol);
        symbol += "/USDC:USDC";
        const response = await this.apiCall(
            "createOrder",
            symbol,
            "market",
            "buy",
            amount,
            price,
            { reduceOnly: true, slippage: 1 }
        );
        const size = response.info.filled.totalSz;
        const fillPrice = response.info.filled.avgPx;
        const orderId = response.info.filled.oid;
        return { size, fillPrice, orderId };
    }

    async removeMargin(symbol: string, amount: number): Promise<any> {
        await this.apiCall("reduceMargin", symbol + "/USDC:USDC", amount);
        const position = await this.fetchPosition(symbol);
        return position;
    }

    async addMargin(symbol: string, amount: number): Promise<any> {
        await this.apiCall("addMargin", symbol + "/USDC:USDC", amount);
        const position = await this.fetchPosition(symbol);
        return position;
    }

    async apiCall(fn: string, ...args: any[]): Promise<any> {
        let report: any = {
            exchange: "hyperliquid",
            fn,
            args,
        };
        try {
            const response = await this.hyperliquid[fn](...args);
            report = { ...report, response };
            console.log(report);
            return response;
        } catch (e: any) {
            if (!e) e = "";
            report = { ...report, error: e.toString() };
            console.log(report);
            throw new Error(e);
        }
    }
}
