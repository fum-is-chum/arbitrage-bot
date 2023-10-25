import * as dotenv from 'dotenv';
import { Scallop } from "@scallop-io/sui-scallop-sdk"

dotenv.config();
const fullnodeUrl = process.env.fullnodeUrl ?? '';

async function main() {
    const secretKey = process.env.secretKey;
    const scallop = new Scallop({
        secretKey,
        networkType: "mainnet",
        fullnodeUrls: [fullnodeUrl]
    })

    console.log(`You are executing with address: ${scallop.suiKit.currentAddress()}`)

    const scallopBuilder = await scallop.createScallopBuilder();

    // //open a obligation when the first time use
    // const openObligationResult = await scallopClient.openObligation();
    // console.info('openObligationResult:', openObligationResult);

    const tx = await scallopBuilder.createTxBlock();
    tx.setSender(scallop.suiKit.currentAddress());

    //borrow FlashLoan
    const [depositcoin, loan] = tx.borrowFlashLoan(3000000 * 10 ** 6, 'usdc');

    //repay FlashLoan
    tx.repayFlashLoan(depositcoin, loan, 'usdc');
    const borrowFlashLoanResult = await scallopBuilder.signAndSendTxBlock(tx);
    console.info('borrowFlashLoanResult:', borrowFlashLoanResult);

}

main();