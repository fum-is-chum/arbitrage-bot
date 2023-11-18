export function shuffle(array: string[]) {
    const tmp = array[0];
    const len = array.length;
    for (let i = 1; i < len; i++) {
        array[i - 1] = array[i];
    }

    array[len - 1] = tmp;
};

export async function runInBatch<T>(
    functionsToRun: (() => Promise<T>)[],
    batchSize = 100,
    delay = 1000,
): Promise<void> {
    while (functionsToRun.length !== 0) {
        const currFunctionsToRun = functionsToRun.splice(0, batchSize);
        const promises = currFunctionsToRun.map((fToRun) => fToRun());
        const currResults = await Promise.allSettled(promises);
        await new Promise(resolve => setTimeout(resolve, delay));
        // results.push(...currResults);
    }
}
