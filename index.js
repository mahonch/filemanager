const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream');
const readline = require('readline');

const args = process.argv.slice(2);
const username = args.find(arg => arg.startsWith('--username='))?.split('=')[1] || 'User';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let currentDir = os.homedir();

console.log(`Welcome to the File Manager, ${username}!`);
showCurrentDir();

function showCurrentDir() {
  console.log(`You are currently in ${currentDir}`);
  rl.prompt();
}

function isRootDir(dir) {
  const parsed = path.parse(dir);
  return parsed.root === dir || parsed.dir === parsed.root;
}

async function handleCommand(input) {
  const [command, ...args] = input.trim().split(' ').filter(Boolean);

  try {
    switch (command) {
      // Navigation & working directory
      case 'up':
        if (!isRootDir(currentDir)) {
          currentDir = path.dirname(currentDir);
        }
        break;

      case 'cd':
        if (!args[0]) throw new Error('Invalid input');
        const newDir = path.resolve(currentDir, args[0]);
        const stats = await fs.stat(newDir);
        if (!stats.isDirectory()) throw new Error('Invalid input');
        if (!isRootDir(newDir) |д| newDir.startsWith(os.homedir())) {
          currentDir = newDir;
        }
        break;

      case 'ls':
        const items = await fs.readdir(currentDir, { withFileTypes: true });
        const dirs = items.filter(item => item.isDirectory()).map(item => ({ name: item.name, type: 'directory' }));
        const files = items.filter(item => item.isFile()).map(item => ({ name: item.name, type: 'file' }));
        const sorted = [...dirs, ...files].sort((a, b) => a.name.localeCompare(b.name));
        console.table(sorted);
        break;

      // Basic file operations
      case 'cat':
        if (!args[0]) throw new Error('Invalid input');
        const readPath = path.resolve(currentDir, args[0]);
        const readStream = fsSync.createReadStream(readPath);
        readStream.pipe(process.stdout);
        await new Promise(resolve => readStream.on('end', resolve));
        console.log();
        break;

      case 'add':
        if (!args[0]) throw new Error('Invalid input');
        await fs.writeFile(path.join(currentDir, args[0]), '');
        break;

      case 'rn':
        if (!args[0] || !args[1]) throw new Error('Invalid input');
        const oldPath = path.resolve(currentDir, args[0]);
        const newPath = path.join(path.dirname(oldPath), args[1]);
        await fs.rename(oldPath, newPath);
        break;

      case 'cp':
        if (!args[0] || !args[1]) throw new Error('Invalid input');
        const srcPath = path.resolve(currentDir, args[0]);
        const destPath = path.resolve(currentDir, args[1]);
        const readCpStream = fsSync.createReadStream(srcPath);
        const writeCpStream = fsSync.createWriteStream(destPath);
        pipeline(readCpStream, writeCpStream, err => {
          if (err) throw new Error('Operation failed');
        });
        break;

      case 'mv':
        if (!args[0] || !args[1]) throw new Error('Invalid input');
        const srcMvPath = path.resolve(currentDir, args[0]);
        const destMvPath = path.resolve(currentDir, args[1]);
        const readMvStream = fsSync.createReadStream(srcMvPath);
        const writeMvStream = fsSync.createWriteStream(destMvPath);
        await new Promise((resolve, reject) => {
          pipeline(readMvStream, writeMvStream, async err => {
            if (err) return reject(new Error('Operation failed'));
            await fs.unlink(srcMvPath);
            resolve();
          });
        });
        break;

      case 'rm':
        if (!args[0]) throw new Error('Invalid input');
        await fs.unlink(path.resolve(currentDir, args[0]));
        break;

      // Operating system info
      case 'os':
        if (!args[0]) throw new Error('Invalid input');
        switch (args[0]) {
          case '--EOL':
            console.log(JSON.stringify(os.EOL));
            break;
          case '--cpus':
            console.table(os.cpus().map(cpu => ({
              model: cpu.model,
              speed: (cpu.speed / 1000).toFixed(2) + ' GHz'
            })));
            break;
          case '--homedir':
            console.log(os.homedir());
            break;
          case '--username':
            console.log(os.userInfo().username);
            break;
          case '--architecture':
            console.log(process.arch);
            break;
          default:
            throw new Error('Invalid input');
        }
        break;

      // Hash calculation
      case 'hash':
        if (!args[0]) throw new Error('Invalid input');
        const filePath = path.resolve(currentDir, args[0]);
        const hash = crypto.createHash('sha256');
        const hashStream = fsSync.createReadStream(filePath);
        hashStream.pipe(hash);
        const hashValue = await new Promise(resolve => {
          hash.on('finish', () => resolve(hash.digest('hex')));
          hashStream.pipe(hash);
        });
        console.log(hashValue);
        break;

      // Compress and decompress
      case 'compress':
        if (!args[0] || !args[1]) throw new Error('Invalid input');
        const srcCompress = path.resolve(currentDir, args[0]);
        const destCompress = path.resolve(currentDir, args[1]);
        const compressStream = fsSync.createReadStream(srcCompress);
        const brotliCompress = zlib.createBrotliCompress();
        const writeCompress = fsSync.createWriteStream(destCompress);
        pipeline(compressStream, brotliCompress, writeCompress, err => {
          if (err) throw new Error('Operation failed');
        });
        break;

      case 'decompress':
        if (!args[0] || !args[1]) throw new Error('Invalid input');
        const srcDecompress = path.resolve(currentDir, args[0]);
        const destDecompress = path.resolve(currentDir, args[1]);
        const decompressStream = fsSync.createReadStream(srcDecompress);
        const brotliDecompress = zlib.createBrotliDecompress();
        const writeDecompress = fsSync.createWriteStream(destDecompress);
        pipeline(decompressStream, brotliDecompress, writeDecompress, err => {
          if (err) throw new Error('Operation failed');
        });
        break;

      case '.exit':
        console.log(`Thank you for using File Manager, ${username}, goodbye!`);
        process.exit(0);

      default:
        throw new Error('Invalid input');
    }
  } catch (err) {
    console.error(err.message === 'Invalid input' || err.message === 'Operation failed' 
      ? err.message 
      : 'Operation failed');
  }
  showCurrentDir();
}

rl.on('line', handleCommand);

process.on('SIGINT', () => {
  console.log(`Thank you for using File Manager, ${username}, goodbye!`);
  process.exit(0);
});