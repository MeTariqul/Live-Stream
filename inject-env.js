const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'frontend', 'js', 'config.js');
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

let content = fs.readFileSync(CONFIG_PATH, 'utf8');
content = content.replace(
  /API_BASE_URL:\s*['"].*?['"]/,
  `API_BASE_URL: '${API_BASE_URL}'`
);
fs.writeFileSync(CONFIG_PATH, content);

console.log(`Injected API_BASE_URL=${API_BASE_URL} into frontend/js/config.js`);
