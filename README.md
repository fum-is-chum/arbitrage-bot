# Scallop Arbitrage Bot

This script provides an automated way to perform arbitrage trades on the Aftermath router using Scallop flash loans. The main objective is to take advantage of price discrepancies between pairs to achieve profit.

## Table of Contents
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Configuration](#configuration)
- [Functions](#functions)
- [Running the Bot](#running-the-bot)
- [Stay Awake Command](#stay-awake-command)

## Installation

Ensure you have all the required packages installed:

```bash
pnpm install
```

## Environment Variables

Before running the script, you need to setup your environment variables:

- `secretKey`: Your Sui address secret key.
- `fullnodeUrl`: The URL to the Sui full node.

You can set these variables in a `.env` file in the root directory of your project.

## Configuration

To customize the trade amounts for different coins, modify the `tradeAmounts` object:

```javascript
const tradeAmounts: { [key in CoinType]: number } = {
    'sui': 200,
    'usdc': 100, 
    'usdt': 100
};
```

This configuration determines the number of coins the bot will attempt to trade for each coin type. Adjust these values according to your needs.

## Functions

- `getCurrentTimeUTC8()`: Gets the current time in the UTC+8 timezone.
- `getAllPairs(coinTypes: CoinType[])`: Generates all possible coin pairs for trading.
- `formatCoinAmount(coinType: CoinType, amount: bigint)`: Formats the coin amount considering its decimal places.
- `executeTrade(coinTypeIn: CoinType, coinTypeOut: CoinType)`: Executes the arbitrage trade between the given coin types.

## Running the Bot

To run the bot:

```bash
pnpm run start
```

This will start the bot which will continuously attempt to execute arbitrage trades between all available coin pairs.

## Stay Awake Command (MacOS)

To prevent your system from sleeping while the bot is running, you can use:

```bash
caffeinate -i pnpm run start
```

This command is especially useful if you're running the bot on a local machine and want it to continue trading without interruptions.

---

**Note**: Always ensure you have thoroughly tested any trading script in a safe environment before deploying with real assets. It's important to understand the risks associated with flash loans and automated trading.

---