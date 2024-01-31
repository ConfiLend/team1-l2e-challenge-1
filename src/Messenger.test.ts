import { Messenger } from './Messenger';
import { Field, Mina, PrivateKey, PublicKey, AccountUpdate } from 'o1js';

let proofsEnabled = false;

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

  // it('generates and deploys the `Messenger` smart contract', async () => {
  //   await localDeploy();
  //   const addressCount = zkApp.addressCount.get();
  //   expect(addressCount).toEqual(Field(0));
  // });

  // it('correctly updates the address count state on the `Messenger` smart contract', async () => {
  //   await localDeploy();
  //   // const currentCount = zkApp.addressCount.get();
  //   // console.log('Current Count is: ', currentCount.toString());

  //   // 3 addAddress transactions
  //   for (let i = 0; i < 3; i++) {
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

  // it('correctly updates the address count state on the `Messenger` smart contract', async () => {
  //   await localDeploy();
  //   // const currentCount = zkApp.addressCount.get();
  //   // console.log('Current Count is: ', currentCount.toString());

  //   // 3 addAddress transactions
  //   for (let i = 0; i < 3; i++) {
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
