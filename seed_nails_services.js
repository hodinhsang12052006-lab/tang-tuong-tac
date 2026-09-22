const mongoose = require('mongoose');
const { Service } = require('./models');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bitpawnetwork';

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        const raw = fs.readFileSync(path.join(__dirname, 'services_config.json'), 'utf8');
        const list = JSON.parse(raw);
        
        let inserted = 0;
        for (const item of list) {
            item.providerUrl = item.providerUrl || 'https://subvip247.com/api/v2';
            const sid = item.serviceId.toString();
            const exists = await Service.findOne({ serviceId: sid });
            if (!exists) {
                await Service.create(item);
                console.log(`Inserted service: ${item.name} (#${sid})`);
                inserted++;
            } else {
                // Update to make sure category and name are updated
                exists.name = item.name;
                exists.category = item.category;
                exists.sellingPrice = item.sellingPrice;
                exists.originalPrice = item.originalPrice;
                await exists.save();
            }
        }
        console.log(`Seeding complete. Inserted ${inserted} new services.`);
        process.exit(0);
    } catch (e) {
        console.error('Error seeding:', e);
        process.exit(1);
    }
}

seed();
