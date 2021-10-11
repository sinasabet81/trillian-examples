import { ethers, providers } from "ethers";
import { getEnv } from "./utils";
import { abi } from "./abis/RootWitness";

async function benchmark() {
  const { contractAddress, nodeUrl } = getEnv();

  const provider = new ethers.providers.JsonRpcProvider(nodeUrl);
  const contractInterface = new ethers.utils.Interface(abi);
  const contractObject = new ethers.Contract(contractAddress, abi, provider);
  const events = await contractObject.queryFilter({});
  const txHashes = [...new Set(events.map((event) => event.transactionHash))];
  const txnObjs = await Promise.all(
    txHashes.map((txHash) =>
      provider
        .getTransaction(txHash)
        .then(async (pending) => ({ pending, included: await pending.wait() }))
    )
  );
  const txnMetrics = txnObjs
    // Filter out txns that weren't calls to `batchUpdate`
    .filter((txn) => {
      try {
        contractInterface.decodeFunctionData("batchUpdate", txn.pending.data);
        return true;
      } catch {
        return false;
      }
    })
    .map(({ included, pending }) => {
      const { updateDatas } = contractInterface.decodeFunctionData(
        "batchUpdate",
        pending.data
      );
      const numUpdates = updateDatas.length;
      const cumulativeProofSize = updateDatas.reduce(
        (accumulator: number, updateData: any) =>
          accumulator + updateData.proof.length,
        0
      );
      const { cumulativeGasUsed, transactionHash } = included;
      const gasConsumed = cumulativeGasUsed.toNumber();
      return { cumulativeProofSize, gasConsumed, numUpdates, transactionHash };
    });
  const totalGasConsumed = txnMetrics.reduce(
    (accumulator: number, txnMetric: any) =>
      accumulator + txnMetric.gasConsumed,
    0
  );
  const totalProofElements = txnMetrics.reduce(
    (accumulator: number, txnMetric: any) =>
      accumulator + txnMetric.cumulativeProofSize,
    0
  );
  console.log(
    "Total gas per proof element: ",
    totalGasConsumed / totalProofElements
  );
}

benchmark()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
