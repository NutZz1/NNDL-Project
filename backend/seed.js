const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Incident = require('./models/Incident');

dotenv.config();

const sampleIncidents = [
  {
    title: 'Plastic & Litter Accumulation Near East Playground',
    category: 'litter',
    domain: 'civic_waste',
    severity: 'Medium',
    status: 'Reported',
    location: { type: 'Point', coordinates: [76.906242, 10.904631] },
    address: 'Amrita Playground East Way, Ettimadai',
    ward: 'Amrita Campus - Ettimadai Ward',
    imageUrl: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=600&q=80',
    confidence: 0.94,
    daysUnresolved: 1,
    assignedTeam: 'Unassigned',
  },
  {
    title: 'Asphalt Pothole on Campus Main Entrance Road',
    category: 'pothole',
    domain: 'road_damage',
    severity: 'High',
    status: 'Assigned',
    location: { type: 'Point', coordinates: [76.8995, 10.9035] },
    address: 'Main Entrance Road, Amrita Vishwa Vidyapeetham',
    ward: 'Amrita Campus - Ettimadai Ward',
    imageUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80',
    confidence: 0.91,
    daysUnresolved: 3,
    assignedTeam: 'Ettimadai Road Crew Alpha',
  },
  {
    title: 'Damaged Utility Drain Cover Near Academic Block',
    category: 'manhole_damaged',
    domain: 'hazard',
    severity: 'Critical',
    status: 'Reported',
    location: { type: 'Point', coordinates: [76.9018, 10.9048] },
    address: 'Academic Block 2 Corridor, Amrita Campus',
    ward: 'Amrita Campus - Ettimadai Ward',
    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=600&q=80',
    confidence: 0.96,
    daysUnresolved: 5,
    assignedTeam: 'Unassigned',
  },
  {
    title: 'Alligator Fatigue Cracking Along Hostel Loop',
    category: 'crack_alligator',
    domain: 'road_damage',
    severity: 'Low',
    status: 'In Progress',
    location: { type: 'Point', coordinates: [76.9025, 10.9021] },
    address: 'Hostel Complex Ring Road, Ettimadai',
    ward: 'Amrita Campus - Ettimadai Ward',
    imageUrl: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=600&q=80',
    confidence: 0.89,
    daysUnresolved: 2,
    assignedTeam: 'Asphalt Patch Crew',
  },
  {
    title: 'Missing Storm Manhole Cover on Station Approach',
    category: 'manhole_missing',
    domain: 'hazard',
    severity: 'Critical',
    status: 'Reported',
    location: { type: 'Point', coordinates: [76.9010, 10.8990] },
    address: 'Ettimadai Railway Station Road',
    ward: 'Amrita Campus - Ettimadai Ward',
    imageUrl: 'https://images.unsplash.com/photo-1584467735815-f778f274e296?auto=format&fit=crop&w=600&q=80',
    confidence: 0.97,
    daysUnresolved: 4,
    assignedTeam: 'Unassigned',
  },
];

async function seedData() {
  try {
    const connUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/civicscan';
    await mongoose.connect(connUri);
    console.log('Connected to MongoDB Atlas. Re-seeding incidents for Amrita Vishwa Vidyapeetham, Ettimadai...');
    await Incident.deleteMany({});
    await Incident.insertMany(sampleIncidents);
    console.log(`Seeded ${sampleIncidents.length} incidents in Amrita Ettimadai region successfully!`);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
}

seedData();
