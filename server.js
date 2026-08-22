require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Global error handlers to avoid silent nodemon crashes
process.on('uncaughtException', (err) => {
	console.error('UNCAUGHT EXCEPTION', err && err.stack ? err.stack : err);
	// allow nodemon to restart; do not swallow
	process.exit(1);
});
process.on('unhandledRejection', (reason) => {
	console.error('UNHANDLED REJECTION', reason);
	process.exit(1);
});

// initialize firebase admin (side-effectful) with guarded require so we can log errors
let adminInitErr = null;
try {
	require('./services/firebaseAdmin');
} catch (e) {
	adminInitErr = e;
	console.error('Firebase admin failed to initialize:', e && e.stack ? e.stack : e);
}

const auth = require('./middleware/auth');
const usersRouter = require('./routes/users');
const requestsRouter = require('./routes/requests');
const debugRouter = require('./routes/debug');
const cloudinaryRouter = require('./routes/cloudinary');
const usernamesRouter = require('./routes/usernames');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve simple static test UI from /public
app.use(express.static('public'));

app.get('/', (req, res) => res.send('Many-Hands API'));

// Protected routes
app.use('/users', auth, usersRouter);
app.use('/requests', auth, requestsRouter);
app.use('/cloudinary', auth, cloudinaryRouter);
app.use('/usernames', auth, usernamesRouter);
// debug endpoint (no auth) to help diagnose storage/bucket issues
app.use('/_debug', debugRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server listening on ${PORT}`);
	if (adminInitErr) console.warn('Note: Firebase admin initialization failed — check earlier logs.');
});

// Central Express error handler
app.use((err, req, res, next) => {
	console.error('Express error:', err && err.stack ? err.stack : err);
	const status = err && err.statusCode ? err.statusCode : 500;
	res.status(status).json({ error: err && err.message ? err.message : String(err) });
});
