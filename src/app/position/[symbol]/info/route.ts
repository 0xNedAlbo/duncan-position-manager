import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { Exchange } from "../../../../lib/exchange";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    const searchParams = request.nextUrl.searchParams;
    const testnet = searchParams.get("testnet");
    const symbol = (await params).symbol;
    const exchange = Exchange.get(!!testnet);
    const positionInfo = await exchange.fetchPosition(symbol);
    if (!positionInfo) return notFound();
    return NextResponse.json(positionInfo);
}
