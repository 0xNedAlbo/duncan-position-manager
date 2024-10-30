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
