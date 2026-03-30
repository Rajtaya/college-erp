const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app  = express();
const isProd = process.env.NODE_ENV === 'production';

// ── Trust proxy ──────────────────────────────────────────────────────────────
// Set to the exact number of trusted proxies in front of this server.
// '1' = one reverse proxy (Railway / Render / Nginx). Change to 0 for direct.
app.set('trust proxy', isProd ? 1 : false);

// ── Security headers (Helmet) ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      // This is a pure API — block all resource loads from any HTML error pages
    },
  },
  crossOriginEmbedderPolicy: false, // not needed for API
}));

// ── CORS — environment-aware whitelist ───────────────────────────────────────
const prodOrigins = [
  'https://amazing-wisp-16aa99.netlify.app',
  'https://college-erp-frontend-production.up.railway.app',
];
const devOrigins  = ['http://localhost:3001', 'http://localhost:5173'];

app.use(cors({
  origin: isProd ? prodOrigins : [...prodOrigins, ...devOrigins],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' })); // reduced from 5mb; Excel imports are small

// ── Rate limiters ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Global limiter — 120 req/min per IP for all authenticated API calls
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.includes('/login'), // login has its own stricter limiter
});

app.use('/api/auth/student/login', loginLimiter);
app.use('/api/auth/teacher/login', loginLimiter);
app.use('/api/admin/login',        loginLimiter);
app.use('/api', globalLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/students',    require('./routes/students'));
app.use('/api/attendance',  require('./routes/attendance'));
app.use('/api/fees',        require('./routes/fees'));
app.use('/api/subjects',    require('./routes/subjects'));
app.use('/api/marks',       require('./routes/marks'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/levels',      require('./routes/levels'));
app.use('/api/programmes',  require('./routes/programmes'));
app.use('/api/faculties',   require('./routes/faculties'));
app.use('/api/enrollment',  require('./routes/enrollment'));
app.use('/api/disciplines', require('./routes/disciplines'));
app.use('/api/departments', require('./routes/departments'));

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Log structured error — never expose stack in response
  console.error(JSON.stringify({
    level: 'error',
    path: req.path,
    method: req.method,
    message: err.message,
    // stack only in dev
    ...(isProd ? {} : { stack: err.stack }),
  }));
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(JSON.stringify({
    level: 'info',
    message: `Server running on port ${process.env.PORT || 3000}`,
    env: process.env.NODE_ENV || 'development',
  }));
});
