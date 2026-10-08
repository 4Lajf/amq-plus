import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile = path.join(__dirname, 'data.txt');
const outputFile = path.join(__dirname, 'parsed_data.json');

function parseData() {
  const content = fs.readFileSync(inputFile, 'utf-8');
  const lines = content.split('\n');
  const result = {};

  for (let line of lines) {
    line = line.trim();
    if (!line || line === '{,…}' || line === '}') continue;

    // Match index, tab, key, and the data part
    // Format: "1.	Artist_Title: {date: 123, ...}"
    const match = line.match(/^\d+\.\s+(.*?):\s*\{(.*)\}/);
    if (!match) {
      console.warn(`Could not parse line: ${line}`);
      continue;
    }

    const songKey = match[1].trim();
    const dataStr = match[2].trim();

    const data = {};
    // Parse key-value pairs like "date: 123, efactor: 1.5"
    // We handle the "…" truncation by just taking what we can
    const pairs = dataStr.split(',');
    for (let pair of pairs) {
      pair = pair.trim();
      if (!pair || pair === '…') continue;

      const [key, ...valueParts] = pair.split(':');
      if (!key || valueParts.length === 0) continue;

      const value = valueParts.join(':').trim();
      
      // Clean up value (remove trailing ellipsis if any)
      const cleanValue = value.replace(/…$/, '').trim();

      // Convert to number if possible
      if (!isNaN(cleanValue) && cleanValue !== '') {
        data[key.trim()] = Number(cleanValue);
      } else {
        data[key.trim()] = cleanValue;
      }
    }

    result[songKey] = data;
  }

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`Successfully parsed ${Object.keys(result).length} songs to ${outputFile}`);
}

parseData();

