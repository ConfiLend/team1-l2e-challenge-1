import {
  Bool,
  Field,
  SmartContract,
  state,
  State,
  method,
  MerkleMapWitness,
  Permissions,
  Provable,
  PublicKey,
  Poseidon,
} from 'o1js';

export class Messenger extends SmartContract {
  @state(Field) addressCount = State<Field>();
  @state(Field) addressesHashMapRoot = State<Field>();
  @state(Field) messagesHashMapRoot = State<Field>();
  @state(Field) nullifiersHashMapRoot = State<Field>();

  events = {
    'New message added:': Field,
  };

  // TODO setup configs
  deploy() {
    super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });
  }

  @method initState(
    addressesHashMapRoot: Field,
    messagesHashMapRoot: Field,
    nullifiersHashMapRoot: Field
  ) {
    super.init();
    this.addressCount.set(Field(0));
    this.addressesHashMapRoot.set(addressesHashMapRoot);
    this.messagesHashMapRoot.set(messagesHashMapRoot);
    this.nullifiersHashMapRoot.set(nullifiersHashMapRoot);
  }

  incrementAddressCount() {
    const addressCount = this.addressCount.getAndRequireEquals();

    const newCount = addressCount.add(1);

    newCount.assertLessThanOrEqual(3); //  TODO update for 100

    this.addressCount.set(newCount);
  }

  // TODO we need to make sure that this is done only by the admin
  @method addAddress(keyWitness: MerkleMapWitness) {
    const initialRoot = this.addressesHashMapRoot.getAndRequireEquals();

    // check the initial state matches what we expect
    const [beforeRoot, key] = keyWitness.computeRootAndKey(Field.empty());
    beforeRoot.assertEquals(initialRoot);

    // if everythign is alright make sure that we are not >100 ppl
    this.incrementAddressCount();

    // compute the root after new value
    const [rootAfter, _] = keyWitness.computeRootAndKey(Bool(true).toField());

    // set the new root
    this.addressesHashMapRoot.set(rootAfter);
  }

  @method addMessage(
    msg: Field,
    keyWitnessAddresses: MerkleMapWitness,
    keyWitnessMessages: MerkleMapWitness,
    keyWitnessNullifiers: MerkleMapWitness
  ) {
    const message = new Message(msg);
    this.assertMessageAddition(
      message,
      keyWitnessAddresses,
      keyWitnessNullifiers
    );
    this.addMessageToHashMap(msg, keyWitnessMessages);
    this.nullifyAddress(keyWitnessNullifiers);
    this.emitEvent('New message added:', msg);
  }

  addMessageToHashMap(msg: Field, keyWitness: MerkleMapWitness) {
    const initialRoot = this.messagesHashMapRoot.getAndRequireEquals();
    const [beforeRoot, key] = keyWitness.computeRootAndKey(Field(0));

    // check to see that everything is as expected
    initialRoot.assertEquals(
      beforeRoot,
      'Seems like the message is already in the map'
    );
    const hash = Message.hashPubKey(this.sender);
    hash.assertEquals(key, 'Seems like the message is already in the map');

    // calculate and set new root
    const [newRoot, _] = keyWitness.computeRootAndKey(msg);
    this.messagesHashMapRoot.set(newRoot);
  }

  nullifyAddress(keyWitness: MerkleMapWitness) {
    const initialRoot = this.nullifiersHashMapRoot.getAndRequireEquals();
    const [checkRoot, key] = keyWitness.computeRootAndKey(Field.empty());

    // check to see that everything is as expected
    checkRoot.assertEquals(initialRoot, 'The Key Witness is faulty');
    const hash = Message.hashPubKey(this.sender);
    hash.assertEquals(key, 'The Key Witness is faulty');

    // calculate and set new root
    const [newRoot, _] = keyWitness.computeRootAndKey(Bool(true).toField());
    this.nullifiersHashMapRoot.set(newRoot);
  }

  assertNullifiers(keyWitness: MerkleMapWitness) {
    const initialRoot = this.nullifiersHashMapRoot.getAndRequireEquals();
    const [checkRoot, key] = keyWitness.computeRootAndKey(Field.empty());

    // check to see that everything is as expected
    checkRoot.assertEquals(
      initialRoot,
      'This address has already sent its message'
    );
    const hash = Message.hashPubKey(this.sender);
    hash.assertEquals(key, 'This address has already sent its message');
  }

  /* make sure that:
   * the sender has permission
   * the sender sends its first message
   * the message is properly structured
   */
  assertMessageAddition(
    message: Message,
    keyWitnessAddresses: MerkleMapWitness,
    keyWitnessMessages: MerkleMapWitness
  ) {
    this.assertNullifiers(keyWitnessMessages);
    this.assertSender(keyWitnessAddresses);
    message.assertRules();
  }

  // asert that the sender is in the hash map
  assertSender(keyWitness: MerkleMapWitness) {
    const initialRoot = this.addressesHashMapRoot.getAndRequireEquals();
    const [checkRoot, key] = keyWitness.computeRootAndKey(Bool(true).toField());

    // assert that the keyWitness is right and thus also the value
    checkRoot.assertEquals(
      initialRoot,
      'The sender is not in the approved addresses'
    );

    // second check to see if the sender is in the approved addresses
    const hash = Message.hashPubKey(this.sender);
    hash.assertEquals(key, 'The sender is not in the approved addresses');
  }
}

// class which allows us to abstract the msg checks
export class Message {
  publicKey: PublicKey;
  private msg: Field;

  constructor(fieldValue: Field) {
    this.msg = fieldValue;
  }

  setPublicKey(publicKey: PublicKey) {
    this.publicKey = publicKey;
  }

  static hashPubKey(publicKey: PublicKey): Field {
    publicKey.isEmpty().assertFalse("The Pair is empty we can't hash it");
    const fields = publicKey.toFields();
    const hash = Poseidon.hash(fields);
    return hash;
  }

  assertRules() {
    const bits = this.msg.toBits();
    this.assertRule1(bits);
    this.assertRule2(bits);
    this.assertRule3(bits);
    Provable.log(
      this.msg,
      ' = ',
      bits[0],
      ' ',
      bits[1],
      ' ',
      bits[2],
      ' ',
      bits[3],
      ' ',
      bits[4],
      ' ',
      bits[5]
    );
  }

  //If flag 1 is true, then all other flags must be false
  assertRule1(bits: Bool[]) {
    for (let i = 1; i < 6; i++) {
      this.assertIfFirstNotSecond(
        bits[0],
        bits[i],
        "Rule 1 - Flag 1 is not the only 'true' flag"
      );
    }
  }

  //If flag 2 is true, then flag 3 must also be true.
  assertRule2(bits: Bool[]) {
    this.assertIfFirstThenSecond(
      bits[1],
      bits[2],
      'Rule 2 - Flag 2 is set but flag 3 is not'
    );
  }

  //If flag 4 is true, then flags 5 and 6 must be false.
  assertRule3(bits: Bool[]) {
    this.assertIfFirstNotSecond(
      bits[3],
      bits[4],
      'Rule 3 - Flag 4 & 5 are both set'
    );
    this.assertIfFirstNotSecond(
      bits[3],
      bits[5],
      'Rule 3 - Flag 4 & 6 are both set'
    );
  }

  // If first=true then second=true
  assertIfFirstThenSecond(first: Bool, second: Bool, msg: string) {
    first.not().or(second).assertTrue(msg);
  }

  // If first=true then second=false
  assertIfFirstNotSecond(first: Bool, second: Bool, msg: string) {
    first.not().or(second.not()).assertTrue(msg);
  }
}
