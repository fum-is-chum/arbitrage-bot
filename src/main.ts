import { CoinStruct, PaginatedCoins, SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';
import { SuiTxBlock, normalizeStructTag } from "@scallop-io/sui-kit";
import { Scallop } from "@scallop-io/sui-scallop-sdk";
import { Aftermath, AftermathApi, IndexerCaller } from 'aftermath-ts-sdk';
import BigNumber from 'bignumber.js';
import * as dotenv from 'dotenv';
import { afConfigAddresses } from './afConfigAddresses';
import { CoinType, coins } from './coinTypes';
import { BACKUP_NODES, MAIN_NODES } from './const/rpc';
import { getCurrentTimeUTC8 } from './dateUtils';
import { Logger } from './logger';
import { formatCoinAmount, getAllCoin, getAllPairs } from './tradeUtils';
import { runInBatch, shuffle } from './utils/common';
import { CetusTxBuilder } from "./app/cetus/txBuilder";
import { CetusPool } from "./app/cetus/contract";
dotenv.config();

const tradeAmounts: { [key in CoinType]: number[] } = {
    'sui': [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    'usdc': [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    'usdt': [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    // 'eth': [0.01, 0.05, 0.1],
    // 'cetus': [1000, 2000, 3000]
};

const secretKey = process.env.secretKey;

async function executeTrade(coinTypeIn: CoinType, coinTypeOut: CoinType, tradeAmounts: { [key in CoinType]: number[] }, gasCoins: CoinStruct[]) {
    const tasks = tradeAmounts[coinTypeIn].map((amount, idx) => async () => {
        try {
            shuffle(MAIN_NODES);
            const scallop = new Scallop({
                secretKey,
                networkType: "mainnet",
                fullnodeUrls: [...MAIN_NODES, ...BACKUP_NODES]
            });

            const scallopClient = await scallop.createScallopClient();
            const scallopBuilder = await scallop.createScallopBuilder();

            const AfApi = new AftermathApi(
                new SuiClient({
                    transport: new SuiHTTPTransport({
                        url: scallop.params.fullnodeUrls![0],
                    }),
                }),
                afConfigAddresses,
                new IndexerCaller("MAINNET")
            );

            const afRouterApi = AfApi.Router();
            const tx = scallopBuilder.createTxBlock();
            tx.setSender(scallop.suiKit.currentAddress());
            tx.setGasPayment([
                {
                    objectId: gasCoins[idx].coinObjectId,
                    version: gasCoins[idx].version,
                    digest: gasCoins[idx].digest,
                }
            ]);

            // Merge input coins.
            const userInCoins = await getAllCoin(scallopClient, scallop.suiKit.currentAddress(), coins[coinTypeIn].address);
            const userOutCoins = await getAllCoin(scallopClient, scallop.suiKit.currentAddress(), coins[coinTypeOut].address);
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

            flashloanAmount = BigNumber(amount).shiftedBy(1 * coins[coinTypeIn].decimal).toNumber();
            flashloanCoinType = coinTypeIn;

            let depositcoin;
            let loan;

            switch (coinTypeIn) {
                case 'sui': {
                    const [a, b] = CetusTxBuilder.borrow_b_repay_b(tx, CetusPool['usdc_sui'], flashloanAmount.toString(), coins['usdc'].address, coins['sui'].address);
                    depositcoin = a;
                    loan = b;
                    break;
                }
                case 'usdc': {
                    const [a, b] = CetusTxBuilder.borrow_a_repay_a(tx, CetusPool['usdc_sui'], flashloanAmount.toString(), coins['usdc'].address, coins['sui'].address);
                    depositcoin = a;
                    loan = b;
                    break;
                }
                case 'usdt': {
                    const [a, b] = CetusTxBuilder.borrow_a_repay_a(tx, CetusPool['usdt_sui'], flashloanAmount.toString(), coins['usdt'].address, coins['sui'].address);
                    depositcoin = a;
                    loan = b;
                    break;
                }
            }
            // const [depositcoin, loan] = tx.borrowFlashLoan(flashloanAmount, flashloanCoinType);
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

            switch (coinTypeIn) {
                case 'sui': {
                    CetusTxBuilder.repay_b(tx, CetusPool['usdc_sui'], repayCoin, loan, coins['usdc'].address, coins['sui'].address);
                    break;
                }
                case 'usdc': {
                    CetusTxBuilder.repay_a(tx, CetusPool['usdc_sui'], repayCoin, loan, coins['usdc'].address, coins['sui'].address);
                    break;
                }
                case 'usdt': {
                    CetusTxBuilder.repay_a(tx, CetusPool['usdt_sui'], repayCoin, loan, coins['usdt'].address, coins['sui'].address);
                    break;
                }
            }
            // tx.repayFlashLoan(repayCoin, loan, flashloanCoinType);

            // console.dir(tx.blockData, { depth: 3 });
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
    });
    try {
        await runInBatch(tasks, 1, 1500);
    } catch (e) {
        Logger.error(JSON.stringify(e));
    }
}

const getCoins = async (coinType: string, owner: string, client: SuiClient) => {
    let cursor: string | null | undefined = null;
    const allCoins: CoinStruct[] = [];

    if (coinType && owner) {
        do {
            const { data, nextCursor }: PaginatedCoins = await client.getCoins({
                owner: owner,
                coinType: normalizeStructTag(coinType),
                cursor,
                limit: 50,
            });

            if (!data || !data.length) {
                break;
            }

            allCoins.push(...data);
            cursor = nextCursor;
        } while (cursor);
    }

    return allCoins.filter((coin) => {
        const amount = BigNumber(coin.balance).shiftedBy(-1 * 9);
        return amount.gte(0.5);
    });
};

const splitGasCoins = async (scallop: Scallop) => {
    const suiBalance = await scallop.suiKit.getBalance(normalizeStructTag('0x2::sui::SUI'));
    if (suiBalance.coinObjectCount < 8) {
        // split coins into 8 
        const totalAmount = BigNumber(suiBalance.totalBalance).div(8).precision(9).toNumber();
        const amounts = Array(7).fill(totalAmount);
        const tx = new SuiTxBlock();
        tx.setSender(scallop.suiKit.currentAddress());
        const coins = tx.splitSUIFromGas(amounts);

        tx.transferObjects(amounts.map((_, idx) => coins[idx]), scallop.suiKit.currentAddress());
        const res = await scallop.suiKit.signAndSendTxn(tx);
        if (res.effects && res.effects.status.status === 'success') {
            console.log(`success: ${res.digest}`);
        } else {
            console.error(`failed: ${res.digest}`);
            return false;
        };

        await new Promise(resolve => setTimeout(resolve, 3000));
        return true;
    }
    return true;
};

async function main() {
    const pairs = getAllPairs(Object.keys(coins) as CoinType[]);
    const tradePromises: Promise<void>[] = Array(pairs.length).fill(0);

    const scallop = new Scallop({
        secretKey,
        networkType: "mainnet",
        fullnodeUrls: [...MAIN_NODES, ...BACKUP_NODES]
    });

    Logger.info('-'.repeat(80));
    Logger.highlight(`You are executing with address: ${Logger.highlightValue(scallop.suiKit.currentAddress())}`);

    const s = await splitGasCoins(scallop);
    if (!s) return;
    const gasCoins = await getCoins('0x2::sui::SUI', scallop.suiKit.currentAddress(), scallop.suiKit.client());

    while (true) {
        pairs.map(([coinType1, coinType2], idx) => {
            tradePromises[idx] = executeTrade(coinType1, coinType2, tradeAmounts, gasCoins);
        });

        try {
            // 等待所有的 promise 解决
            await Promise.all(tradePromises);

            // 每个交易之间暂停一下
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (e) {
            Logger.error(JSON.stringify(e));
        }
    }
}

main().then(console.log).catch(console.error).finally(() => process.exit(0));