import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';

dotenv.config();
const app = express();

// ⚠️ Pour production, remplacez '*' par votre domaine Vercel
app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => res.send('BTT API fonctionne'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Serveur sur le port ${PORT}`));