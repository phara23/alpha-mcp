# @alpha-arcade/mcp

MCP (Model Context Protocol) server for [Alpha Arcade](https://alphaarcade.com) prediction markets on Algorand.

Lets AI agents (Claude, Cursor, Copilot, etc.) browse markets, fetch full API-backed orderbooks, place orders, manage positions, and trade on-chain prediction markets.

## SDK vs MCP vs CLI

- **SDK (`@alpha-arcade/sdk`)**: low-level TypeScript primitives for bots, backends, and apps.
- **MCP (`@alpha-arcade/mcp`)**: exposes the same capabilities as MCP tools for AI agents.
- **CLI (`@alpha-arcade/cli`)**: human terminal UX with `table/json` output, prompts, and `--dry-run`/`--yes` safety rails.

The CLI and MCP both use the same runtime/client setup logic so behavior stays aligned.

## Alpha CLI (terminal)

The CLI package lives in `alpha-cli/` in this repo and can be published independently as `@alpha-arcade/cli`.

### Quickstart

```bash
cd alpha-cli
npm install
npm run build
node dist/index.js markets list --limit 5
```

### Common commands

```bash
# Read-only
node dist/index.js markets list --limit 5
node dist/index.js markets get <marketId>
node dist/index.js orderbook <marketAppId>
node dist/index.js positions --wallet-address <addr>

# Trading (requires ALPHA_MNEMONIC)
node dist/index.js trade limit --market <id> --position yes --side buy --price 0.52 --quantity 10
node dist/index.js trade market --market <id> --position no --side buy --price 0.45 --quantity 20 --slippage 0.05
node dist/index.js orders amend --market <id> --escrow-app-id <escrow> --price 0.60 --quantity 3
node dist/index.js orders cancel --market <id> --escrow-app-id <escrow> --order-owner <addr>
```

### CLI safety model

- Write commands prompt for confirmation by default.
- `--dry-run` prints payloads (and market-order matching estimate) without submitting.
- `--yes` bypasses prompts for non-interactive automation.
- Price validation enforces `(0,1)` dollars and caps unusually high slippage.

## Tools

| Tool | Description | Requires Wallet |
|------|-------------|:---:|
| `get_agent_guide` | Returns the agent guide — data model, units, mechanics, workflows, pitfalls | No |
| `get_live_markets` | Fetch all live tradeable markets | No |
| `get_market` | Fetch a single market by ID | No |
| `get_orderbook` | Get the unified on-chain orderbook for a market app | No |
| `get_full_orderbook` | Get the full processed orderbook snapshot from the Alpha REST API for a market | No |
| `get_open_orders` | Get open orders for a wallet on a market | No |
| `get_positions` | Get YES/NO token positions for a wallet | No |
| `create_limit_order` | Place a limit order on a market | Yes |
| `create_market_order` | Place a market order with auto-matching | Yes |
| `cancel_order` | Cancel an open order | Yes |
| `amend_order` | Edit an existing unfilled order (price, quantity, slippage) | Yes |
| `propose_match` | Match two existing orders | Yes |
| `split_shares` | Split USDC into YES + NO tokens | Yes |
| `merge_shares` | Merge YES + NO tokens back into USDC | Yes |
| `claim` | Redeem outcome tokens from a resolved market | Yes |
| `stream_orderbook` | Get a real-time orderbook snapshot via WebSocket (faster than on-chain) | No |
| `stream_live_markets` | Collect live market probability changes for a duration | No |
| `stream_market` | Watch a single market for the first change event | No |
| `stream_wallet_orders` | Watch a wallet for order changes | No |

### `get_full_orderbook`

Fetches the full processed orderbook snapshot from the Alpha REST API for a market ID. Requires `ALPHA_API_KEY`.

- **marketId** (required): The Alpha market ID (UUID), not `marketAppId`

Returns the same app-keyed snapshot shape as websocket `orderbook_changed.orderbook`:
- top-level aggregated `bids`, `asks`, and `spread`
- detailed `yes` and `no` bid/ask orders with `escrowAppId` and `owner`

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| `agent-guide` | `alpha-arcade://agent-guide` | Agent guide for Alpha Arcade prediction markets — data model, units, mechanics, workflows, and common pitfalls |

## WebSocket Stream Tools

The `stream_*` tools connect to the Alpha Arcade WebSocket API (`wss://wss.platform.alphaarcade.com`) for real-time data. No API key required. Each tool opens a connection, collects data, then closes — no persistent subscriptions to manage.

### `stream_orderbook`

Gets a real-time orderbook snapshot for a market. Faster than the on-chain `get_orderbook` tool (~5s vs ~10s). Returns the same full processed snapshot shape as `get_full_orderbook`, with bids, asks, spread, and per-side YES/NO detail.

- **slug** (required): The market's URL-friendly name (e.g. `"will-btc-hit-100k"`)
- **timeoutMs** (optional): Max wait time in ms (default: 15000)

### `stream_live_markets`

Collects market probability changes over a time window. Returns all accumulated changes with market IDs, probability patches, and spread/midpoint updates. Useful for seeing which markets are currently active.

- **durationMs** (optional): How long to collect events in ms (default: 5000)

### `stream_market`

Watches a single market by slug and returns the first change event. Times out if nothing changes.

- **slug** (required): The market's URL-friendly name
- **timeoutMs** (optional): Max wait time in ms (default: 15000)

### `stream_wallet_orders`

Watches a wallet for order changes (new, updated, or filled orders) and returns the first event. Uses the configured `ALPHA_MNEMONIC` wallet if no address is provided.

- **walletAddress** (optional): Algorand wallet address
- **timeoutMs** (optional): Max wait time in ms (default: 15000)

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `ALPHA_MNEMONIC` | For trading | 25-word Algorand mnemonic |
| `ALPHA_API_KEY` | No | Alpha partners API key. If set, markets can be fetched via API and `get_full_orderbook` becomes available. If omitted, markets are discovered on-chain. |
| `ALPHA_ALGOD_SERVER` | No | Algod URL (default: mainnet Algonode) |
| `ALPHA_INDEXER_SERVER` | No | Indexer URL (default: mainnet Algonode) |
| `ALPHA_MATCHER_APP_ID` | No | Matcher app ID (default: 3078581851) |
| `ALPHA_USDC_ASSET_ID` | No | USDC ASA ID (default: 31566704) |

### Getting an API key

An API key is **optional**. Without it, you can still fetch markets on-chain, place orders, and use most SDK features. With an API key, you get richer market data, full API-backed orderbooks, liquidity rewards information, wallet order lookups, and more.

To get an API key:

1. Go to [alphaarcade.com](https://alphaarcade.com) and **sign up** with your email or Google account.
2. Open the **Account** page 
3. Open the **Partners** tab.
4. Click **Create API key** and copy the key.
5. Add it to your environment (e.g. a `.env` file in the project root):

### Cursor (read-only, zero config)

Add to your `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "alpha-arcade": {
      "command": "npx",
      "args": ["-y", "@alpha-arcade/mcp"]
    }
  }
}
```

That's it -- no API key needed. Your AI can browse markets, view orderbooks, and check positions.

### Cursor (with trading)

To enable trading, add your mnemonic:

```json
{
  "mcpServers": {
    "alpha-arcade": {
      "command": "npx",
      "args": ["-y", "@alpha-arcade/mcp"],
      "env": {
        "ALPHA_MNEMONIC": "your twenty five word mnemonic here"
      }
    }
  }
}
```

### Claude Desktop / Claude Code

Same config works for both **Claude Desktop** (GUI app) and **Claude Code** (terminal CLI).

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS (or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "alpha-arcade": {
      "command": "npx",
      "args": ["-y", "@alpha-arcade/mcp"],
      "env": {
        "ALPHA_MNEMONIC": "your twenty five word mnemonic here"
      }
    }
  }
}
```

For **Claude Code** specifically, you can also add it via the CLI:

```bash
claude mcp add alpha-arcade -- npx -y @alpha-arcade/mcp
```

### VS Code / Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "alpha-arcade": {
      "command": "npx",
      "args": ["-y", "@alpha-arcade/mcp"],
      "env": {
        "ALPHA_MNEMONIC": "your twenty five word mnemonic here"
      }
    }
  }
}
```

## Zero Config Mode

With no environment variables at all, the server works in **read-only mode**. Markets are discovered directly from the Algorand blockchain -- no API key needed. You can browse markets, view orderbooks, and check positions. Trading tools will return an error explaining that a mnemonic is required.

## Price and Quantity Units

All prices and quantities use **microunits** (1,000,000 = $1.00 or 1 share):

- Price `500000` = $0.50
- Quantity `1000000` = 1 share
- Slippage `50000` = $0.05

## Links

- SDK: [npmjs.com/package/@alpha-arcade/sdk](https://www.npmjs.com/package/@alpha-arcade/sdk)
- GitHub: [github.com/phara23/alpha-mcp](https://github.com/phara23/alpha-mcp)
- Alpha Arcade: [alphaarcade.com](https://alphaarcade.com)
- Alpha Arcade API: [platform.alphaarcade.com](https://platform.alphaarcade.com)
