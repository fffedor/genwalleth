#!/usr/bin/env node
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const yargs = require('yargs');

if (isMainThread) {
  const startTimer = process.hrtime();
  const getExecutionTime = () => {
    const [secs, nanos] = process.hrtime(startTimer);
    return (secs + nanos / 1e9).toFixed(2);
  };
  
  const options = yargs
    .usage('Usage: genwalleth -i <input>')
    .option('i', { alias: 'input', describe: 'Hex pattern (0-9, A-F)', type: 'string', default: '' })
    .option('s', { alias: 'sensitive', describe: 'Case sensitive mode', type: 'boolean', default: false })
    .option('p', { alias: 'prefix', describe: 'Match at start (suffix by default)', type: 'boolean', default: false })
    .option('j', { alias: 'json', describe: 'JSON output', type: 'boolean', default: false })
    .option('t', { alias: 'threads', describe: 'Number of threads', type: 'number', default: os.cpus().length })
    .example('genwalleth -i dead', 'Find address ending with "dead"')
    .example('genwalleth -i cafe -t 8', 'Use 8 threads')
    .help('h').alias('h', 'help').argv;
  
  const isValidHexInput = (input) => /^[0-9a-fA-F]*$/.test(input);
  
  const validateInput = (input) => {
    if (!isValidHexInput(input)) {
      console.error('\x1b[31mError:\x1b[0m Input must be hex (0-9, A-F)');
      process.exit(1);
    }
    if (input.length > 40) {
      console.error('\x1b[31mError:\x1b[0m Max 40 characters');
      process.exit(1);
    }
    if (input.length > 6) {
      const est = Math.pow(16, input.length);
      console.warn(`\x1b[33mWarning:\x1b[0m ~${est.toLocaleString()} attempts avg.\n`);
    }
  };
  
  const clearLine = () => {
    if (process.stdout.isTTY) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
  };
  
  const printProgress = (attempts, threads) => {
    if (!process.stdout.isTTY) return;
    clearLine();
    const elapsed = parseFloat(getExecutionTime());
    const rate = elapsed > 0 ? (attempts / elapsed).toFixed(0) : '0';
    process.stdout.write(
      `\x1b[36mAttempts:\x1b[0m \x1b[32m${attempts.toLocaleString()}\x1b[0m \x1b[2m|\x1b[0m ` +
      `\x1b[36mRate:\x1b[0m \x1b[32m${parseInt(rate).toLocaleString()}/s\x1b[0m \x1b[2m|\x1b[0m ` +
      `\x1b[36mThreads:\x1b[0m \x1b[32m${threads}\x1b[0m \x1b[2m|\x1b[0m ` +
      `\x1b[36mTime:\x1b[0m \x1b[32m${getExecutionTime()}s\x1b[0m \x1b[2m| Ctrl+C to exit\x1b[0m`
    );
  };
  
  const printResult = (data) => {
    clearLine();
    const lines = Object.entries(data).map(([key, value]) => {
      const k = key.replace(/_/g, ' ');
      const v = key === 'Address' ? `\x1b[33m${value}\x1b[0m` : `\x1b[32m${value}\x1b[0m`;
      return `\x1b[36m* ${k}:\x1b[0m ${v}`;
    });
    console.log(lines.join('\n'));
  };
  
  const generateSingleWallet = () => {
    const { keccak256 } = require('js-sha3');
    const secp256k1 = require('secp256k1');
    const randomBytes = require('randombytes');
    
    let privKey, pubKey;
    while (true) {
      try {
        privKey = randomBytes(32);
        pubKey = secp256k1.publicKeyCreate(privKey, false).slice(1);
        break;
      } catch { }
    }
    
    const addrBytes = keccak256.array(pubKey).slice(12);
    const addrHex = Buffer.from(addrBytes).toString('hex');
    const hash = keccak256.hex(addrHex);
    let checksummed = '';
    for (let i = 0; i < addrHex.length; i++) {
      checksummed += parseInt(hash[i], 16) >= 8 ? addrHex[i].toUpperCase() : addrHex[i];
    }
    
    return {
      address: '0x' + checksummed,
      privateKey: privKey.toString('hex'),
      publicKey: Buffer.from(pubKey).toString('hex'),
    };
  };
  
  validateInput(options.input);
  
  if (!options.input) {
    const wallet = generateSingleWallet();
    if (options.json) {
      console.log(JSON.stringify({
        ...wallet,
        attempts: 1,
        executionTime: getExecutionTime(),
      }));
    } else {
      printResult({
        Address: wallet.address,
        Private_key: wallet.privateKey,
        Attempts: '1',
        Execution_time: `${getExecutionTime()}s`,
      });
    }
    process.exit(0);
  }
  
  const numThreads = Math.max(1, Math.min(options.threads, os.cpus().length * 2));
  const workers = [];
  let totalAttempts = 0;
  let found = false;
  let progressInterval;
  
  const cleanup = () => {
    clearInterval(progressInterval);
    workers.forEach(w => w.terminate());
  };
  
  process.on('SIGINT', () => {
    cleanup();
    clearLine();
    console.log('\n\x1b[33mSearch cancelled.\x1b[0m');
    process.exit(0);
  });
  
  progressInterval = setInterval(() => {
    if (!options.json && !found) printProgress(totalAttempts, numThreads);
  }, 100);
  
  for (let i = 0; i < numThreads; i++) {
    const worker = new Worker(__filename, {
      workerData: {
        pattern: options.input,
        caseSensitive: options.sensitive,
        matchPrefix: options.prefix,
        workerId: i,
      }
    });
    
    worker.on('message', (msg) => {
      if (found) return;
      
      if (msg.type === 'progress') {
        totalAttempts += msg.attempts;
      } else if (msg.type === 'found') {
        found = true;
        cleanup();
        
        const result = msg.wallet;
        const finalAttempts = totalAttempts + msg.attempts;
        
        if (options.json) {
          console.log(JSON.stringify({
            address: result.address,
            privateKey: result.privKey,
            publicKey: result.pubKey,
            attempts: finalAttempts,
            executionTime: getExecutionTime(),
            threads: numThreads,
          }));
        } else {
          printResult({
            Address: result.address,
            Private_key: result.privKey,
            Attempts: finalAttempts.toLocaleString(),
            Threads_used: numThreads,
            Execution_time: `${getExecutionTime()}s`,
          });
        }
        process.exit(0);
      }
    });
    
    worker.on('error', (err) => {
      console.error('\x1b[31mWorker error:\x1b[0m', err.message);
      cleanup();
      process.exit(1);
    });
    
    workers.push(worker);
  }
  
} else {
  const { keccak256 } = require('js-sha3');
  const secp256k1 = require('secp256k1');
  const randomBytes = require('randombytes');
  
  const { pattern, caseSensitive, matchPrefix } = workerData;
  const normalizedPattern = caseSensitive ? pattern : pattern.toLowerCase();
  const patternLen = pattern.length;
  
  const BATCH_SIZE = 1000;
  const PRIV_KEY_BYTES = 32;
  const ADDR_OFFSET = 12;
  
  let localAttempts = 0;
  let totalLocalAttempts = 0;
  
  const toChecksumAddress = (addrHex) => {
    const hash = keccak256.hex(addrHex);
    let out = '';
    for (let i = 0; i < 40; i++) {
      out += parseInt(hash[i], 16) >= 8 ? addrHex[i].toUpperCase() : addrHex[i];
    }
    return out;
  };
  
  const matchAddress = (addrHex, checksumAddr) => {
    const compareAddr = caseSensitive ? checksumAddr : addrHex;
    if (matchPrefix) {
      for (let i = 0; i < patternLen; i++) {
        if (compareAddr[i] !== normalizedPattern[i]) return false;
      }
    } else {
      const offset = 40 - patternLen;
      for (let i = 0; i < patternLen; i++) {
        if (compareAddr[offset + i] !== normalizedPattern[i]) return false;
      }
    }
    return true;
  };
  
  while (true) {
    for (let batch = 0; batch < BATCH_SIZE; batch++) {
      localAttempts++;
      totalLocalAttempts++;
      
      let privKey, pubKey;
      try {
        privKey = randomBytes(PRIV_KEY_BYTES);
        pubKey = secp256k1.publicKeyCreate(privKey, false);
      } catch {
        continue;
      }
      
      const pubKeyData = pubKey.subarray(1);
      const keccakResult = keccak256.array(pubKeyData);
      
      let addrHex = '';
      for (let i = ADDR_OFFSET; i < 32; i++) {
        const byte = keccakResult[i];
        addrHex += (byte < 16 ? '0' : '') + byte.toString(16);
      }
      
      const checksumAddr = caseSensitive ? toChecksumAddress(addrHex) : null;
      
      if (matchAddress(addrHex, checksumAddr)) {
        const finalChecksum = checksumAddr || toChecksumAddress(addrHex);
        parentPort.postMessage({
          type: 'found',
          attempts: totalLocalAttempts,
          wallet: {
            address: '0x' + finalChecksum,
            privKey: privKey.toString('hex'),
            pubKey: Buffer.from(pubKeyData).toString('hex'),
          }
        });
        return;
      }
    }
    
    parentPort.postMessage({ type: 'progress', attempts: localAttempts });
    localAttempts = 0;
  }
}
