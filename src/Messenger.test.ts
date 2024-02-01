import { Messenger, Message } from './Messenger';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  MerkleMap,
  Bool,
  Provable,
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

  it.skip('Generates and deploys the `Messenger` smart contract', async () => {
    await localDeploy();
    const addressCount = zkApp.addressCount.get();
    expect(addressCount).toEqual(Field(0));
  });

  it('Correctly updates the address count state on the `Messenger` smart contract', async () => {
    await localDeploy();

    // 3 addAddress transactions
    for (let i = 0; i < 3; i++) {
      //create new transaction

      //get the witness of the new key
      let hash = Message.hashPubKey(PrivateKey.random().toPublicKey());
      if (i == 2) {
        hash = Message.hashPubKey(senderAccount);
      }
      const witness = addressesMap.getWitness(hash);

      //create and send the transction
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.addAddress(witness);
      });

      // update the local map
      Provable.log('Added PublicKey: ', hash);
      addressesMap.set(hash, Bool(true).toField());

      await txn.prove();
      await txn.sign([senderKey]).send();
    }

    const newCount = zkApp.addressCount.get();
    expect(newCount).toEqual(Field(3));
  });

  it('Assertions Rules', async () => {
    await localDeploy();

    const messages = [
      // Rules:
      Field(0), // true, true, true
      // Field(0), // true, true, true
      // Field(1), // true, true, true
      // Field(15), // false, true, true
      // Field(31), // false, true, false
      // Field(11), // false, false, true
      // Field(43), // false, false, false
    ];

    const hash = Message.hashPubKey(senderAccount);

    for (let i = 0; i < 3; i++) {
      Provable.log(
        'Local Nullifier Root: ',
        nullifiersMap.getRoot(),
        '\nOn-chain Nullifier Root',
        zkApp.nullifiersHashMapRoot.get()
      );
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.addMessage(
          messages[i],
          addressesMap.getWitness(hash),
          messagesMap.getWitness(hash),
          nullifiersMap.getWitness(hash)
        );
      });

      await txn.prove();
      await txn.sign([senderKey]).send();

      messagesMap.set(hash, messages[i]);
      nullifiersMap.set(hash, Bool(true).toField());
      Provable.log(messagesMap.get(hash));
    }
  });
});
