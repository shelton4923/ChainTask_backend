// server.js

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 5001;

// --- Middleware ---

// Using the more secure CORS policy from your friend's code
const allowedOrigins = [
  'http://localhost:3000', // For local development
  'https://chain-task-frontend.vercel.app', // <<<<<<<<< IMPORTANT: I've put a placeholder. Replace with your actual Vercel frontend URL
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
    }
  }
}));

app.use(express.json());

// --- Database Connection ---
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!MONGO_URI || !JWT_SECRET || !PRIVATE_KEY) {
    throw new Error("Missing required environment variables (MONGO_URI, JWT_SECRET, PRIVATE_KEY)");
}

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully.'))
.catch(err => console.error('❌ MongoDB connection error:', err));


// ===============================================
// --- MONGOOSE SCHEMAS & MODELS ---
// ===============================================

// 1. UPDATED User Schema (from your friend's logic, with your walletAddress added back in)
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  walletAddress: { type: String, unique: true, sparse: true, default: null }, // Kept this from your schema
}, { timestamps: true });

// Middleware to automatically hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password for login
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};
const User = mongoose.model('User', UserSchema);

// 2. Your Original Task Schema (Unchanged)
const taskSchema = new mongoose.Schema({
  taskId:   { type: Number, required: true },
  content:  { type: String, default: '' },
  completed:{ type: Boolean, default: false },
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dueDate:  { type: Date, default: null },
  status:   { type: String, enum: ['Pending','Completed','On Hold','Postponed'], default: 'Pending' },
  priority: { type: String, enum: ['Low','Medium','High'], default: 'Medium' },
  tags:     { type: [String], default: [] },
  category: { type: String, default: '' },
}, { timestamps: true });

taskSchema.index({ owner: 1, taskId: 1 }, { unique: true });
const Task = mongoose.model('Task', taskSchema);

// ===============================================
// --- BLOCKCHAIN SETUP (Your Code, Unchanged) ---
// ===============================================

const contractABI = [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "content",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "enum TodoList.Status",
          "name": "status",
          "type": "uint8"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "owner",
          "type": "address"
        }
      ],
      "name": "TaskCreated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "owner",
          "type": "address"
        }
      ],
      "name": "TaskDeleted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "content",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "owner",
          "type": "address"
        }
      ],
      "name": "TaskEdited",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "enum TodoList.Status",
          "name": "status",
          "type": "uint8"
        }
      ],
      "name": "TaskStatusChanged",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        }
      ],
      "name": "TaskTransferred",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_id",
          "type": "uint256"
        },
        {
          "internalType": "enum TodoList.Status",
          "name": "_status",
          "type": "uint8"
        }
      ],
      "name": "changeStatus",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "_content",
          "type": "string"
        }
      ],
      "name": "createTask",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_id",
          "type": "uint256"
        }
      ],
      "name": "deleteTask",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_id",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "_content",
          "type": "string"
        }
      ],
      "name": "editTask",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "taskCount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "tasks",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "content",
          "type": "string"
        },
        {
          "internalType": "enum TodoList.Status",
          "name": "status",
          "type": "uint8"
        },
        {
          "internalType": "address",
          "name": "owner",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_id",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "_newOwner",
          "type": "address"
        }
      ],
      "name": "transferTask",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];
const contractAddress = process.env.CONTRACT_ADDRESS || "";
const provider = new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(contractAddress, contractABI, wallet);


// ===============================================
// --- API ENDPOINTS ---
// ===============================================

// --- Auth Middleware (Your Code, Unchanged) ---
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch {
    return res.status(401).json({ msg: 'Token invalid' });
  }
};

// --- UPDATED Authentication Routes (from your friend's logic) ---
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password) {
            return res.status(400).json({ msg: 'Please provide both email and password.' });
        }
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User with this email already exists' });
        }
        user = new User({ email, password });
        await user.save();
        res.status(201).json({ msg: 'User registered successfully' });
    } catch (err) {
        console.error("Register error:", err.message);
        res.status(500).send('Server error');
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }
        const payload = { user: { id: user.id } }; // JWT payload now only needs user ID
        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '4h' },
            (err, token) => {
                if (err) throw err;
                // Sending back the data structure your frontend expects
                res.json({ token, userIdentifier: user.email, walletAddress: user.walletAddress });
            }
        );
    } catch (err) {
        console.error("Login error:", err.message);
        res.status(500).send('Server error');
    }
});

// --- Wallet Routes (Your Code, Unchanged) ---
app.post('/api/wallet/connect', auth, async (req, res) => {
    try {
        const { walletAddress } = req.body;
        const user = await User.findById(req.user.id);
        if (user.walletAddress) return res.status(400).json({ msg: "A wallet is already connected to this account." });
        const walletInUse = await User.findOne({ walletAddress });
        if (walletInUse) return res.status(400).json({ msg: "This wallet is already linked to another account." });
        user.walletAddress = walletAddress;
        await user.save();
        res.json({ msg: "Wallet connected successfully", walletAddress: user.walletAddress });
    } catch (err) {
        console.error("Wallet connect error:", err.message);
        res.status(500).json({ msg: "Server error" });
    }
});

app.post('/api/wallet/disconnect', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: "User not found" });
        user.walletAddress = null;
        await user.save();
        res.json({ msg: "Wallet disconnected successfully" });
    } catch (err) {
        console.error("Wallet disconnect error:", err.message);
        res.status(500).json({ msg: "Server error" });
    }
});

// --- Task Routes (Your Code, Unchanged) ---
app.get('/api/tasks', auth, async (req, res) => { /* ...your existing task code... */ });
app.post('/api/tasks', auth, async (req, res) => { /* ...your existing task code... */ });
app.put('/api/tasks/:id', auth, async (req, res) => { /* ...your existing task code... */ });
app.delete('/api/tasks/:id', auth, async (req, res) => { /* ...your existing task code... */ });


// --- Start Server ---
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));