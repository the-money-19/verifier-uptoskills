const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const port = 3000;

// Ensure uploads folder exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: 'uptoskills-tl-secret',
    resave: false,
    saveUninitialized: true
}));

// In-memory Database
let events = []; 
let activeEvent = null;

//const upload = multer({ dest: 'uploads/' });
const upload = multer({ dest: '/tmp' });

// --- ROUTES ---

// 1. User Homepage
app.get('/', (req, res) => {
    res.render('index', { event: activeEvent, message: req.query.msg || null });
});

// 2. Admin Login
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if ((username === 'harshal' || username === 'kshitij'|| username === 'sudhamrutha' || username === 'srisathya' || username === 'emesh') && password === '0000') {
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
    const newEvent = {
        id: Date.now(),
        title: req.body.title,
        description: req.body.description,
        imagePath: req.file.path,
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
    
    try {
        const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng');
        const cleanText = text.toLowerCase();

        // Check for keyword 'uptoskills' in the screenshot
        if (cleanText.includes('uptoskills')) {
            activeEvent.interactors.push({
                name: req.body.internName,
                time: new Date().toLocaleString()
            });
            fs.unlinkSync(req.file.path);
            res.redirect('/?msg=✅ Verified! Name added to list.');
        } else {
            fs.unlinkSync(req.file.path);
            res.redirect('/?msg=❌ Verification Failed: "uptoskills" not detected.');
        }
    } catch (err) {
        res.redirect('/?msg=Error scanning image');
    }
});

const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng', {
    workerPath: 'https://unpkg.com/tesseract.js@v5.0.0/dist/worker.min.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    corePath: 'https://unpkg.com/tesseract.js-core@v5.0.0/tesseract-core.wasm.js',
});

app.listen(port, () => console.log(`🚀 Server: http://localhost:${port}`));