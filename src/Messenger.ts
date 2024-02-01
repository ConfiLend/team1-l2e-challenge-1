import {
  Bool,
  Field,
  MerkleMap,
  SmartContract,
  state,
  State,
  method,
  MerkleMapWitness,
  Permissions,
  Provable,
  PublicKey,
  Poseidon,
  assert,
} from 'o1js';

export class Messenger extends SmartContract {
  @state(Field) addressCount = State<Field>();
  @state(Field) addressesHashMapRoot = State<Field>();
  @state(Field) messagesHashMapRoot = State<Field>();
  @state(Field) nullifiersHashMapRoot = State<Field>();

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

  @method addMessage(msg: Field, keyWitness: MerkleMapWitness) {
    const message = new Message(msg);
    this.assertMessageAddition(message, keyWitness);
    this.addMessageToHashMap(msg);
    // TODO emit event
  }

  // TODO we need to make sure that this is done only by the admin
  @method addAddress(keyWitness: MerkleMapWitness) {
    const initialRoot = this.addressesHashMapRoot.getAndRequireEquals();

    // check the initial state matches what we expect
    const [rootBefore, key] = keyWitness.computeRootAndKey(Field.empty());
    rootBefore.assertEquals(initialRoot);

    // if everythign is alright make sure that we are not >100 ppl
    this.incrementAddressCount(); // we should assert this

    // compute the root after new value
    const [rootAfter, _] = keyWitness.computeRootAndKey(Bool(true).toField());

    // set the new root
    this.addressesHashMapRoot.set(rootAfter);
  }

  // TODO
  addMessageToHashMap(msg: Field) {
    return msg;
  }

  /* make sure that the sender has permission and that
   * the message is proeperly structured
   */
  assertMessageAddition(message: Message, keyWitness: MerkleMapWitness) {
    this.assertSender(keyWitness);
    message.assertRules();
  }

  // asert that the sender is in the hash map
  assertSender(keyWitness: MerkleMapWitness) {
    const root = this.addressesHashMapRoot.getAndRequireEquals();
    const [rootCheck, key] = keyWitness.computeRootAndKey(Bool(true).toField());

    // assert that the keyWitness is right and thus also the value
    rootCheck.assertEquals(root, 'The sender is not in the approved addresses');

    /* this check above is enough but just so we can be
     * absolutely sure we assert that the keys are equal
     */
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
