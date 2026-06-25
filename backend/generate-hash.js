const bcrypt = require('bcrypt');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node generate-hash.js <password>');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('BCRYPT_HASH=' + hash);
