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
  UInt32,
} from 'o1js';

let proofsEnabled = false;

describe('Messenger', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    senderAccount: PublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: Messenger;

  const addressesMap = new MerkleMap();
  const messagesMap = new MerkleMap();
  const nullifiersMap = new MerkleMap();
  const Local = Mina.LocalBlockchain({ proofsEnabled });

  beforeAll(async () => {
    if (proofsEnabled) await Messenger.compile();
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } =
      Local.testAccounts[0]);
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Messenger(zkAppAddress);
  });

  // beforeEach(() => {console.log()});

  async function localDeploy() {
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Messenger(zkAppAddress);
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

  it('Generates and deploys the `Messenger` smart contract', async () => {
    await localDeploy();
    const addressCount = zkApp.addressCount.get();
    expect(addressCount).toEqual(Field(0));
  });

  it('Only admin can call add address', async () => {
    //get the witness of the new key
    try {
      let hash = Message.hashPubKey(Local.testAccounts[0].publicKey);
      const witness = addressesMap.getWitness(hash);

      //create and send the transction
      const txn = await Mina.transaction(
        Local.testAccounts[1].publicKey,
        () => {
          zkApp.addAddress(witness);
        }
      );

      // update the local map
      addressesMap.set(hash, Bool(true).toField());

      await txn.prove();
      await txn.sign([senderKey]).send();
    } catch (error) {
      expect(String(error)).toMatch(
        /.*You have to be admin to call this function.*/
      );
    }
  });

  it('Correctly updates the address count', async () => {
    for (let i = 0; i < 3; i++) {
      //get the witness of the new key
      let hash = Message.hashPubKey(Local.testAccounts[i].publicKey);
      const witness = addressesMap.getWitness(hash);

      //create and send the transction
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.addAddress(witness);
      });

      // update the local map
      // Provable.log('Added PublicKey: ', hash);
      addressesMap.set(hash, Bool(true).toField());

      await txn.prove();
      await txn.sign([senderKey]).send();
    }

    const newCount = zkApp.addressCount.get();
    expect(newCount).toEqual(Field(3));
  });

  it('Add message unsuccessfully Rule1', async () => {
    try {
      const hash = Message.hashPubKey(senderAccount);
      let txn = await Mina.transaction(senderAccount, () => {
        zkApp.addMessage(
          Field(3),
          addressesMap.getWitness(hash),
          messagesMap.getWitness(hash),
          nullifiersMap.getWitness(hash)
        );
      });
      await txn.prove();
      await txn.sign([senderKey]).send();
      messagesMap.set(hash, Field(15));
      nullifiersMap.set(hash, Bool(true).toField());
    } catch (error) {
      expect(String(error)).toMatch(/.*Rule 1.*/);
    }
  });

  it('Add message unsuccessfully Rule2', async () => {
    try {
      const hash = Message.hashPubKey(senderAccount);
      let txn = await Mina.transaction(senderAccount, () => {
        zkApp.addMessage(
          Field(2),
          addressesMap.getWitness(hash),
          messagesMap.getWitness(hash),
          nullifiersMap.getWitness(hash)
        );
      });
      await txn.prove();
      await txn.sign([senderKey]).send();
      messagesMap.set(hash, Field(14));
      nullifiersMap.set(hash, Bool(true).toField());
    } catch (error) {
      expect(String(error)).toMatch(/.*Rule 2.*/);
    }
  });

  it('Add message unsuccessfully Rule3', async () => {
    try {
      const hash = Message.hashPubKey(senderAccount);
      let txn = await Mina.transaction(senderAccount, () => {
        zkApp.addMessage(
          Field(40),
          addressesMap.getWitness(hash),
          messagesMap.getWitness(hash),
          nullifiersMap.getWitness(hash)
        );
      });
      await txn.prove();
      await txn.sign([senderKey]).send();
      messagesMap.set(hash, Field(43));
      nullifiersMap.set(hash, Bool(true).toField());
    } catch (error) {
      expect(String(error)).toMatch(/.*Rule 3.*/);
    }
  });

  it('Add message successfully with event', async () => {
    const hash = Message.hashPubKey(senderAccount);

    let txn = await Mina.transaction(senderAccount, () => {
      zkApp.addMessage(
        Field(1),
        addressesMap.getWitness(hash),
        messagesMap.getWitness(hash),
        nullifiersMap.getWitness(hash)
      );
    });
    await txn.prove();
    await txn.sign([senderKey]).send();
    messagesMap.set(hash, Field(1));
    nullifiersMap.set(hash, Bool(true).toField());

    const events = await zkApp.fetchEvents(UInt32.from(0));
    expect(events[0].event.data).toEqual(Field(1));
    expect(events[0].type).toMatch(/New message added:/);
  });

  it('Sender second message', async () => {
    const hash = Message.hashPubKey(senderAccount);
    try {
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.addMessage(
          Field(1),
          addressesMap.getWitness(hash),
          messagesMap.getWitness(hash),
          nullifiersMap.getWitness(hash)
        );
      });
      await txn.prove();
      await txn.sign([senderKey]).send();
    } catch (error) {
      expect(String(error)).toMatch(
        / .*This address has already sent its message.*/
      );
    }
  });

  it('Sender not approved', async () => {
    const senderAccount = Local.testAccounts[4].publicKey;
    const hash = Message.hashPubKey(senderAccount);
    try {
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.addMessage(
          Field(1),
          addressesMap.getWitness(hash),
          messagesMap.getWitness(hash),
          nullifiersMap.getWitness(hash)
        );
      });
      await txn.prove();
      await txn.sign([senderKey]).send();
    } catch (error) {
      expect(String(error)).toMatch(
        / .*The sender is not in the approved addresses.*/
      );
    }
  });

  it('Correctly adds 100 accounts', async () => {
    for (let i = 0; i < 97; i++) {
      const pubKey = PrivateKey.random().toPublicKey();
      //get the witness of the new key
      let hash = Message.hashPubKey(pubKey);
      const witness = addressesMap.getWitness(hash);

      //create and send the transction
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.addAddress(witness);
      });

      // update the local map
      addressesMap.set(hash, Bool(true).toField());

      await txn.prove();
      await txn.sign([senderKey]).send();
    }

    const newCount = zkApp.addressCount.get();
    expect(newCount).toEqual(Field(100));
    expect(zkApp.addressesHashMapRoot.get()).toEqual(addressesMap.getRoot());
  });

  it('Add address over the limit', async () => {
    try {
      let hash = Message.hashPubKey(Local.testAccounts[4].publicKey);
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
    } catch (error) {
      expect(String(error)).toMatch(/.*No more addresses are allowed.*/);
    }
  });
});
