require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5003;

app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const crudRoutes = require('./routes/crud');

app.use('/api/auth', authRoutes);
app.use('/api', crudRoutes);

app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the Core Backend API' });
});

app.listen(PORT, () => {
    console.log(`Core backend is running on port ${PORT}`);
});
