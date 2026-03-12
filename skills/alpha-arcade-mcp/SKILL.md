---
name: alpha-arcade-mcp
description: Trade on Alpha Arcade prediction markets on Algorand — browse markets, read orderbooks, place limit/market orders, manage positions, cancel/amend orders, split/merge shares, and claim winnings. Use when user asks about prediction markets, event betting, YES/NO shares, orderbooks, or Alpha Arcade.
---

# Alpha Arcade — Prediction Markets on Algorand

Interact with Alpha Arcade prediction markets via the Alpha Arcade MCP server (15 tools across read-only and trading categories).

## Key Characteristics

- **On-chain prediction markets** — all orders and settlements happen on Algorand
- **Binary and multi-choice markets** — bet on YES/NO outcomes or choose from multiple options
- **USDC-denominated** — all collateral and payouts in USDC (ASA 31566704)
- **Microunit inputs** — all prices and quantities in tool inputs use microunits (1,000,000 = $1.00 or 1 share)
- **Formatted outputs** — read tools return human-readable strings like "$0.50" and "2.50 shares"

## Setup

The Alpha Arcade MCP server requires environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `ALPHA_MNEMONIC` | For trading | Algorand wallet mnemonic (25 words) |
| `ALPHA_API_KEY` | For reward markets | Alpha Arcade API key |
| `ALPHA_ALGOD_SERVER` | No | Algod endpoint (default: mainnet Algonode) |
| `ALPHA_INDEXER_SERVER` | No | Indexer endpoint (default: mainnet Algonode) |
| `ALPHA_MATCHER_APP_ID` | No | Matcher app ID (default: 3078581851) |
| `ALPHA_USDC_ASSET_ID` | No | USDC ASA ID (default: 31566704) |
| `ALPHA_API_BASE_URL` | No | API base URL (default: https://platform.alphaarcade.com/api) |

Read-only tools (browsing markets, orderbooks, positions) work without `ALPHA_MNEMONIC`. Trading tools require it.

## Units

All prices and quantities in tool **inputs** use **microunits**: 1,000,000 = $1.00 or 1 share.

| Human value | Microunit value |
|---|---|
| $0.50 | 500,000 |
| $0.05 slippage | 50,000 |
| 1 share | 1,000,000 |
| 30 shares | 30,000,000 |

Tool **outputs** from read tools (`get_orderbook`, `get_open_orders`, `get_positions`) return pre-formatted strings. Write tools accept raw microunit integers.

## Market Data Model

### Binary markets
A standard yes/no market has a single `marketAppId`, `yesAssetId`, and `noAssetId`. Use `marketAppId` for all trading calls.

### Multi-choice markets
Multi-choice markets (e.g., "Who wins the election?") have an `options[]` array. Each option is its own binary market with its own `marketAppId`:

```json
{
  "title": "Presidential Election Winner 2028",
  "options": [
    { "title": "Candidate A", "marketAppId": 100001, "yesAssetId": 111, "noAssetId": 112 },
    { "title": "Candidate B", "marketAppId": 100002, "yesAssetId": 113, "noAssetId": 114 }
  ]
}
```

**Always trade using the option's `marketAppId`, not the parent.**

## Orderbook Mechanics

### Four-sided book
The orderbook has four sides: YES bids, YES asks, NO bids, NO asks.

### Cross-side equivalence
Because YES + NO always = $1.00:
- A **YES bid at $0.30** is equivalent to a **NO ask at $0.70**
- A **NO bid at $0.71** is equivalent to a **YES ask at $0.29**

The `get_orderbook` tool returns a unified YES-perspective view that merges all 4 sides automatically.

### Limit vs market orders
- **Limit order** (`create_limit_order`): Sits on the orderbook at your exact price. No matching happens.
- **Market order** (`create_market_order`): Auto-matches against existing orders within your slippage tolerance. Returns the actual fill price.

## Collateral

Every order locks ~0.957 ALGO as minimum balance requirement (MBR) for the on-chain escrow app. This is refunded when the order is cancelled or filled.

- Buy orders lock USDC collateral = quantity x (price + slippage) + fees
- Sell orders lock outcome tokens as collateral

## Tools

### Read-only tools (no wallet required)

| Tool | Purpose |
|------|---------|
| `get_agent_guide` | Returns the full agent guide — read this first |
| `get_live_markets` | Fetch all live markets with prices, volume, categories |
| `get_reward_markets` | Fetch markets with liquidity rewards (requires `ALPHA_API_KEY`) |
| `get_market` | Fetch full details for a single market by ID |
| `get_orderbook` | Fetch unified YES-perspective orderbook for a market |
| `get_open_orders` | Fetch all open orders for a wallet on a specific market |
| `get_positions` | Fetch all YES/NO token positions for a wallet across all markets |

### Trading tools (require `ALPHA_MNEMONIC`)

| Tool | Purpose |
|------|---------|
| `create_limit_order` | Place a limit order at a specific price |
| `create_market_order` | Place a market order with auto-matching and slippage |
| `cancel_order` | Cancel an open order (refunds collateral) |
| `amend_order` | Edit an existing unfilled order in-place |
| `propose_match` | Propose a match between a maker order and your wallet |
| `split_shares` | Split USDC into equal YES + NO tokens |
| `merge_shares` | Merge equal YES + NO tokens back into USDC |
| `claim` | Claim USDC from a resolved market |

## Key Workflows

### Buying shares
1. `get_live_markets` — find a market (or `get_reward_markets` for markets with liquidity rewards)
2. `get_orderbook` — check available liquidity
3. `create_market_order` (auto-matches) or `create_limit_order` (rests on book)
4. Save the returned `escrowAppId` — you need it to cancel

### Checking your portfolio
1. `get_positions` — see all YES/NO token balances with market titles and asset IDs
2. For open orders on a specific market: `get_open_orders` with the `marketAppId`

### Editing an order (amend)
1. `get_open_orders` — find the `escrowAppId`
2. `amend_order` with `marketAppId`, `escrowAppId`, new `price`, and new `quantity`
3. Faster and cheaper than cancel + recreate. Only works on unfilled orders.

### Cancelling an order
1. `get_open_orders` — find the `escrowAppId` and `owner` address
2. `cancel_order` with `marketAppId`, `escrowAppId`, and `orderOwner`

### Claiming from a resolved market
1. `get_positions` — find markets with token balances; note the `yesAssetId` or `noAssetId`
2. `claim` with `marketAppId` and the winning token's `assetId`

### Providing liquidity (split/merge)
1. `split_shares` — convert USDC into equal YES + NO tokens
2. Place limit orders on both sides of the book for market making
3. `merge_shares` — convert matched YES + NO tokens back to USDC

## Common Pitfalls

- **Multi-choice markets**: The parent has no `marketAppId` for trading. Use `options[].marketAppId`.
- **Prices are microunits in inputs**: $0.50 = 500,000, not 0.5 or 50.
- **Orderbook cross-side**: If you only check YES asks, you miss cheaper liquidity from NO bids. The `get_orderbook` tool handles this automatically.
- **Save escrowAppId**: It's the only way to cancel or reference your order later.
- **Wallet required for trading**: Read-only tools work without `ALPHA_MNEMONIC`, but trading tools require it.
- **USDC opt-in**: The wallet must be opted into USDC (ASA 31566704) before trading.
- **ALGO for MBR**: Each order locks ~0.957 ALGO — ensure sufficient ALGO balance.
- **Mainnet by default**: The server defaults to mainnet. Real money is at stake.

## Links

- Alpha Arcade: https://alphaarcade.com
- Alpha Arcade API: https://platform.alphaarcade.com
- Alpha Arcade MCP: https://github.com/phara23/alpha-mcp
