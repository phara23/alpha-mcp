import { AlphaClient } from '@alpha-arcade/sdk';
import algosdk from 'algosdk';

export type RuntimeConfig = {
  mnemonic?: string;
  apiKey?: string;
  algodServer: string;
  algodToken: string;
  algodPort: string;
  indexerServer: string;
  indexerToken: string;
  indexerPort: string;
  matcherAppId: number;
  usdcAssetId: number;
  apiBaseUrl: string;
};

export const getRuntimeConfig = (env = process.env): RuntimeConfig => ({
  mnemonic: env.ALPHA_MNEMONIC,
  apiKey: env.ALPHA_API_KEY,
  algodServer: env.ALPHA_ALGOD_SERVER || 'https://mainnet-api.algonode.cloud',
  algodToken: env.ALPHA_ALGOD_TOKEN || '',
  algodPort: env.ALPHA_ALGOD_PORT || '443',
  indexerServer: env.ALPHA_INDEXER_SERVER || 'https://mainnet-idx.algonode.cloud',
  indexerToken: env.ALPHA_INDEXER_TOKEN || '',
  indexerPort: env.ALPHA_INDEXER_PORT || '443',
  matcherAppId: Number(env.ALPHA_MATCHER_APP_ID || '3078581851'),
  usdcAssetId: Number(env.ALPHA_USDC_ASSET_ID || '31566704'),
  apiBaseUrl: env.ALPHA_API_BASE_URL || 'https://platform.alphaarcade.com/api',
});

const createTradingClient = (config: RuntimeConfig): AlphaClient | null => {
  if (!config.mnemonic) return null;
  const algodClient = new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort);
  const indexerClient = new algosdk.Indexer(config.indexerToken, config.indexerServer, config.indexerPort);
  const account = algosdk.mnemonicToSecretKey(config.mnemonic);
  const signer = algosdk.makeBasicAccountTransactionSigner(account);
  return new AlphaClient({
    algodClient,
    indexerClient,
    signer,
    activeAddress: account.addr.toString(),
    matcherAppId: config.matcherAppId,
    usdcAssetId: config.usdcAssetId,
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey || undefined,
  });
};

const createReadOnlyClient = (config: RuntimeConfig): AlphaClient => {
  const algodClient = new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort);
  const indexerClient = new algosdk.Indexer(config.indexerToken, config.indexerServer, config.indexerPort);
  const dummySigner: algosdk.TransactionSigner = async () => [];
  return new AlphaClient({
    algodClient,
    indexerClient,
    signer: dummySigner,
    activeAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
    matcherAppId: config.matcherAppId,
    usdcAssetId: config.usdcAssetId,
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey || undefined,
  });
};

export const requireTradingClient = (config: RuntimeConfig): AlphaClient => {
  const client = createTradingClient(config);
  if (!client) {
    throw new Error(
      'ALPHA_MNEMONIC environment variable is required for trading operations. Set it in your configuration.',
    );
  }
  return client;
};

export const getReadOnlyClient = (config: RuntimeConfig): AlphaClient => {
  return createTradingClient(config) ?? createReadOnlyClient(config);
};

const getConfiguredWalletAddress = (config: RuntimeConfig): string | null => {
  if (!config.mnemonic) return null;
  try {
    const account = algosdk.mnemonicToSecretKey(config.mnemonic);
    return account.addr.toString();
  } catch {
    return null;
  }
};

export const resolveWalletAddress = (config: RuntimeConfig, walletAddress?: string): string => {
  if (walletAddress) return walletAddress;
  const configured = getConfiguredWalletAddress(config);
  if (configured) return configured;
  throw new Error(
    'No wallet address provided. Either pass --wallet-address, or set ALPHA_MNEMONIC so the default wallet is used.',
  );
};
