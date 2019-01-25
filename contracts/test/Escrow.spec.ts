import chai, { expect, should } from 'chai';
import { describe, it, setup, teardown } from 'mocha';
import { keccak256, bufferToHex, toBuffer } from 'ethereumjs-util';
import Web3 from 'web3';

import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
import 'mocha';

import {
    EventListenerContract
} from '../build/wrappers/event_listener';

import {
    EventEmitterContract,
    EventEmitterEventArgs,
    EventEmitterEvents,
    EventEmitterEventEmittedEventArgs
} from '../build/wrappers/event_emitter';

import{
    EventUtilContract,
} from '../build/wrappers/event_util';

import {
    EscrowContract
}  from '../build/wrappers/escrow'

import {
    BridgeContract
}   from '../build/wrappers/bridge';

import {
    ERC20MintableContract
}   from '../build/wrappers/erc20_mintable'

import MerkleTree from "./helpers/MerkleTree";

import { Web3ProviderEngine, RPCSubprovider, BigNumber } from "0x.js";
import { Web3Wrapper, AbiDefinition, Provider, TxData } from '@0x/web3-wrapper';


function getDeployArgs(name, pe, from): [ string, AbiDefinition[],  Provider, Partial<TxData>] {
    let json = require(`../build/contracts/${name}.json`);
    let bytecode = json.bytecode;
    let abi = json.abi;
    let provider = pe;

    return [
        bytecode,
        abi,
        provider,
        { from }
    ]
}

async function eventsToMerkleProof(events:any[], utilContract:EventUtilContract){
    const hashes = [];

    for(let i = 0; i < events.length; i ++) {
        hashes.push(toBuffer(await utilContract.generateBridgeHash.callAsync(events[i].returnValues.origin, events[i].returnValues.eventHash)));
    }

    const merkleTree = new MerkleTree(hashes);

    return merkleTree;
}

describe('Escrow', () => {
    let pe, web3, web3V;
    let accounts;
    let user;

    setup(async () => {
        pe = new Web3ProviderEngine();
        pe.addProvider(new RPCSubprovider('http://127.0.0.1:9545'))
        pe.start()
        web3 = new Web3Wrapper(pe);
        web3V = new Web3(pe);
        accounts = await web3.getAvailableAddressesAsync();
        user = accounts[0]
    });

    it('It should work', async () => {

        const chainAId = new BigNumber(0);
        const chainBId = new BigNumber(1);
        let eventEmitterAbi = require(`../build/contracts/EventEmitter.json`).abi;

        let bridgedTokenAbi = require(`../build/contracts/BridgedToken.json`).abi;


        const salt = new BigNumber("133713371337420");

        let eventUtil = await EventUtilContract.deployAsync(
            ...getDeployArgs('EventUtil', pe, user)
        );

        // @ts-ignore
        let eventListenerA = await EventListenerContract.deployAsync(
            ...getDeployArgs('EventListener', pe, user))
        ;
        let eventEmitterA = await EventEmitterContract.deployAsync(
            ...getDeployArgs('EventEmitter', pe, user)
        );

        let eventEmitterAV = await new web3V.eth.Contract(eventEmitterAbi, eventEmitterA.address);


        // @ts-ignore
        let eventListenerB = await EventListenerContract.deployAsync(
            ...getDeployArgs('EventListener', pe, user))
        ;
        let eventEmitterB = await EventEmitterContract.deployAsync(
            ...getDeployArgs('EventEmitter', pe, user)
        );

        let token = await ERC20MintableContract.deployAsync(
            ...getDeployArgs('ERC20Mintable', pe, user)
        );

        // @ts-ignore
        let escrow = await EscrowContract.deployAsync(
            ...getDeployArgs('Escrow', pe, user),
            chainAId,
            eventListenerA.address,
            eventEmitterA.address
        );
        
        // @ts-ignore
        let bridge = await BridgeContract.deployAsync(
            ...getDeployArgs('Bridge', pe, user),
            chainBId,
            eventListenerB.address,
            eventEmitterB.address,
        )

        // init network A for chain B bridge
        await bridge.initNetwork.sendTransactionAsync(escrow.address, chainAId);

        const bridgeAmount = new BigNumber(1000);
        
        // must have some tokens to bridge
        await token.mint.sendTransactionAsync(user, bridgeAmount, {from: user});

        
        // A to B bridging process

        // allow token to be pulled by escrow
        await token.approve.sendTransactionAsync(escrow.address, bridgeAmount, {from: user});
        
        // bridge tokens
        await escrow.bridge.sendTransactionAsync(bridgeAmount, token.address, user, chainBId, salt, {from: user});
            
        let emittedEvents = await eventEmitterAV.getPastEvents("EventEmitted");

        // generate merkle tree of events that have happened
        let merkleTree = await eventsToMerkleProof(emittedEvents, eventUtil);
        
        // submit the merkle root to the event listener contract on chain B
        await eventListenerB.updateProof.sendTransactionAsync(chainAId, merkleTree.getHexRoot());

        const proof = merkleTree.getHexProof(merkleTree.elements[0]);

        // console.log(proof);
        
        // await bridge.getBridgedToken.sendTransactionAsync(token.address, chainAId);
        

        // claim the tokens on chain B

        await bridge.claim.sendTransactionAsync(user, token.address, bridgeAmount, salt, chainAId, new BigNumber(0), proof);
        
        const bridgedTokenAddress = await bridge.getBridgedToken.callAsync(token.address, chainAId);

        const bridgedToken = new web3V.eth.Contract(bridgedTokenAbi, bridgedTokenAddress);

        let balance = await bridgedToken.methods.balanceOf(user).call();

        expect(balance).to.equal("1000");

    })

    

    

    teardown(() => {
        pe.stop();
    })
    
})