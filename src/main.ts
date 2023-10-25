import * as dotenv from 'dotenv';
import { Scallop } from "@scallop-io/sui-scallop-sdk";
import { SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';
import { afConfigAddresses } from './afConfigAddresses';
import { Aftermath, AftermathApi, IndexerCaller } from 'aftermath-ts-sdk';
import { Logger } from './logger';
import { CoinType, coins } from './coinTypes';
import { formatCoinAmount } from './tradeUtils';
import { getCurrentTimeUTC8 } from './dateUtils';
import { getAllPairs } from './tradeUtils';

dotenv.config();

const tradeAmounts: { [key in CoinType]: number } = {
    'sui': 200,
    'usdc': 100, 
    'usdt': 100,
    'eth': 0.05,
    'cetus': 2000
};

async function executeTrade(coinTypeIn: CoinType, coinTypeOut: CoinType, tradeAmounts: { [key in CoinType]: number }) {
    try {
        const secretKey = process.env.secretKey;
        const fullnodeUrl = process.env.fullnodeUrl ?? '';

        const scallop = new Scallop({
            secretKey,
            networkType: "mainnet",
            fullnodeUrls: [fullnodeUrl]
        });

        Logger.highlight(`You are executing with address: ${Logger.highlightValue(scallop.suiKit.currentAddress())}`);

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
        const scallopBuilder = await scallop.createScallopBuilder();
        const tx = await scallopBuilder.createTxBlock();
        tx.setSender(scallop.suiKit.currentAddress());

        let flashloanAmount: number;
        let flashloanCoinType: CoinType;
        let coinInType: string;
        let coinOutType: string;

        // 設定 coinInType 和 coinOutType 的值
        coinInType = coins[coinTypeIn].address;
        coinOutType = coins[coinTypeOut].address;

        flashloanAmount = tradeAmounts[coinTypeIn] * 10 ** coins[coinTypeIn].decimal; // 考慮小數位數
        flashloanCoinType = coinTypeIn;
        Logger.highlight(`Attempting to trade ${Logger.highlightValue(flashloanCoinType.toUpperCase())} with amount: ${Logger.highlightValue(formatCoinAmount(flashloanCoinType, BigInt(flashloanAmount)))}`);

        const [depositcoin, loan] = tx.borrowFlashLoan(flashloanAmount, flashloanCoinType);

        const completeRoute = await new Aftermath("MAINNET")
            .Router()
            .getCompleteTradeRouteGivenAmountIn({
                coinInType: coinInType,
                coinOutType: coinOutType,
                coinInAmount: BigInt(flashloanAmount),
            });

        const route2Amount = completeRoute.coinOut.amount * BigInt(9993) / BigInt(10000);
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

        Logger.success('Success: ' + Logger.highlightValue(borrowFlashLoanResult.digest));

        // const userCoins = await userCoins(scallop.suiKit.currentAddress());  // 假設 getUserCoins 是一個可以取得用戶幣的函數

        // if (userCoins.length > 1) {
        //     const argsUserCoins = userCoins.map((e) => tx.txBlock.object(normalizeSuiObjectId(e)));
        //     tx.txBlock.mergeCoins(argsUserCoins[0], argsUserCoins.slice(1));
        // }

    } catch (error) {
        Logger.warn(`Attempted flash loan arbitrage failed while trading ${coinTypeIn.toUpperCase()} to ${coinTypeOut.toUpperCase()}`);

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

    Logger.info('-'.repeat(80));
}

async function main() {
    const pairs = getAllPairs(Object.keys(coins) as CoinType[]);
    while (true) {
        for (const [coinType1, coinType2] of pairs) {
            Logger.info(getCurrentTimeUTC8());
            Logger.highlight(`Executing trade from ${Logger.highlightValue(coinType1.toUpperCase())} to ${Logger.highlightValue(coinType2.toUpperCase())}`);
            await executeTrade(coinType1, coinType2, tradeAmounts);
            await new Promise(res => setTimeout(res, 2500));
        }
    }
}

main();