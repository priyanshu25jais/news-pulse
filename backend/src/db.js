import { MongoClient } from 'mongodb';
import { config } from './config.js';

const client = new MongoClient(config.mongoUri);
let db;

export async function connectDb() {
  await client.connect();
  db = client.db(config.mongoDb);
}

export const articles = () => db.collection('articles');
export const clusters = () => db.collection('clusters');
