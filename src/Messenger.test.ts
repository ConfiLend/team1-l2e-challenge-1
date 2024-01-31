import { Messenger } from './Messenger';
import { Field, Mina, PrivateKey, PublicKey, AccountUpdate } from 'o1js';

import {
  OffChainStorage,
  MerkleWitness8,
} from 'experimental-zkapp-offchain-storage';

import XMLHttpRequestTs from 'xmlhttprequest-ts';
// import NodeXMLHttpRequest from
//   XMLHttpRequestTs.XMLHttpRequest as any as typeof XMLHttpRequest;

let proofsEnabled = false;

const storageServerAddress = 'http://127.0.0.1:3001';
// const serverPublicKey = await OffChainStorage.getPublicKey(
//   storageServerAddress,
//   NodeXMLHttpRequest
// );

describe('Messenger', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    senderAccount: PublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: Messenger;

  beforeAll(async () => {
    if (proofsEnabled) await Messenger.compile();
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } =
      Local.testAccounts[1]);
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Messenger(zkAppAddress);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('generates and deploys the `Messenger` smart contract', async () => {
    await localDeploy();
    const addressCount = zkApp.addressCount.get();
    expect(addressCount).toEqual(Field(0));
  });

  it('correctly updates the address count state on the `Messenger` smart contract', async () => {
    await localDeploy();
    // const currentCount = zkApp.addressCount.get();
    // console.log('Current Count is: ', currentCount.toString());

    // 3 addAddress transactions
    for (let i = 0; i < 3; i++) {
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.addAddress();
      });
      await txn.prove();
      await txn.sign([senderKey]).send();
    }

    const newCount = zkApp.addressCount.get();
    // console.log('New Count is: ', newCount.toString());
    expect(newCount).toEqual(Field(3));
  });

  it('Assertions Rules', async () => {
    await localDeploy();
    const messages = [
      // Rules:
      Field(0), // true, true, true
      // Field(15), // false, true, true
      // Field(31), // false, true, false
      // Field(11), // false, false, true
      // Field(43), // false, false, false
    ];
    const txn = await Mina.transaction(senderAccount, () => {
      for (let i = 0; i < messages.length; i++) {
        zkApp.addMessage(messages[i]);
      }
    });
    await txn.prove();
    await txn.sign([senderKey]).send();
  });

  // it('Testing the offchain storage', async () => {
  //   const treeHeight = 8
  //   await localDeploy();
  //   const currentCount = zkApp.addressCount.get();
  //   console.log('Current Count is: ', currentCount.toString());

  //     const txn = await Mina.transaction(senderAccount, () => {
  //       zkApp.addAddress();
  //     });
  //     await txn.prove();
  //     await txn.sign([senderKey]).send();
  //   }

  //   const newCount = zkApp.addressCount.get();
  //   // console.log('New Count is: ', newCount.toString());
  //   expect(newCount).toEqual(Field(3));
  // });
});

// async function updateTree() {
//   const index = BigInt(Math.floor(Math.random() * 4));

//   // get the existing tree
//   const treeRoot = await zkapp.storageTreeRoot.get();
//   const idx2fields = await OffChainStorage.get(
//     storageServerAddress,
//     zkappPublicKey,
//     treeHeight,
//     treeRoot,
//     NodeXMLHttpRequest
//   );

//   const tree = OffChainStorage.mapToTree(treeHeight, idx2fields);
//   const leafWitness = new MerkleWitness8(tree.getWitness(BigInt(index)));

//   // get the prior leaf
//   const priorLeafIsEmpty = !idx2fields.has(index);
//   let priorLeafNumber: Field;
//   let newLeafNumber: Field;
//   if (!priorLeafIsEmpty) {
//     priorLeafNumber = idx2fields.get(index)![0];
//     newLeafNumber = priorLeafNumber.add(3);
//   } else {
//     priorLeafNumber = Field(0);
//     newLeafNumber = Field(1);
//   }

//   // update the leaf, and save it in the storage server
//   idx2fields.set(index, [newLeafNumber]);

//   const [storedNewStorageNumber, storedNewStorageSignature] =
//     await OffChainStorage.requestStore(
//       storageServerAddress,
//       zkappPublicKey,
//       treeHeight,
//       idx2fields,
//       NodeXMLHttpRequest
//     );

//   console.log(
//     'changing index',
//     index,
//     'from',
//     priorLeafNumber.toString(),
//     'to',
//     newLeafNumber.toString()
//   );
