import { Messenger, Message } from './Messenger';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  MerkleMap,
  Bool,
} from 'o1js';

let proofsEnabled = false;

const addressesMap = new MerkleMap();
const messagesMap = new MerkleMap();
const nullifiersMap = new MerkleMap();

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
      zkApp.initState(
        addressesMap.getRoot(),
        messagesMap.getRoot(),
        nullifiersMap.getRoot()
      );
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it.skip('generates and deploys the `Messenger` smart contract', async () => {
    await localDeploy();
    const addressCount = zkApp.addressCount.get();
    expect(addressCount).toEqual(Field(0));
  });

  it('correctly updates the address count state on the `Messenger` smart contract', async () => {
    await localDeploy();

    // 3 addAddress transactions
    for (let i = 0; i < 3; i++) {
      //create new transaction
      const newPair = new Message({
        publicKey: PrivateKey.random().toPublicKey(),
        message: Field.empty(),
      });

      //get the witness of the new key
      const key = newPair.hashPubKey();
      const witness = addressesMap.getWitness(key);

      //create and send the transction
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.addAddress(witness);
      });

      // update the local map
      addressesMap.set(key, Bool(true).toField());

      await txn.prove();
      await txn.sign([senderKey]).send();
    }

    const newCount = zkApp.addressCount.get();
    expect(newCount).toEqual(Field(3));
  });

  it.skip('Assertions Rules', async () => {
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
});
