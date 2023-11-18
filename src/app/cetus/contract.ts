
export const CetusPackageId = {
    flash_loan: '0x8fe38370921172f5fc9b54b66e268516c402e84d11fb50ab3ba82cfcf778553c',
    global_config: '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f'
}

export const CetusFlashLoanProtocol = {
    borrow_b_repay_a_later: `${CetusPackageId.flash_loan}::cetus_flash_loan::borrow_b_repay_a_later`,
    borrow_a_repay_b_later: `${CetusPackageId.flash_loan}::cetus_flash_loan::borrow_a_repay_b_later`,
    borrow_b_repay_b_later: `${CetusPackageId.flash_loan}::cetus_flash_loan::borrow_b_repay_b_later`,
    borrow_a_repay_a_later: `${CetusPackageId.flash_loan}::cetus_flash_loan::borrow_a_repay_a_later`,
    repay_b: `${CetusPackageId.flash_loan}::cetus_flash_loan::repay_b`,
    repay_a: `${CetusPackageId.flash_loan}::cetus_flash_loan::repay_a`,
}

export const CetusPool = {
    usdc_sui: {
        objectId: '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630',
        initialSharedVersion: '1580450',
        mutable: true,
    },
    usdt_sui: {
        objectId: '0x06d8af9e6afd27262db436f0d37b304a041f710c3ea1fa4c3a9bab36b3569ad3',
        initialSharedVersion: '1935977',
        mutable: true,
    }
}