const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'uptoskills-tl-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// In-memory Database
let events = []; 
let activeEvent = null;

// Vercel only allows writing to /tmp
const upload = multer({ dest: '/tmp/' });

// --- ROUTES ---

app.get('/', (req, res) => {
    res.render('index', { event: activeEvent, message: req.query.msg || null });
});

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const admins = ['harshal', 'kshitij', 'sudhamrutha', 'srisathya', 'emesh'];
    if (admins.includes(username) && password === '0000') {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
        res.render('login', { error: 'Invalid Credentials' });
    }
});

app.get('/admin', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/login');
    res.render('admin');
});

app.post('/create-event', upload.single('eventImage'), (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/login');
    if (!req.file) return res.redirect('/admin?msg=Upload failed');

    try {
        // CONVERT IMAGE TO BASE64 FOR VERCEL COMPATIBILITY
        const imgBuffer = fs.readFileSync(req.file.path);
        const base64Image = imgBuffer.toString('base64');
        const mimeType = req.file.mimetype;

        activeEvent = {
            id: Date.now(),
            title: req.body.title,
            description: req.body.description,
            // Store the image data string directly
            imageData: `data:${mimeType};base64,${base64Image}`, 
            interactors: [] 
        };
        events.push(activeEvent);
        
        fs.unlinkSync(req.file.path); // Delete from /tmp
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?msg=Error processing image');
    }
});

app.get('/past-events', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/login');
    res.render('past-events', { events });
});

app.get('/delete-event/:id', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/login');
    events = events.filter(e => e.id != req.params.id);
    if (activeEvent && activeEvent.id == req.params.id) activeEvent = null;
    res.redirect('/past-events');
});

app.post('/verify', upload.single('screenshot'), async (req, res) => {
    if (!activeEvent) return res.redirect('/?msg=No active event');
    if (!req.file) return res.redirect('/?msg=Please upload a screenshot');
    
    // Initialize worker
    const worker = await Tesseract.createWorker('eng');

    try {
        // Set a 25-second limit for the actual OCR process
        const { data: { text } } = await worker.recognize(req.file.path);
        
        const cleanText = text.toLowerCase();
        console.log("Scanned:", cleanText);

        if (cleanText.includes('uptoskills')) {
            activeEvent.interactors.push({
                name: req.body.internName,
                time: new Date().toLocaleString()
            });
            // Terminate and redirect immediately
            await worker.terminate();
            return res.redirect('/?msg=✅ Verified Successfully!');
        } else {
            await worker.terminate();
            return res.redirect('/?msg=❌ Keyword "uptoskills" not found.');
        }

    } catch (err) {
        console.error("OCR Error:", err);
        // Ensure worker is killed even on error
        if (worker) await worker.terminate();
        return res.redirect('/?msg=Error: Image too complex or timeout. Try again.');
    } finally {
        // Clean up the file from /tmp
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
    }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`🚀 Local Server: http://localhost:${port}`));
}