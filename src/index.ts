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

/** Returns the configured wallet address, or null if no mnemonic is set */
const getConfiguredWalletAddress = (): string | null => {
  if (!MNEMONIC) return null;
  try {
    const account = algosdk.mnemonicToSecretKey(MNEMONIC);
    return account.addr;
  } catch {
    return null;
  }
};

/** Resolves the wallet address for position/order lookups. Throws a clear error if missing. */
const resolveWalletAddress = (walletAddress?: string): string => {
  if (walletAddress) return walletAddress;
  const configured = getConfiguredWalletAddress();
  if (configured) return configured;
  throw new Error(
    'No wallet address provided. Either pass a walletAddress parameter, or set ALPHA_MNEMONIC in your MCP server configuration so the default wallet is used.'
  );
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
// Agent Guide
// ============================================

const AGENT_GUIDE = `# Alpha Arcade — Agent Guide

## Units

All prices and quantities in tool **inputs** use **microunits**: 1,000,000 = $1.00 or 1 share.

| Human value | Microunit value |
|---|---|
| $0.50 | 500,000 |
| $0.05 slippage | 50,000 |
| 1 share | 1,000,000 |
| 30 shares | 30,000,000 |

Tool **outputs** from read tools (get_orderbook, get_open_orders, get_positions) return pre-formatted strings like "$0.50" and "2.50 shares". Write tools accept raw microunit integers.

## Market Data Model

### Binary markets
A standard yes/no market has a single \`marketAppId\`, \`yesAssetId\`, and \`noAssetId\`. Use \`marketAppId\` for all trading calls.

### Multi-choice markets
Multi-choice markets (e.g., "Who wins the election?") appear with an \`options[]\` array. Each option is its own binary market with its own \`marketAppId\`:

\`\`\`json
{
  "title": "Presidential Election Winner 2028",
  "options": [
    { "title": "Candidate A", "marketAppId": 100001, "yesAssetId": 111, "noAssetId": 112 },
    { "title": "Candidate B", "marketAppId": 100002, "yesAssetId": 113, "noAssetId": 114 }
  ]
}
\`\`\`

**Always trade using the option's \`marketAppId\`, not the parent.**

## Orderbook Mechanics

### Four-sided book
The orderbook has four sides: YES bids, YES asks, NO bids, NO asks.

### Cross-side equivalence
Because YES + NO always = $1.00:
- A **YES bid at $0.30** is economically equivalent to a **NO ask at $0.70**
- A **NO bid at $0.71** is economically equivalent to a **YES ask at $0.29**

When looking for the best price to buy YES, check both YES asks AND NO bids (complement). The SDK's \`create_market_order\` handles this automatically, but it's important when reading the orderbook.

### Limit vs market orders
- **Limit order** (\`create_limit_order\`): Sits on the orderbook at your exact price. No matching happens.
- **Market order** (\`create_market_order\`): Auto-matches against existing orders within your slippage tolerance. Returns the actual fill price.

## Collateral

Every order locks ~0.957 ALGO as minimum balance requirement (MBR) for the on-chain escrow app. This is refunded when the order is cancelled or filled.

Buy orders also lock USDC collateral = quantity × (price + slippage) + fees.
Sell orders lock outcome tokens as collateral.

## Key Workflows

### Buying shares
1. \`get_live_markets\` — find a market
2. \`get_orderbook\` — check available liquidity
3. \`create_market_order\` (auto-matches) or \`create_limit_order\` (rests on book)
4. Save the returned \`escrowAppId\` — you need it to cancel

### Checking your portfolio
1. \`get_positions\` — see all YES/NO token balances with market titles and asset IDs
2. For open orders on a specific market: \`get_open_orders\` with the \`marketAppId\`

### Cancelling an order
1. \`get_open_orders\` — find the \`escrowAppId\` and \`owner\` address
2. \`cancel_order\` with \`marketAppId\`, \`escrowAppId\`, and \`orderOwner\`

### Claiming from a resolved market
1. \`get_positions\` — find markets with token balances; note the \`yesAssetId\` or \`noAssetId\`
2. \`claim\` with \`marketAppId\` and the winning token's \`assetId\`

## Common Pitfalls

- **Multi-choice markets**: The parent has no \`marketAppId\` for trading. Use \`options[].marketAppId\`.
- **Prices are microunits in inputs**: $0.50 = 500,000, not 0.5 or 50.
- **Orderbook cross-side**: If you only check YES asks, you miss cheaper liquidity from NO bids.
- **Save escrowAppId**: It's the only way to cancel or reference your order later.
- **Wallet required for trading**: Read-only tools work without \`ALPHA_MNEMONIC\`, but trading tools require it.
`;

// ============================================
// MCP Server
// ============================================

const server = new McpServer({
  name: 'alpha-arcade',
  version: '0.1.0',
});

// ------------------------------------------
// Resources
// ------------------------------------------

server.registerResource(
  'agent-guide',
  'alpha-arcade://agent-guide',
  { description: 'Agent guide for Alpha Arcade prediction markets — data model, units, mechanics, workflows, and common pitfalls', mimeType: 'text/markdown' },
  async () => ({
    contents: [{
      uri: 'alpha-arcade://agent-guide',
      mimeType: 'text/markdown',
      text: AGENT_GUIDE,
    }],
  }),
);

// ------------------------------------------
// Read-only tools
// ------------------------------------------

server.tool(
  'get_live_markets',
  'Fetch all live markets. Returns summary: id, title, marketAppId, prices, volume. Multi-choice markets have an options[] array — use options[].marketAppId for trading, not the parent. Prices (yesPrice/noPrice) are formatted as dollars. Read the agent-guide resource for full data model details.',
  async () => {
    const client = getReadOnlyClient();
    const markets = await client.getLiveMarkets();
    const summary = markets.map((m) => {
      const entry: Record<string, unknown> = {
        id: m.id,
        title: m.title,
        marketAppId: m.marketAppId,
        yesAssetId: m.yesAssetId || undefined,
        noAssetId: m.noAssetId || undefined,
        endsAt: new Date(m.endTs * 1000).toISOString(),
        isResolved: m.isResolved ?? false,
        source: m.source ?? 'unknown',
      };
      // API returns yesProb as a percentage (e.g. 40 = 40% = $0.40), volume as dollars.
      // On-chain markets don't have these fields.
      if (m.yesProb != null) entry.yesPrice = `$${(m.yesProb / 100).toFixed(2)}`;
      if (m.noProb != null) entry.noPrice = `$${(m.noProb / 100).toFixed(2)}`;
      if (m.volume != null) entry.volume = `$${m.volume.toFixed(2)}`;
      if (m.categories?.length) entry.categories = m.categories;
      if (m.feeBase != null) entry.feeBase = m.feeBase;
      if (m.options?.length) entry.options = m.options.map((o) => ({
        title: o.title,
        marketAppId: o.marketAppId,
        yesAssetId: o.yesAssetId,
        noAssetId: o.noAssetId,
      }));
      return entry;
    });
    return textResult(JSON.stringify(summary, null, 2));
  },
);

server.tool(
  'get_market',
  'Fetch full details for a single market by ID (app ID string for on-chain, UUID for API). Returns the complete market object including options for multi-choice markets.',
  { marketId: z.string().describe('The market ID (app ID string for on-chain, UUID for API)') },
  async ({ marketId }) => {
    const client = getReadOnlyClient();
    const market = await client.getMarket(marketId);
    if (!market) return textResult(`Market "${marketId}" not found.`);
    return textResult(JSON.stringify(market, null, 2));
  },
);

server.tool(
  'get_orderbook',
  'Fetch the on-chain orderbook as a unified YES-perspective view. Merges all 4 sides (YES bids/asks + NO bids/asks) into a single book: NO bids become YES asks at $(1-X), NO asks become YES bids at $(1-X). Asks sorted low-to-high, bids sorted high-to-low. Includes spread calculation.',
  { marketAppId: z.number().describe('The market app ID (number)') },
  async ({ marketAppId }) => {
    const client = getReadOnlyClient();
    const book = await client.getOrderbook(marketAppId);

    type RawEntry = { price: number; quantity: number; escrowAppId: number; owner: string };
    type UnifiedEntry = { price: string; priceRaw: number; shares: string; total: string; escrowAppId: number; owner: string; source: string };

    const toUnified = (e: RawEntry, source: string, priceOverride?: number): UnifiedEntry => {
      const p = priceOverride ?? e.price;
      const priceCents = p / 1_000_000;
      const shares = e.quantity / 1_000_000;
      return {
        price: `${(priceCents * 100).toFixed(2)}¢`,
        priceRaw: p,
        shares: `${shares.toFixed(2)}`,
        total: `$${(priceCents * shares).toFixed(2)}`,
        escrowAppId: e.escrowAppId,
        owner: e.owner,
        source,
      };
    };

    const asks: UnifiedEntry[] = [
      ...book.yes.asks.map((e: RawEntry) => toUnified(e, 'YES ask')),
      ...book.no.bids.map((e: RawEntry) => toUnified(e, 'NO bid (= YES ask)', 1_000_000 - e.price)),
    ].sort((a, b) => a.priceRaw - b.priceRaw);

    const bids: UnifiedEntry[] = [
      ...book.yes.bids.map((e: RawEntry) => toUnified(e, 'YES bid')),
      ...book.no.asks.map((e: RawEntry) => toUnified(e, 'NO ask (= YES bid)', 1_000_000 - e.price)),
    ].sort((a, b) => b.priceRaw - a.priceRaw);

    const bestAsk = asks.length > 0 ? asks[0].priceRaw : null;
    const bestBid = bids.length > 0 ? bids[0].priceRaw : null;
    const spread = bestAsk != null && bestBid != null
      ? `${((bestAsk - bestBid) / 10_000).toFixed(2)}¢`
      : 'N/A';

    const totalOrders = book.yes.bids.length + book.yes.asks.length + book.no.bids.length + book.no.asks.length;

    const result = {
      unified: { asks, bids, spread },
      totalOrders,
    };
    return textResult(JSON.stringify(result, null, 2));
  },
);

server.tool(
  'get_open_orders',
  'Fetch all open orders for a wallet on a specific market. You must provide walletAddress or set ALPHA_MNEMONIC.',
  {
    marketAppId: z.number().describe('The market app ID'),
    walletAddress: z.string().optional().describe('Algorand wallet address (required if ALPHA_MNEMONIC is not set)'),
  },
  async ({ marketAppId, walletAddress }) => {
    const address = resolveWalletAddress(walletAddress);
    const client = getReadOnlyClient();
    const orders = await client.getOpenOrders(marketAppId, address);
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
  'Fetch all YES/NO token positions for a wallet across all markets. You must provide walletAddress or set ALPHA_MNEMONIC.',
  {
    walletAddress: z.string().optional().describe('Algorand wallet address (required if ALPHA_MNEMONIC is not set)'),
  },
  async ({ walletAddress }) => {
    const address = resolveWalletAddress(walletAddress);
    const client = getReadOnlyClient();
    const positions = await client.getPositions(address);
    const formatted = positions.map((p) => ({
      marketAppId: p.marketAppId,
      title: p.title || `Market ${p.marketAppId}`,
      yesBalance: formatQty(p.yesBalance),
      noBalance: formatQty(p.noBalance),
      yesAssetId: p.yesAssetId,
      noAssetId: p.noAssetId,
    }));
    return textResult(
      formatted.length > 0
        ? JSON.stringify(formatted, null, 2)
        : 'No positions found for this wallet.',
    );
  },
);

// ------------------------------------------
// Write tools (require mnemonic)
// ------------------------------------------

server.tool(
  'create_limit_order',
  'Place a limit order on a prediction market. Price and quantity in microunits (500000 = $0.50, 1000000 = 1 share). Locks ~0.957 ALGO collateral (refunded on cancel/fill). Returns escrowAppId — save it for cancel_order.',
  {
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
      `  Market App ID: ${marketAppId}\n` +
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
  'Place a market order with auto-matching against best available counterparty orders. Price, quantity, and slippage in microunits (500000 = $0.50, 1000000 = 1 share, 50000 = $0.05 slippage). Locks ~0.957 ALGO collateral. Returns escrowAppId, matched quantity, and actual fill price.',
  {
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
      `  Market App ID: ${marketAppId}\n` +
      `  Escrow App ID: ${result.escrowAppId}\n` +
      `  Position: ${position === 1 ? 'YES' : 'NO'}\n` +
      `  Side: ${isBuying ? 'BUY' : 'SELL'}\n` +
      `  Submitted Price: ${formatPrice(price)}\n` +
      `  Fill Price: ${formatPrice(result.matchedPrice)}\n` +
      `  Quantity: ${formatQty(quantity)}\n` +
      `  Matched: ${formatQty(result.matchedQuantity)}\n` +
      `  Tx IDs: ${result.txIds.join(', ')}\n` +
      `  Confirmed round: ${result.confirmedRound}`,
    );
  },
);

server.tool(
  'cancel_order',
  'Cancel an open order. Requires escrowAppId (from create_limit_order or get_open_orders) and orderOwner (the Algorand address that created it). Refunds USDC/tokens and ~0.957 ALGO collateral.',
  {
    marketAppId: z.number().describe('The market app ID'),
    escrowAppId: z.number().describe('The escrow app ID of the order to cancel'),
    orderOwner: z.string().describe('The Algorand address that owns the order'),
  },
  async ({ marketAppId, escrowAppId, orderOwner }) => {
    const client = requireTradingClient();
    const result = await client.cancelOrder({ marketAppId, escrowAppId, orderOwner });
    return textResult(
      result.success
        ? `Order cancelled successfully.\n  Market App ID: ${marketAppId}\n  Escrow App ID: ${escrowAppId}\n  Tx IDs: ${result.txIds.join(', ')}\n  Confirmed round: ${result.confirmedRound}`
        : `Failed to cancel order ${escrowAppId}.`,
    );
  },
);

server.tool(
  'propose_match',
  'Propose a match between an existing maker order and the configured wallet as taker. The maker escrowAppId and address can be found via get_orderbook. quantityMatched is in microunits.',
  {
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
        ? `Match proposed successfully.\n  Market App ID: ${marketAppId}\n  Maker Escrow: ${makerEscrowAppId}\n  Quantity: ${formatQty(quantityMatched)}\n  Tx IDs: ${result.txIds.join(', ')}\n  Confirmed round: ${result.confirmedRound}`
        : `Failed to propose match with escrow ${makerEscrowAppId}.`,
    );
  },
);

server.tool(
  'split_shares',
  'Split USDC into equal YES and NO outcome tokens. 1 USDC (1000000 microunits) = 1 YES + 1 NO.',
  {
    marketAppId: z.number().describe('The market app ID'),
    amount: z.number().describe('Amount to split in microunits (e.g. 1000000 = $1.00 USDC)'),
  },
  async ({ marketAppId, amount }) => {
    const client = requireTradingClient();
    const result = await client.splitShares({ marketAppId, amount });
    return textResult(
      `Split ${formatPrice(amount)} USDC into YES + NO tokens.\n` +
      `  Market App ID: ${marketAppId}\n` +
      `  Amount: ${formatQty(amount)} each of YES and NO\n` +
      `  Tx IDs: ${result.txIds.join(', ')}\n` +
      `  Confirmed round: ${result.confirmedRound}`,
    );
  },
);

server.tool(
  'merge_shares',
  'Merge equal YES and NO outcome tokens back into USDC. 1 YES + 1 NO = 1 USDC.',
  {
    marketAppId: z.number().describe('The market app ID'),
    amount: z.number().describe('Amount to merge in microunits'),
  },
  async ({ marketAppId, amount }) => {
    const client = requireTradingClient();
    const result = await client.mergeShares({ marketAppId, amount });
    return textResult(
      `Merged YES + NO tokens back into ${formatPrice(amount)} USDC.\n` +
      `  Market App ID: ${marketAppId}\n` +
      `  Amount: ${formatQty(amount)} each of YES and NO\n` +
      `  Tx IDs: ${result.txIds.join(', ')}\n` +
      `  Confirmed round: ${result.confirmedRound}`,
    );
  },
);

server.tool(
  'claim',
  'Claim USDC from a resolved market by redeeming outcome tokens. Winning = 1:1 USDC. Losing = burned.',
  {
    marketAppId: z.number().describe('The market app ID'),
    assetId: z.number().describe('The outcome token ASA ID to redeem'),
    amount: z.number().optional().describe('Amount to claim in microunits (omit to claim entire balance)'),
  },
  async ({ marketAppId, assetId, amount }) => {
    const client = requireTradingClient();
    const result = await client.claim({ marketAppId, assetId, amount });
    return textResult(
      `Claim successful.\n` +
      `  Market App ID: ${marketAppId}\n` +
      `  Asset ID: ${assetId}\n` +
      `  Amount claimed: ${formatQty(result.amountClaimed)}\n` +
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
