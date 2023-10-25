import * as dotenv from 'dotenv';
import { Scallop } from "@scallop-io/sui-scallop-sdk";
import { SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';
import { Aftermath, AftermathApi, IndexerCaller } from 'aftermath-ts-sdk';
import { afConfigAddresses } from '../src/afConfigAddresses.ts';

dotenv.config();

async function main() {
    const secretKey = process.env.secretKey;
    const fullnodeUrl = process.env.fullnodeUrl ?? '';
    

    const scallop = new Scallop({
        secretKey,
        networkType: "mainnet",
        fullnodeUrls: [fullnodeUrl]
    })

    console.log(`You are executing with address: ${scallop.suiKit.currentAddress()}`);

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

    //InputsA

    const flashloanAmount = 100e9;
    const flashloanCoinType = 'sui';
    const coinInType = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
    const coinOutType = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN';

    //InputsB

    // const flashloanAmount = 100e6;
    // const flashloanCoinType = 'usdc';
    // const coinInType = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN';
    // const coinOutType = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

    const [depositcoin, loan] = tx.borrowFlashLoan(flashloanAmount, flashloanCoinType);

    const completeRoute = await new Aftermath("MAINNET")
        .Router()
        .getCompleteTradeRouteGivenAmountIn({
            coinInType: coinInType,
            coinOutType: coinOutType,
            coinInAmount: BigInt(flashloanAmount),
        });


    const route2Amount = completeRoute.coinOut.amount * BigInt(9993) / BigInt(10000);
    const completeRoute2 = await new Aftermath("MAINNET")
        .Router()
        .getCompleteTradeRouteGivenAmountIn({
            coinInType: coinOutType,
            coinOutType: coinInType,
            coinInAmount: route2Amount,
        });

    const suiCoinOutId = await afRouterApi.fetchAddTransactionForCompleteTradeRoute({
        tx: tx.txBlock,
        completeRoute: completeRoute, // can be "completeRoute" cuz they are the same.
        walletAddress: scallop.suiKit.currentAddress(),
        slippage: 0.01, // %
        coinInId: depositcoin,
    });

    const [nextSuiCoinId] = tx.splitCoins(suiCoinOutId, [route2Amount]);
    tx.transferObjects([suiCoinOutId], scallop.suiKit.currentAddress());

    const usdcCointOutId = await afRouterApi.fetchAddTransactionForCompleteTradeRoute({
        tx: tx.txBlock,
        completeRoute: completeRoute2,
        walletAddress: scallop.suiKit.currentAddress(),
        slippage: 0.01, // %
        coinInId: nextSuiCoinId,
    });

    const [repayCoin] = tx.splitCoins(usdcCointOutId, [flashloanAmount]);
    tx.transferObjects([usdcCointOutId], scallop.suiKit.currentAddress());
    tx.repayFlashLoan(repayCoin, loan, flashloanCoinType);

    const borrowFlashLoanResult = await scallopBuilder.signAndSendTxBlock(tx);
    console.info('Success:', borrowFlashLoanResult.digest);
}

main();
