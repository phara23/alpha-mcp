# @alpha-arcade/mcp

MCP (Model Context Protocol) server for [Alpha Arcade](https://alphaarcade.com) prediction markets on Algorand.

Lets AI agents (Claude, Cursor, Copilot, etc.) browse markets, place orders, manage positions, and trade on-chain prediction markets.

## Tools

| Tool | Description | Requires Wallet |
|------|-------------|:---:|
| `get_live_markets` | Fetch all live tradeable markets | No |
| `get_market` | Fetch a single market by ID | No |
| `get_orderbook` | Get the full on-chain orderbook for a market | No |
| `get_open_orders` | Get open orders for a wallet on a market | No |
| `get_positions` | Get YES/NO token positions for a wallet | No |
| `create_limit_order` | Place a limit order on a market | Yes |
| `create_market_order` | Place a market order with auto-matching | Yes |
| `cancel_order` | Cancel an open order | Yes |
| `propose_match` | Match two existing orders | Yes |
| `split_shares` | Split USDC into YES + NO tokens | Yes |
| `merge_shares` | Merge YES + NO tokens back into USDC | Yes |
| `claim` | Redeem outcome tokens from a resolved market | Yes |

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `ALPHA_MNEMONIC` | For trading | 25-word Algorand mnemonic |
| `ALPHA_API_KEY` | No | Alpha partners API key. If set, markets are fetched via API (richer data). If omitted, markets are discovered on-chain. |
| `ALPHA_ALGOD_SERVER` | No | Algod URL (default: mainnet Algonode) |
| `ALPHA_INDEXER_SERVER` | No | Indexer URL (default: mainnet Algonode) |
| `ALPHA_MATCHER_APP_ID` | No | Matcher app ID (default: 3078581851) |
| `ALPHA_USDC_ASSET_ID` | No | USDC ASA ID (default: 31566704) |

### Getting an API key

An API key is **optional**. Without it, you can still fetch markets on-chain, place orders, and use most SDK features. With an API key, you get richer market data, liquidity rewards information, and wallet order lookups, and more.

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
