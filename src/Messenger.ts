import {
  Bool,
  Field,
  DeployArgs,
  SmartContract,
  state,
  State,
  method,
  Permissions,
  Provable,
  PublicKey,
} from 'o1js';

export class Messenger extends SmartContract {
  @state(Field) addressCount = State<Field>();
  @state(PublicKey) storageServerPublicKey = State<PublicKey>();
  @state(Field) storageNumber = State<Field>();
  @state(Field) storageTreeRoot = State<Field>();

  deploy() {
    super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });
  }

  // TODO setup configs
  @method initState(storageServerPublicKey: PublicKey) {
    super.init();
    this.storageServerPublicKey.set(storageServerPublicKey);
    this.addressCount.set(Field(0));
  }

  // maybe @method
  incrementAddressCount() {
    const currentCount = this.addressCount.getAndRequireEquals();
    // Provable.log('Current Count is', currentCount);
    const newCount = Provable.if(
      currentCount.lessThan(3), // TODO update to 100 for
      currentCount.add(1),
      currentCount
    );
    // Provable.log('New Count is', newCount);
    this.addressCount.set(newCount);
  }

  @method addMessage(message: Field) {
    const msg = new Message(message);
    msg.assertRules();
  }

  // we need to make sure that this is done only by the admin
  @method addAddress() {
    this.incrementAddressCount();
  }
}

// class which allows us to abstract the msg checks
class Message {
  private msg: Field;

  constructor(fieldValue: Field) {
    this.msg = fieldValue;
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

  getMessageValue(): Field {
    return this.msg;
  }
}