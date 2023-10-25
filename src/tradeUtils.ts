import { coins, CoinType } from './coinTypes';

export function getAllPairs(coinTypes: CoinType[]): [CoinType, CoinType][] {
    const pairs: [CoinType, CoinType][] = [];
    for (let i = 0; i < coinTypes.length; i++) {
        for (let j = 0; j < coinTypes.length; j++) {
            if (i !== j) {
                pairs.push([coinTypes[i], coinTypes[j]]);
            }
        }
    }
    return pairs;
}

export function formatCoinAmount(coinType: CoinType, amount: bigint): string {
    const decimals = coins[coinType].decimal;
    const floatAmount = Number(amount) / (10 ** decimals);
    return floatAmount.toFixed(decimals);
}