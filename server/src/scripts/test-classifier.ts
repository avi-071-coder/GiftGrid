import dotenv from 'dotenv';
dotenv.config();

import { classifyProduct } from '../classifier';

async function test() {
  const result = await classifyProduct('Samsung Galaxy S24', 'Flipkart', 'https://flipkart.com/samsung');
  console.log('Result:', result);
}

test();
