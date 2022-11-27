#! /usr/bin/env node
const yargs = require('yargs');
const { keccak256 } = require('js-sha3');
const secp256k1 = require('secp256k1');
const randomBytes = require('randombytes');

const startTimer = process.hrtime();
const executionTimeSecs = () => (process.hrtime(startTimer)[0] + process.hrtime(startTimer)[1] / Math.pow(10,9)).toFixed(2);

const options = yargs
  .usage("Usage: genwalleth -i <input>")
  .option("i", { alias: "input", describe: "Numbers and letters from A to F", type: "string", default: '' })
  .option("s", { alias: "sensitive", describe: "Case sensitive mode", type: "boolean", default: false })
  .option("p", { alias: "prefix", describe: "Search at the beginning of the address (suffix by default) ", type: "boolean", default: false })
  .option("j", { alias: "json", describe: "Return result as JSON", type: "boolean", default: false })
  .argv;

const clearLine = (l) => {
  process.stdout.clearLine(l);
  process.stdout.cursorTo(0);
};

const printOutputProgress = (data) => {
  clearLine(1);
  let output = '';
  let i = 0;
  for (const [key, value] of Object.entries(data)) {
    output += `\x1b[36m${key}:\x1b[0m \x1b[32m${value}\x1b[0m`;
    if (i !== Object.keys(data).length-1) {
      output += ' \x1b[2m|\x1b[0m ';
    } else {
      output += ' \x1b[2m| Ctrl + C for exit\x1b[0m';
    }
    i += 1;
  }
  process.stdout.write(output);
};

const printOutput = (data) => {
  clearLine(1);
  let output = '';
  for (let [key, value] of Object.entries(data)) {
    if (key === 'Address') value = `\x1b[33m${value}\x1b[0m`;
    output += `\x1b[36m* ${key.replace('_', ' ')}:\x1b[0m \x1b[32m${value}\x1b[0m\n`;
  }
  process.stdout.write(output);
};

const getRandomWallet = () => {
  const privKey = randomBytes(32); // private key (32 bytes)
  const pubKey = secp256k1.publicKeyCreate(privKey, false).slice(-64); // public key (64 bytes)
  const address = keccak256.array(pubKey).slice(11); // wallet address (last 40 characters / 20 bytes)
  return {
    privKey: privKey.toString('hex'),
    pubKey: Buffer.from(pubKey).toString('hex'),
    address: '0x' + toChecksumAddress(Buffer.from(address).toString('hex')),
  };
};

const isMatchedAddress = (address, input, isChecksum, isSuffix) => {
  address = address.slice(2)
  const subStr = isSuffix
    ? address.slice(address.length - input.length)
    : address.slice(0, input.length);
  return (isChecksum)
    ? input === subStr
    : input.toLowerCase() === subStr.toLowerCase();
};

const toChecksumAddress = (address) => {
  address = address.toLowerCase().slice(2);
  const hash = keccak256.hex(address);
  let ret = '';
  
  for (let i = 0; i < address.length; i++) {
    ret += (parseInt(hash[i], 16) >= 8) ? address[i].toUpperCase() : address[i];
  }
  
  return ret;
};

const getMatchedWallet = (input, isChecksum, isSuffix, returnJson) => {
  input = isChecksum ? input : input.toLowerCase();
  let wallet = getRandomWallet();
  let attempts = input ? 0 : 1;
  
  while (!isMatchedAddress(wallet.address, input, isChecksum, isSuffix)) {
    wallet = getRandomWallet();
    if(!returnJson) {
      printOutputProgress({ Attempts: attempts.toLocaleString() })
    }
    attempts++;
  }
  
  clearLine(0);
  
  return {
    ...wallet,
    attempts: input ? attempts : 1
  };
};

try {
  const result = getMatchedWallet(options.input, options.sensitive, !options.prefix, options.json);

  if(!options.json) {
    printOutput({
      Address: result.address,
      Private_key: result.privKey,
      Attempts: result.attempts.toLocaleString(),
      Execution_time: executionTimeSecs(),
    });
  } else {
    console.log(JSON.stringify(result));
  }
} catch (err) {
  console.log(err);
}
