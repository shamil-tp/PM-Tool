require('dotenv').config()
const express = require('express')
const connectDB = require('./config/db')
const calendarRoutes = require('./routes/calendarRoutes')
const licenseRoute = require('./routes/licenseRoute')

const app = express()
const PORT = process.env.PORT || 5000

const cors = require('cors');
app.use(cors());
app.use(express.json());

app.get('/',(req,res)=>{
    res.status(200).json({
        message:'welcome to pm-tool calendar server'
    })
})

app.use("/", licenseRoute)

app.get('/test',(req,res)=>{
    res.status(200).json({
        message:'test route success backend running successfully'
    })
})

app.use('/api/calendar', calendarRoutes);

// Fallback for Google OAuth if REDIRECT_URI is set to the root path without /api/calendar
const calendarController = require('./controller/calendarController');
app.get('/auth/google/callback', calendarController.googleAuthCallback);

if (require.main === module) {
    app.listen(PORT,async()=>{
        await connectDB()
        console.log("app is running on port", PORT)
    })
}

module.exports = app;