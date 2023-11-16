import { getFullnodeUrl } from "@mysten/sui.js/client";

export const MAIN_NODES = [
    'https://sui-mainnet.public.blastapi.io',
    getFullnodeUrl('mainnet'),
    'https://rpc-mainnet.suiscan.xyz:443',
];

export const BACKUP_NODES = [
    'https://sui-mainnet-rpc.allthatnode.com',
    'https://mainnet-rpc.sui.chainbase.online',
    'https://sui-mainnet-rpc.nodereal.io',
]