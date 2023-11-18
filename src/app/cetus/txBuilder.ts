import { SUI_CLOCK_OBJECT_ID, SuiTxBlock } from "@scallop-io/sui-kit";
import { SuiTxArg } from "@scallop-io/sui-kit";
import { CetusFlashLoanProtocol, CetusPackageId } from "./contract";

export class CetusTxBuilder {
    private constructor() { }

    static borrow_a_repay_a(
        tx: SuiTxBlock,
        pool: any,
        amount: string,
        coinTypeA: string,
        coinTypeB: string
    ) {
        return tx.moveCall(
            CetusFlashLoanProtocol.borrow_a_repay_a_later,
            [
                tx.sharedObjectRef({
                    objectId: CetusPackageId.global_config,
                    initialSharedVersion: '1574190',
                    mutable: true,
                }),
                tx.object(pool.objectId),
                tx.pure(amount),
                tx.object(SUI_CLOCK_OBJECT_ID)
            ],
            [
                coinTypeA,
                coinTypeB
            ]
        );
    }

    static borrow_b_repay_b(
        tx: SuiTxBlock,
        pool: any,
        amount: string,
        coinTypeA: string,
        coinTypeB: string,
    ) {
        return tx.moveCall(
            CetusFlashLoanProtocol.borrow_b_repay_b_later,
            [
                tx.sharedObjectRef({
                    objectId: CetusPackageId.global_config,
                    initialSharedVersion: '1574190',
                    mutable: true,
                }),
                tx.object(pool.objectId),
                tx.pure(amount),
                tx.object(SUI_CLOCK_OBJECT_ID)
            ],
            [
                coinTypeA,
                coinTypeB
            ]
        );
    }

    static repay_a(
        tx: SuiTxBlock,
        pool: any,
        coin: SuiTxArg,
        receipt: SuiTxArg,
        coinTypeA: string,
        coinTypeB: string,
    ) {
        return tx.moveCall(
            CetusFlashLoanProtocol.repay_a,
            [
                tx.sharedObjectRef({
                    objectId: CetusPackageId.global_config,
                    initialSharedVersion: '1574190',
                    mutable: true,
                }),
                tx.object(pool.objectId),
                coin,
                receipt
            ],
            [
                coinTypeA,
                coinTypeB
            ]
        );
    }

    static repay_b(
        tx: SuiTxBlock,
        pool: any,
        coin: SuiTxArg,
        receipt: SuiTxArg,
        coinTypeA: string,
        coinTypeB: string,
    ) {
        return tx.moveCall(
            CetusFlashLoanProtocol.repay_a,
            [
                tx.sharedObjectRef({
                    objectId: CetusPackageId.global_config,
                    initialSharedVersion: '1574190',
                    mutable: true,
                }),
                tx.object(pool.objectId),
                coin,
                receipt
            ],
            [
                coinTypeA,
                coinTypeB
            ]
        );
    }
}