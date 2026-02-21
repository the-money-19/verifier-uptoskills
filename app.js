const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
// Use Vercel's dynamic port or 3000 for local
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

// Serve static files correctly on Vercel
app.use('/uploads', express.static('/tmp')); 

app.use(session({
    secret: 'uptoskills-tl-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS, but false is fine for now
}));

// In-memory Database (Warning: Resets when Vercel goes idle)
let events = []; 
let activeEvent = null;

// Vercel only allows writing to /tmp
const upload = multer({ dest: '/tmp/' });

// --- ROUTES ---

// 1. User Homepage
app.get('/', (req, res) => {
    res.render('index', { event: activeEvent, message: req.query.msg || null });
});

// 2. Admin Login
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    // Your updated admin list
    const admins = ['harshal', 'kshitij', 'sudhamrutha', 'srisathya', 'emesh'];
    if (admins.includes(username) && password === '0000') {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
        res.render('login', { error: 'Invalid Credentials' });
    }
});

// 3. Admin Dashboard
app.get('/admin', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/login');
    res.render('admin');
});

// Create Event
app.post('/create-event', upload.single('eventImage'), (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/login');
    if (!req.file) return res.redirect('/admin?msg=Upload failed');

    const newEvent = {
        id: Date.now(),
        title: req.body.title,
        description: req.body.description,
        imagePath: req.file.path, // This is now in /tmp/
        interactors: [] 
    };
    events.push(newEvent);
    activeEvent = newEvent;
    res.redirect('/admin');
});

// Past Events
app.get('/past-events', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/login');
    res.render('past-events', { events });
});

// Delete Event
app.get('/delete-event/:id', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/login');
    events = events.filter(e => e.id != req.params.id);
    if (activeEvent && activeEvent.id == req.params.id) activeEvent = null;
    res.redirect('/past-events');
});

// 4. Verification Logic
app.post('/verify', upload.single('screenshot'), async (req, res) => {
    if (!activeEvent) return res.redirect('/?msg=No active event');
    if (!req.file) return res.redirect('/?msg=Please upload a screenshot');
    
    try {
        // Vercel Optimized Tesseract Call
        const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng', {
            workerPath: 'https://unpkg.com/tesseract.js@v5.0.0/dist/worker.min.js',
            langPath: 'https://tessdata.projectnaptha.com/4.0.0',
            corePath: 'https://unpkg.com/tesseract.js-core@v5.0.0/tesseract-core.wasm.js',
            cachePath: '/tmp/tessdata'
        });

        const cleanText = text.toLowerCase();

        if (cleanText.includes('uptoskills')) {
            activeEvent.interactors.push({
                name: req.body.internName,
                time: new Date().toLocaleString()
            });
            res.redirect('/?msg=✅ Verified! Name added to list.');
        } else {
            res.redirect('/?msg=❌ Verification Failed: "uptoskills" not detected.');
        }
    } catch (err) {
        console.error("OCR Error:", err);
        res.redirect('/?msg=Error scanning image');
    } finally {
        // Always try to delete the temp file
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
    }
});

// For Vercel, we export the app
module.exports = app;

// Only listen if running locally
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`🚀 Local Server: http://localhost:${port}`));
}