import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { Exchange } from "../../../../lib/exchange";
import { arbitrum } from "viem/chains";
import {
    createWalletClient,
    getContract,
    http,
    isAddress,
    PrivateKeyAccount,
    WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import vaultAbi from "../../../../lib/abis/managedVaultAbi.json";

type Config = {
    apiKey: string;
    client: WalletClient;
    privateKey: `0x{string}`;
};

function getConfig(): Config {
    const apiKey = process.env.NEXT_PUBLIC_API_KEY;
    if (!apiKey) throw new Error("missing env variable NEXT_PUBLIC_API_KEY");
    const privateKey = process.env.NEXT_PUBLIC_PRIVATE_KEY as `0x{string}`;
    if (!privateKey)
        throw new Error("missing env variable NEXT_PUBLIC_PRIVATE_KEY");
    const arbitrumRpcUrl = process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL;
    if (!arbitrumRpcUrl)
        throw new Error("missing env variable NEXT_PUBLIC_ARBITRUM_RPC_URL");
    const account = privateKeyToAccount(
        process.env.NEXT_PUBLIC_PRIVATE_KEY! as `0x{string}`
    );
    const client = createWalletClient({
        account,
        chain: arbitrum,
        transport: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL),
    });
    return { apiKey, client, privateKey };
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ address: string }> }
) {
    const { client, apiKey, privateKey } = getConfig();
    const searchParams = request.nextUrl.searchParams;
    if (request.headers.get("duncan-api-key") != apiKey)
        return NextResponse.json({ status: 401, error: "not authorized" });

    const simulate = searchParams.get("simulate");
    const address = (await params).address;
    if (!isAddress(address))
        NextResponse.json({
            status: 400,
            error: "Invalid vault address",
        });

    const contract = getContract({
        client,
        address: address as `0x{string}`,
        abi: vaultAbi,
    });
    let symbol = (await contract.read.symbol()) as string;
    symbol = symbol.replace(/^s\dx/, "");
    const decimals = (await contract.read.decimals()) as number;

    const exchange = Exchange.get(false, {
        account: (client.account as PrivateKeyAccount).address as `0x{string}`,
        privateKey,
    });
    const positionInfo = (await exchange.fetchPosition(symbol)) as {
        margin: number;
    };
    if (!positionInfo) return notFound();
    const assetsInUse =
        (BigInt(Math.floor(positionInfo.margin * 10000)) *
            10n ** BigInt(decimals)) /
        10000n;
    if (!simulate) await contract.write.setAssetsInUse([assetsInUse]);
    return NextResponse.json({
        vault: address,
        fn: "setAssetsInUse",
        args: ["" + assetsInUse],
    });
}
