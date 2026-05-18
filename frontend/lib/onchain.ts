"use client";

import { useCallback, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { readContract, writeContract, waitForTransactionReceipt } from "wagmi/actions";
import { parseUnits } from "viem";

import { ADDRESSES, ERC20_ABI, PROVIDER_REGISTRY_ABI, SIGNAL_MARKET_ABI, FREQUENCY_TO_ENUM } from "./contracts";

export type OnchainState = "idle" | "approving" | "submitting" | "done" | "error";

async function ensureAllowance(config: any, owner: `0x${string}`, spender: `0x${string}`, amount: bigint) {
  if (amount === 0n) return;
  const allowance = (await readContract(config, {
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;
  if (allowance >= amount) return;
  const tx = await writeContract(config, {
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
  });
  await waitForTransactionReceipt(config, { hash: tx });
}

export function useProviderRegister() {
  const { address } = useAccount();
  const config = useConfig();
  const [state, setState] = useState<OnchainState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const submit = useCallback(
    async (input: { name: string; description: string; frequency: string; agentPubKeyHex: string }) => {
      if (!address) throw new Error("wallet not connected");
      setError(null);
      setTxHash(null);
      const freqEnum = FREQUENCY_TO_ENUM[input.frequency];
      if (freqEnum === undefined) throw new Error(`unknown frequency ${input.frequency}`);
      const pubkey = (("0x" + input.agentPubKeyHex.replace(/^0x/, "")) as `0x${string}`);
      if (pubkey.length !== 66) throw new Error("agent pubkey must be 32 bytes hex");

      // STAKE_AMOUNT is constant 100 USDC (6 decimals). Read it on-chain to stay in sync.
      const stake = (await readContract(config, {
        address: ADDRESSES.PROVIDER_REGISTRY,
        abi: PROVIDER_REGISTRY_ABI,
        functionName: "STAKE_AMOUNT",
      })) as bigint;

      try {
        setState("approving");
        await ensureAllowance(config, address, ADDRESSES.PROVIDER_REGISTRY, stake);
        setState("submitting");
        const tx = await writeContract(config, {
          address: ADDRESSES.PROVIDER_REGISTRY,
          abi: PROVIDER_REGISTRY_ABI,
          functionName: "register",
          args: [input.name, input.description, freqEnum, pubkey],
        });
        setTxHash(tx);
        await waitForTransactionReceipt(config, { hash: tx });
        setState("done");
      } catch (e: any) {
        setError(e?.shortMessage ?? e?.message ?? String(e));
        setState("error");
      }
    },
    [address, config]
  );

  return { state, error, txHash, submit };
}

export function useSubscribe() {
  const { address } = useAccount();
  const config = useConfig();
  const [state, setState] = useState<OnchainState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const submit = useCallback(
    async (input: {
      provider: `0x${string}`;
      agent: `0x${string}`;
      buyerAgentPubKeyHex: string;
      maxPositionBps: number;
      maxLeverageBps: number;
      dailyVarBps: number;
      initialFloatUsdc: string;
    }) => {
      if (!address) throw new Error("wallet not connected");
      setError(null);
      setTxHash(null);
      const pubkey = (("0x" + input.buyerAgentPubKeyHex.replace(/^0x/, "")) as `0x${string}`);
      if (pubkey.length !== 66) throw new Error("buyer agent pubkey must be 32 bytes hex");
      const initial = parseUnits(input.initialFloatUsdc, 6);

      try {
        setState("approving");
        await ensureAllowance(config, address, ADDRESSES.SIGNAL_MARKET, initial);
        setState("submitting");
        const tx = await writeContract(config, {
          address: ADDRESSES.SIGNAL_MARKET,
          abi: SIGNAL_MARKET_ABI,
          functionName: "subscribe",
          args: [
            input.provider,
            input.agent,
            pubkey,
            BigInt(input.maxPositionBps),
            BigInt(input.maxLeverageBps),
            BigInt(input.dailyVarBps),
            initial,
          ],
        });
        setTxHash(tx);
        await waitForTransactionReceipt(config, { hash: tx });
        setState("done");
      } catch (e: any) {
        setError(e?.shortMessage ?? e?.message ?? String(e));
        setState("error");
      }
    },
    [address, config]
  );

  return { state, error, txHash, submit };
}

export function useDepositFloat() {
  const { address } = useAccount();
  const config = useConfig();
  const [state, setState] = useState<OnchainState>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (provider: `0x${string}`, amountUsdc: string) => {
      if (!address) throw new Error("wallet not connected");
      setError(null);
      const amount = parseUnits(amountUsdc, 6);
      try {
        setState("approving");
        await ensureAllowance(config, address, ADDRESSES.SIGNAL_MARKET, amount);
        setState("submitting");
        const tx = await writeContract(config, {
          address: ADDRESSES.SIGNAL_MARKET,
          abi: SIGNAL_MARKET_ABI,
          functionName: "depositFloat",
          args: [provider, amount],
        });
        await waitForTransactionReceipt(config, { hash: tx });
        setState("done");
      } catch (e: any) {
        setError(e?.shortMessage ?? e?.message ?? String(e));
        setState("error");
      }
    },
    [address, config]
  );

  return { state, error, submit };
}
