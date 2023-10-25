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

  // console.log(completeRoute.coinOut.amount);


  const scallopBuilder = await scallop.createScallopBuilder();

  const tx = await scallopBuilder.createTxBlock();
  tx.setSender(scallop.suiKit.currentAddress());

  const coinInAmount = 1000_000_000;

  const completeRoute = await new Aftermath("MAINNET")
    .Router()
    .getCompleteTradeRouteGivenAmountIn({
      coinInType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
      coinOutType: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
      coinInAmount: BigInt(coinInAmount),
    });

  const completeRoute2 = await new Aftermath("MAINNET")
    .Router()
    .getCompleteTradeRouteGivenAmountIn({
      coinOutType: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
      coinInType: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
      coinInAmount: completeRoute.coinOut.amount
    });

  const coinUsdcId = await afRouterApi.fetchAddTransactionForCompleteTradeRoute({
    tx: tx.txBlock,
    completeRoute: completeRoute,
    walletAddress: scallop.suiKit.currentAddress(),
    slippage: 0.01, // 1 %
  });

  const extraUsdcId = '0x0de5060e2e3694a414496df7418dca44261ac53cb5f426e449a038f089a38025';
  tx.mergeCoins(coinUsdcId, [extraUsdcId]);
  const [nextUsdcId] = tx.splitCoins(coinUsdcId, [completeRoute.coinOut.amount]);
  tx.transferObjects([coinUsdcId], scallop.suiKit.currentAddress());


  const coinSuiId = await afRouterApi.fetchAddTransactionForCompleteTradeRoute({
    tx: tx.txBlock,
    completeRoute: completeRoute2,
    walletAddress: scallop.suiKit.currentAddress(),
    slippage: 0.01, // 1 %
    coinInId: nextUsdcId,
  });
  tx.transferObjects([coinSuiId], scallop.suiKit.currentAddress());

  const res = await scallopBuilder.signAndSendTxBlock(tx);
  console.info(res);
}

main();
