import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AlphaClient } from '@alpha-arcade/sdk';
import algosdk from 'algosdk';
import { z } from 'zod';

// ============================================
// Configuration from environment variables
// ============================================

const MNEMONIC = process.env.ALPHA_MNEMONIC;
const API_KEY = process.env.ALPHA_API_KEY;
const ALGOD_SERVER = process.env.ALPHA_ALGOD_SERVER || 'https://mainnet-api.algonode.cloud';
const ALGOD_TOKEN = process.env.ALPHA_ALGOD_TOKEN || '';
const ALGOD_PORT = process.env.ALPHA_ALGOD_PORT || '443';
const INDEXER_SERVER = process.env.ALPHA_INDEXER_SERVER || 'https://mainnet-idx.algonode.cloud';
const INDEXER_TOKEN = process.env.ALPHA_INDEXER_TOKEN || '';
const INDEXER_PORT = process.env.ALPHA_INDEXER_PORT || '443';
const MATCHER_APP_ID = Number(process.env.ALPHA_MATCHER_APP_ID || '3078581851');
const USDC_ASSET_ID = Number(process.env.ALPHA_USDC_ASSET_ID || '31566704');
const API_BASE_URL = process.env.ALPHA_API_BASE_URL || 'https://partners.alphaarcade.com/api';

// ============================================
// Build the Alpha client
// ============================================

/** Creates a full trading client (requires mnemonic) */
const createTradingClient = (): AlphaClient | null => {
  if (!MNEMONIC) return null;

  const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
  const indexerClient = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_SERVER, INDEXER_PORT);
  const account = algosdk.mnemonicToSecretKey(MNEMONIC);
  const signer = algosdk.makeBasicAccountTransactionSigner(account);

  return new AlphaClient({
    algodClient,
    indexerClient,
    signer,
    activeAddress: account.addr,
    matcherAppId: MATCHER_APP_ID,
    usdcAssetId: USDC_ASSET_ID,
    apiBaseUrl: API_BASE_URL,
    apiKey: API_KEY || undefined,
  });
};

/** Creates a read-only client (no mnemonic needed, works with zero config) */
const createReadOnlyClient = (): AlphaClient => {
  const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
  const indexerClient = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_SERVER, INDEXER_PORT);
  const dummySigner: algosdk.TransactionSigner = async () => [];

  return new AlphaClient({
    algodClient,
    indexerClient,
    signer: dummySigner,
    activeAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
    matcherAppId: MATCHER_APP_ID,
    usdcAssetId: USDC_ASSET_ID,
    apiBaseUrl: API_BASE_URL,
    apiKey: API_KEY || undefined,
  });
};

const requireTradingClient = (): AlphaClient => {
  const client = createTradingClient();
  if (!client) {
    throw new Error(
      'ALPHA_MNEMONIC environment variable is required for trading operations. ' +
      'Set it in your MCP server configuration.'
    );
  }
  return client;
};

const getReadOnlyClient = (): AlphaClient => {
  return createTradingClient() ?? createReadOnlyClient();
};

// ============================================
// Helpers
// ============================================

const formatPrice = (microunits: number): string => `$${(microunits / 1_000_000).toFixed(2)}`;
const formatQty = (microunits: number): string => `${(microunits / 1_000_000).toFixed(2)} shares`;

const textResult = (text: string) => ({
  content: [{ type: 'text' as const, text }],
});

// ============================================
// MCP Server
// ============================================

const server = new McpServer({
  name: 'alpha-arcade',
  version: '0.1.0',
});

// ------------------------------------------
// Read-only tools (only need API key)
// ------------------------------------------

server.tool(
  'get_markets',
  {
    description: 'Fetch all live, tradeable prediction markets from Alpha Arcade. Returns market titles, prices, volume, and app IDs.',
  },
  async () => {
    const client = getReadOnlyClient();
    const markets = await client.getMarkets();
    const summary = markets.map((m) => ({
      id: m.id,
      title: m.title,
      marketAppId: m.marketAppId,
      yesPrice: formatPrice(m.yesProb),
      noPrice: formatPrice(m.noProb),
      volume: formatPrice(m.volume),
      endsAt: new Date(m.endTs * 1000).toISOString(),
      isResolved: m.isResolved ?? false,
      categories: m.categories ?? [],
    }));
    return textResult(JSON.stringify(summary, null, 2));
  },
);

server.tool(
  'get_market',
  {
    description: 'Fetch a single market by its ID. Returns full market details including options for multi-choice markets.',
    marketId: z.string().describe('The market ID'),
  },
  async ({ marketId }) => {
    const client = getReadOnlyClient();
    const market = await client.getMarket(marketId);
    if (!market) return textResult(`Market "${marketId}" not found.`);
    return textResult(JSON.stringify(market, null, 2));
  },
);

server.tool(
  'get_orderbook',
  {
    description: 'Fetch the full on-chain orderbook for a market. Shows all YES and NO bids and asks with prices, quantities, and escrow app IDs.',
    marketAppId: z.number().describe('The market app ID (number)'),
  },
  async ({ marketAppId }) => {
    const client = getReadOnlyClient();
    const book = await client.getOrderbook(marketAppId);

    const formatSide = (entries: Array<{ price: number; quantity: number; escrowAppId: number; owner: string }>) =>
      entries.map((e) => ({
        price: formatPrice(e.price),
        quantity: formatQty(e.quantity),
        escrowAppId: e.escrowAppId,
        owner: e.owner,
      }));

    const result = {
      yes: { bids: formatSide(book.yes.bids), asks: formatSide(book.yes.asks) },
      no: { bids: formatSide(book.no.bids), asks: formatSide(book.no.asks) },
      totalOrders:
        book.yes.bids.length + book.yes.asks.length + book.no.bids.length + book.no.asks.length,
    };
    return textResult(JSON.stringify(result, null, 2));
  },
);

server.tool(
  'get_open_orders',
  {
    description: 'Fetch all open orders for a wallet on a specific market. Defaults to the configured wallet if no address is provided.',
    marketAppId: z.number().describe('The market app ID'),
    walletAddress: z.string().optional().describe('Algorand wallet address (defaults to configured wallet)'),
  },
  async ({ marketAppId, walletAddress }) => {
    const client = getReadOnlyClient();
    const orders = await client.getOpenOrders(marketAppId, walletAddress);
    const formatted = orders.map((o) => ({
      escrowAppId: o.escrowAppId,
      position: o.position === 1 ? 'YES' : 'NO',
      side: o.side === 1 ? 'BUY' : 'SELL',
      price: formatPrice(o.price),
      quantity: formatQty(o.quantity),
      filled: formatQty(o.quantityFilled),
      remaining: formatQty(o.quantity - o.quantityFilled),
    }));
    return textResult(
      formatted.length > 0
        ? JSON.stringify(formatted, null, 2)
        : 'No open orders found for this wallet on this market.',
    );
  },
);

server.tool(
  'get_positions',
  {
    description: 'Fetch all YES/NO token positions for a wallet across all markets. Defaults to the configured wallet.',
    walletAddress: z.string().optional().describe('Algorand wallet address (defaults to configured wallet)'),
  },
  async ({ walletAddress }) => {
    const client = getReadOnlyClient();
    const positions = await client.getPositions(walletAddress);
    const formatted = positions.map((p) => ({
      marketAppId: p.marketAppId,
      yesBalance: formatQty(p.yesBalance),
      noBalance: formatQty(p.noBalance),
    }));
    return textResult(
      formatted.length > 0
        ? JSON.stringify(formatted, null, 2)
        : 'No positions found for this wallet.',
    );
  },
);

// ------------------------------------------
// Write tools (require mnemonic + API key)
// ------------------------------------------

server.tool(
  'create_limit_order',
  {
    description:
      'Place a limit order on a prediction market. The order sits on the orderbook at your exact price until matched or cancelled. ' +
      'Price is in microunits (500000 = $0.50). Quantity is in microunits (1000000 = 1 share).',
    marketAppId: z.number().describe('The market app ID'),
    position: z.union([z.literal(0), z.literal(1)]).describe('1 = Yes, 0 = No'),
    price: z.number().describe('Price in microunits (e.g. 500000 = $0.50)'),
    quantity: z.number().describe('Quantity in microunits (e.g. 1000000 = 1 share)'),
    isBuying: z.boolean().describe('true = buy order, false = sell order'),
  },
  async ({ marketAppId, position, price, quantity, isBuying }) => {
    const client = requireTradingClient();
    const result = await client.createLimitOrder({
      marketAppId,
      position: position as 0 | 1,
      price,
      quantity,
      isBuying,
    });
    return textResult(
      `Limit order created.\n` +
      `  Escrow App ID: ${result.escrowAppId}\n` +
      `  Position: ${position === 1 ? 'YES' : 'NO'}\n` +
      `  Side: ${isBuying ? 'BUY' : 'SELL'}\n` +
      `  Price: ${formatPrice(price)}\n` +
      `  Quantity: ${formatQty(quantity)}\n` +
      `  Tx IDs: ${result.txIds.join(', ')}\n` +
      `  Confirmed round: ${result.confirmedRound}`,
    );
  },
);

server.tool(
  'create_market_order',
  {
    description:
      'Place a market order that automatically matches against existing orders on the orderbook. ' +
      'Fetches the best counterparty orders within your slippage tolerance and matches atomically. ' +
      'Price is in microunits (500000 = $0.50). Slippage is in microunits (50000 = $0.05).',
    marketAppId: z.number().describe('The market app ID'),
    position: z.union([z.literal(0), z.literal(1)]).describe('1 = Yes, 0 = No'),
    price: z.number().describe('Price in microunits (e.g. 500000 = $0.50)'),
    quantity: z.number().describe('Quantity in microunits (e.g. 1000000 = 1 share)'),
    isBuying: z.boolean().describe('true = buy order, false = sell order'),
    slippage: z.number().describe('Slippage tolerance in microunits (e.g. 50000 = $0.05)'),
  },
  async ({ marketAppId, position, price, quantity, isBuying, slippage }) => {
    const client = requireTradingClient();
    const result = await client.createMarketOrder({
      marketAppId,
      position: position as 0 | 1,
      price,
      quantity,
      isBuying,
      slippage,
    });
    return textResult(
      `Market order created and matched.\n` +
      `  Escrow App ID: ${result.escrowAppId}\n` +
      `  Position: ${position === 1 ? 'YES' : 'NO'}\n` +
      `  Side: ${isBuying ? 'BUY' : 'SELL'}\n` +
      `  Price: ${formatPrice(price)}\n` +
      `  Quantity: ${formatQty(quantity)}\n` +
      `  Matched: ${formatQty(result.matchedQuantity)}\n` +
      `  Tx IDs: ${result.txIds.join(', ')}\n` +
      `  Confirmed round: ${result.confirmedRound}`,
    );
  },
);

server.tool(
  'cancel_order',
  {
    description:
      'Cancel an open order by its escrow app ID. Returns escrowed funds to the order owner and reclaims ALGO minimum balance.',
    marketAppId: z.number().describe('The market app ID'),
    escrowAppId: z.number().describe('The escrow app ID of the order to cancel'),
    orderOwner: z.string().describe('The Algorand address that owns the order'),
  },
  async ({ marketAppId, escrowAppId, orderOwner }) => {
    const client = requireTradingClient();
    const result = await client.cancelOrder({ marketAppId, escrowAppId, orderOwner });
    return textResult(
      result.success
        ? `Order cancelled successfully.\n  Escrow App ID: ${escrowAppId}\n  Tx IDs: ${result.txIds.join(', ')}`
        : `Failed to cancel order ${escrowAppId}.`,
    );
  },
);

server.tool(
  'propose_match',
  {
    description:
      'Propose a match between an existing maker order and the configured wallet as taker. ' +
      'Use this for advanced matching when you want to explicitly specify which order to match against.',
    marketAppId: z.number().describe('The market app ID'),
    makerEscrowAppId: z.number().describe('The escrow app ID of the maker order'),
    makerAddress: z.string().describe('The Algorand address of the maker'),
    quantityMatched: z.number().describe('Quantity to match in microunits'),
  },
  async ({ marketAppId, makerEscrowAppId, makerAddress, quantityMatched }) => {
    const client = requireTradingClient();
    const result = await client.proposeMatch({
      marketAppId,
      makerEscrowAppId,
      makerAddress,
      quantityMatched,
    });
    return textResult(
      result.success
        ? `Match proposed successfully.\n  Maker escrow: ${makerEscrowAppId}\n  Quantity: ${formatQty(quantityMatched)}\n  Tx IDs: ${result.txIds.join(', ')}`
        : `Failed to propose match with escrow ${makerEscrowAppId}.`,
    );
  },
);

server.tool(
  'split_shares',
  {
    description:
      'Split USDC into equal amounts of YES and NO outcome tokens for a market. ' +
      'For example, splitting 1 USDC (1000000 microunits) gives you 1 YES + 1 NO token. ' +
      'Together they are always worth $1.00.',
    marketAppId: z.number().describe('The market app ID'),
    amount: z.number().describe('Amount to split in microunits (e.g. 1000000 = $1.00 USDC)'),
  },
  async ({ marketAppId, amount }) => {
    const client = requireTradingClient();
    const result = await client.splitShares({ marketAppId, amount });
    return textResult(
      `Split ${formatPrice(amount)} USDC into YES + NO tokens.\n` +
      `  Tx IDs: ${result.txIds.join(', ')}\n` +
      `  Confirmed round: ${result.confirmedRound}`,
    );
  },
);

server.tool(
  'merge_shares',
  {
    description:
      'Merge equal amounts of YES and NO outcome tokens back into USDC. ' +
      'The inverse of split: 1 YES + 1 NO = 1 USDC, always.',
    marketAppId: z.number().describe('The market app ID'),
    amount: z.number().describe('Amount to merge in microunits'),
  },
  async ({ marketAppId, amount }) => {
    const client = requireTradingClient();
    const result = await client.mergeShares({ marketAppId, amount });
    return textResult(
      `Merged YES + NO tokens back into ${formatPrice(amount)} USDC.\n` +
      `  Tx IDs: ${result.txIds.join(', ')}\n` +
      `  Confirmed round: ${result.confirmedRound}`,
    );
  },
);

server.tool(
  'claim',
  {
    description:
      'Claim USDC from a resolved market by redeeming outcome tokens. ' +
      'Winning tokens are redeemed 1:1 for USDC. Losing tokens are burned.',
    marketAppId: z.number().describe('The market app ID'),
    assetId: z.number().describe('The outcome token ASA ID to redeem'),
    amount: z.number().optional().describe('Amount to claim in microunits (omit to claim entire balance)'),
  },
  async ({ marketAppId, assetId, amount }) => {
    const client = requireTradingClient();
    const result = await client.claim({ marketAppId, assetId, amount });
    return textResult(
      `Claim successful.\n` +
      `  Tx IDs: ${result.txIds.join(', ')}\n` +
      `  Confirmed round: ${result.confirmedRound}`,
    );
  },
);

// ============================================
// Start the server
// ============================================

const transport = new StdioServerTransport();
await server.connect(transport);
