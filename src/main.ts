import * as dotenv from 'dotenv';
import { Scallop } from "@scallop-io/sui-scallop-sdk";
import { SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';
import { afConfigAddresses } from './afConfigAddresses';
import { Aftermath, AftermathApi, IndexerCaller } from 'aftermath-ts-sdk';
import { Logger } from './logger';
import { CoinType, coins } from './coinTypes';
import { formatCoinAmount } from './tradeUtils';
import { getCurrentTimeUTC8 } from './dateUtils';
import { getAllPairs, getAllCoin } from './tradeUtils';

dotenv.config();

const tradeAmounts: { [key in CoinType]: number[] } = {
    'sui': [200, 2000, 20000],
    'usdc': [100, 1000, 10000], 
    'usdt': [100, 1000, 10000],
    // 'eth': [0.01, 0.05, 0.1],
    // 'cetus': [1000, 2000, 3000]
};

const secretKey = process.env.secretKey;
const fullnodeUrl = process.env.fullnodeUrl || 'https://fullnode.mainnet.sui.io:443';

const scallop = new Scallop({
    secretKey,
    networkType: "mainnet",
    fullnodeUrls: [fullnodeUrl]
});

async function executeTrade(coinTypeIn: CoinType, coinTypeOut: CoinType, tradeAmounts: { [key in CoinType]: number[] }) {
    for (const amount of tradeAmounts[coinTypeIn]) {
        try {
            const scallopClient = await scallop.createScallopClient();
            const scallopBuilder = await scallop.createScallopBuilder();

            const AfApi = new AftermathApi(
                new SuiClient({
                    transport: new SuiHTTPTransport({
                        url: fullnodeUrl,
                    }),
                }),
                afConfigAddresses,
                new IndexerCaller("MAINNET")
            );

            const afRouterApi = AfApi.Router();
            const tx = await scallopBuilder.createTxBlock();
            tx.setSender(scallop.suiKit.currentAddress());

            // Merge input coins.
            const userInCoins = await getAllCoin(scallopClient, scallop.suiKit.currentAddress() , coins[coinTypeIn].address); 
            const userOutCoins = await getAllCoin(scallopClient, scallop.suiKit.currentAddress() , coins[coinTypeOut].address); 
            if (userInCoins.length > 1 && coinTypeIn !== 'sui') {
                const targetCoins = userInCoins.map((coinStruct) => {
                    return tx.txBlock.object(coinStruct.coinObjectId);
                });
                tx.mergeCoins(targetCoins[0], targetCoins.slice(1));
            }
            if (userOutCoins.length > 1 && coinTypeOut !== 'sui') {
                const targetCoins = userOutCoins.map((coinStruct) => {
                    return tx.txBlock.object(coinStruct.coinObjectId);
                });
                tx.mergeCoins(targetCoins[0], targetCoins.slice(1));
            }

            let flashloanAmount: number;
            let flashloanCoinType: CoinType;
            let coinInType: string;
            let coinOutType: string;

            coinInType = coins[coinTypeIn].address;
            coinOutType = coins[coinTypeOut].address;

            flashloanAmount = amount * 10 ** coins[coinTypeIn].decimal;
            flashloanCoinType = coinTypeIn;

            const [depositcoin, loan] = tx.borrowFlashLoan(flashloanAmount, flashloanCoinType);

            const completeRoute = await new Aftermath("MAINNET")
                .Router()
                .getCompleteTradeRouteGivenAmountIn({
                    coinInType: coinInType,
                    coinOutType: coinOutType,
                    coinInAmount: BigInt(flashloanAmount),
                });

            const route2Amount = completeRoute.coinOut.amount * BigInt(9993) / BigInt(10000);

            Logger.info(getCurrentTimeUTC8());
            Logger.highlight(`Attempting to trade ${Logger.highlightValue(flashloanCoinType.toUpperCase())} with amount: ${Logger.highlightValue(formatCoinAmount(flashloanCoinType, BigInt(flashloanAmount)))}`);
            Logger.highlight(`Expected coinOut is ${Logger.highlightValue(coinTypeOut.toUpperCase())} with amount: ${Logger.highlightValue(formatCoinAmount(coinTypeOut, route2Amount))}`);

            const completeRoute2 = await new Aftermath("MAINNET")
                .Router()
                .getCompleteTradeRouteGivenAmountIn({
                    coinInType: coinOutType,
                    coinOutType: coinInType,
                    coinInAmount: route2Amount,
                });

            const suiCoinOutId = await afRouterApi.fetchAddTransactionForCompleteTradeRoute({
                tx: tx.txBlock,
                completeRoute: completeRoute,
                walletAddress: scallop.suiKit.currentAddress(),
                slippage: 0.01,
                coinInId: depositcoin,
            });

            const [nextSuiCoinId] = tx.splitCoins(suiCoinOutId, [route2Amount]);
            tx.transferObjects([suiCoinOutId], scallop.suiKit.currentAddress());

            const usdcCointOutId = await afRouterApi.fetchAddTransactionForCompleteTradeRoute({
                tx: tx.txBlock,
                completeRoute: completeRoute2,
                walletAddress: scallop.suiKit.currentAddress(),
                slippage: 0.01,
                coinInId: nextSuiCoinId,
            });

            const [repayCoin] = tx.splitCoins(usdcCointOutId, [flashloanAmount]);
            tx.transferObjects([usdcCointOutId], scallop.suiKit.currentAddress());
            tx.repayFlashLoan(repayCoin, loan, flashloanCoinType);

            const borrowFlashLoanResult = await scallopBuilder.signAndSendTxBlock(tx);
            if (!borrowFlashLoanResult || !('digest' in borrowFlashLoanResult)) {
                throw new Error("Unexpected response from signAndSendTxBlock, 'digest' not found.");
            }

            Logger.info(getCurrentTimeUTC8());
            Logger.highlight(`Attempting to trade ${Logger.highlightValue(flashloanCoinType.toUpperCase())} with amount: ${Logger.highlightValue(formatCoinAmount(flashloanCoinType, BigInt(flashloanAmount)))}`);
            Logger.highlight(`Expected coinOut is ${Logger.highlightValue(coinTypeOut.toUpperCase())} with amount: ${Logger.highlightValue(formatCoinAmount(coinTypeOut, route2Amount))}`);

            Logger.success('Success: ' + Logger.highlightValue(borrowFlashLoanResult.digest));

        } catch (error) {
            Logger.info(getCurrentTimeUTC8());
            Logger.warn(`Attempted flash loan arbitrage failed while trading ${Logger.highlightValue(coinTypeIn.toUpperCase())}/${Logger.highlightValue(coinTypeOut.toUpperCase())}`);

            if (error instanceof TypeError && error.message.includes("Cannot use 'in' operator")) {
                Logger.error(`Encountered an error: ${error.message}`);
            } else if (error instanceof Error && error.message.includes('Dry run failed')) {
                const match = error.message.match(/command (\d+)/);
                const commandNumber = match ? match[1] : 'unknown';
                Logger.error(`Dry run failed at command ${commandNumber}: ${error.message}`);
            } else if (error instanceof Error) {
                Logger.error(error.message);
            } else {
                Logger.error(`An unknown error occurred: ${error}`);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2500));
    }
}

async function main() {
    const pairs = getAllPairs(Object.keys(coins) as CoinType[]);
    Logger.info('-'.repeat(80));
    Logger.highlight(`You are executing with address: ${Logger.highlightValue(scallop.suiKit.currentAddress())}`);
    while (true) {
        // 使用 map 来创建一个 promise 数组，并让 TypeScript 推断类型
        const tradePromises = pairs.map(([coinType1, coinType2]) =>
            executeTrade(coinType1, coinType2, tradeAmounts)
        );

        // 等待所有的 promise 解决
        await Promise.all(tradePromises);

        // 每个交易之间暂停一下
        await new Promise(resolve => setTimeout(resolve, 2500));
    }
}

main();