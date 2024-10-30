import * as dotenv from "dotenv";
import { Command } from "commander";

import { Exchange } from "../lib/exchange";

dotenv.config({
    path:
        process.env.NODE_ENV === "production"
            ? ".env.production"
            : ".env.development",
});
const VERSION = "0.1.0";

const program = new Command();

let useTestnet = false;

program
    .name("duncan")
    .description("Manager for perp hedge positions.")
    .option("-t, --testnet", "Uses Arbitrum Sepolia testnet.", () => {
        useTestnet = true;
        return true;
    })
    .version(VERSION);

program
    .command("balance")
    .description(
        "Shows the current exchange balance which is available to trade."
    )
    .action(async () => {
        await output(async () => {
            return await Exchange.get(useTestnet).fetchBalance();
        });
    });

program
    .command("price")
    .description("Retrieves the current mark price for the vault asset.")
    .argument("<SYMBOL>")
    .action(async (symbol: string) => {
        await output(async () => {
            const price = await Exchange.get(useTestnet).fetchMarkPrice(symbol);
            if (!price) throw new Error("Asset not found:" + symbol);
            return { price };
        });
    });

program
    .command("info")
    .description("Shows the position for the vault")
    .argument("<SYMBOL>")
    .action(async (symbol: string) => {
        await output(async () => {
            const position = await Exchange.get(useTestnet).fetchPosition(
                symbol
            );
            if (!position)
                throw new Error(
                    "Unable to find a matching short position for " +
                        symbol +
                        "."
                );
            return position;
        });
    });

program
    .command("decrease")
    .description("Decreases the position size by an amount of assets")
    .argument("<SYMBOL>")
    .argument("<AMOUNT OF ASSETS>")
    .action(async (symbol: string, amount: number) => {
        output(async () => {
            amount = Math.floor(amount);
            const position = await Exchange.get(useTestnet).fetchPosition(
                symbol
            );
            if (!position)
                throw new Error("No short positions for " + symbol + ".");
            return await Exchange.get(useTestnet).marketBuy(symbol, amount);
        });
    });

program
    .command("increase")
    .description("Increases the position size by an amount of assets")
    .argument("<SYMBOL>")
    .argument("<AMOUNT OF ASSETS>")
    .action(async (symbol: string, amount: number) => {
        await output(async () => {
            amount = Math.floor(amount);
            const position = await Exchange.get(useTestnet).fetchPosition(
                symbol
            );
            if (!position)
                throw new Error("No short positions for " + symbol + ".");
            const order = await Exchange.get(useTestnet).marketSell(
                symbol,
                amount
            );
            return order;
        });
    });

program
    .command("rebalance")
    .description("Rebalances the position back to the original leverage.")
    .argument("<SYMBOL>")
    .action(async (symbol: string) => {
        await output(async () => {
            const position = await Exchange.get(useTestnet).fetchPosition(
                symbol
            );
            if (!position)
                throw new Error("No short positions for " + symbol + ".");

            const targetLeverage = position.leverage.start;
            const currentLeverage = position.notional / position.margin;
            let report: any = {
                leverage: {
                    current: currentLeverage,
                    target: targetLeverage,
                },
            };

            const price = await Exchange.get(useTestnet).fetchMarkPrice(symbol);
            if (!price) throw new Error("No price for asset " + symbol + ".");

            if (targetLeverage > currentLeverage) {
                const targetMargin = position.notional / targetLeverage;
                const deltaMargin = Math.floor(position.margin - targetMargin);
                const deltaNotional = deltaMargin * targetLeverage;
                if (deltaNotional < 10)
                    throw new Error(
                        "Change in notional under minimum trade size."
                    );
                await Exchange.get(useTestnet).removeMargin(
                    symbol,
                    deltaMargin
                );
                report = {
                    ...report,
                    margin: {
                        current: position.margin,
                        target: targetMargin,
                        change: deltaMargin,
                        side: "remove",
                    },
                };

                const deltaSize = deltaNotional / (price as number);
                const order = await Exchange.get(useTestnet).marketSell(
                    symbol,
                    deltaSize
                );
                report = {
                    ...report,
                    notional: {
                        current: position.notional,
                        target: position.notional + deltaNotional,
                        change: deltaNotional,
                        side: "sell",
                        order,
                    },
                };
            } else {
                const targetNotional = position.margin * targetLeverage;
                const deltaNotional = Math.floor(
                    position.notional - targetNotional
                );
                let order;
                if (deltaNotional < 10) {
                    throw new Error(
                        "Change in notional under minimum trade size."
                    );
                }
                const deltaSize = deltaNotional / (price as number);
                order = await Exchange.get(useTestnet).marketBuy(
                    symbol,
                    deltaSize
                );

                report = {
                    ...report,
                    notional: {
                        current: position.notional,
                        target: targetNotional,
                        change: deltaNotional,
                        side: "buy",
                        order,
                    },
                };
                const { amount: balance } = await Exchange.get(
                    useTestnet
                ).fetchBalance();
                const availableMargin = Math.min(
                    targetNotional / currentLeverage,
                    balance
                );
                await Exchange.get(useTestnet).addMargin(
                    symbol,
                    availableMargin
                );
                report = {
                    ...report,
                    margin: {
                        current: position.margin,
                        target: position.margin + availableMargin,
                        change: availableMargin,
                        side: "add",
                    },
                };
            }
            return report;
        });
    });

async function main() {
    await program.parseAsync();
}
main();

async function output(fn: () => any) {
    try {
        const result = await fn();
        console.log(JSON.stringify(result, undefined, 2));
    } catch (err: any) {
        console.log({
            error: JSON.stringify(err.message, undefined, 2),
        });
    }
}
