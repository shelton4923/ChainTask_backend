// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

/**
 * ENV REQUIRED:
 * PORT=5001
 * MONGO_URI=mongodb+srv://...
 * JWT_SECRET=some_long_secret
 * BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
 * CONTRACT_ADDRESS=0xYourDeployedAddress
 */

const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// ====== KEEP ABI CONSISTENT WITH YOUR DEPLOYED CONTRACT ======
const CONTRACT_ABI = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
  {
    "anonymous": false, "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "content", "type": "string" },
      { "indexed": false, "internalType": "bool", "name": "completed", "type": "bool" },
      { "indexed": false, "internalType": "address", "name": "owner", "type": "address" }
    ], "name": "TaskCreated", "type": "event"
  },
  {
    "anonymous": false, "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "bool", "name": "completed", "type": "bool" }
    ], "name": "TaskCompleted", "type": "event"
  },
  {
    "anonymous": false, "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "owner", "type": "address" }
    ], "name": "TaskDeleted", "type": "event"
  },
  {
    "anonymous": false, "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "content", "type": "string" },
      { "indexed": false, "internalType": "address", "name": "owner", "type": "address" }
    ], "name": "TaskEdited", "type": "event"
  },
  {
    "anonymous": false, "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" }
    ], "name": "TaskTransferred", "type": "event"
  },
  { "inputs": [{ "internalType": "string", "name": "_content", "type": "string" }], "name": "createTask", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }], "name": "deleteTask", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }, { "internalType": "string", "name": "_content", "type": "string" }], "name": "editTask", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "taskCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "tasks", "outputs": [
      { "internalType": "uint256", "name": "id", "type": "uint256" },
      { "internalType": "string", "name": "content", "type": "string" },
      { "internalType": "bool", "name": "completed", "type": "bool" },
      { "internalType": "address", "name": "owner", "type": "address" }
    ], "stateMutability": "view", "type": "function"
  },
  { "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }], "name": "toggleCompleted", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }, { "internalType": "address", "name": "_newOwner", "type": "address" }], "name": "transferTask", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

if (!JWT_SECRET) throw new Error("❌ JWT_SECRET not set");
if (!MONGO_URI) throw new Error("❌ MONGO_URI not set");
if (!CONTRACT_ADDRESS) console.warn("⚠️ CONTRACT_ADDRESS not set (set in .env)");

// ====== DB & MODELS ======
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email:    { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  walletAddress: { type: String, default: '' }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
  taskId: { type: Number, required: true },
  content: { type: String, default: '' },
  completed: { type: Boolean, default: false },
  owner: { type: String, required: true, lowercase: true },

  // OFF-CHAIN METADATA
  dueDate: { type: Date, default: null },
  status: { type: String, enum: ['Pending', 'Completed', 'On Hold', 'Postponed'], default: 'Pending' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  tags: { type: [String], default: [] }
}, { timestamps: true });

TaskSchema.index({ owner: 1, taskId: 1 }, { unique: true });
const TaskModel = mongoose.model('Task', TaskSchema);

// ====== APP, SERVER, IO ======
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST", "PATCH"] }
});

app.use(cors());
app.use(express.json());

// ====== AUTH MIDDLEWARE ======
const auth = async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user; // { id: ... }
    next();
  } catch (e) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// ====== SOCKET.IO ======
io.on('connection', (socket) => {
  console.log(`⚡ User connected with socket ID: ${socket.id}`);

  socket.on('join_room', (walletAddress) => {
    if (walletAddress) {
      console.log(`Socket ${socket.id} joining room: ${walletAddress.toLowerCase()}`);
      socket.join(walletAddress.toLowerCase());
    }
  });

  socket.on('disconnect', () => {
    console.log(`⚡ User disconnected: ${socket.id}`);
  });
});

const emitUpdate = (ownerAddress) => {
  if (!ownerAddress) return;
  const room = ownerAddress.toLowerCase();
  console.log(`📣 Emitting 'tasks_updated' to room: ${room}`);
  io.to(room).emit('tasks_updated');
};

// ====== CONTRACT EVENT LISTENERS ======
function setupEventListeners() {
  try {
    const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    console.log(`🎧 Listening to contract events at: ${CONTRACT_ADDRESS}`);

    contract.removeAllListeners();

    contract.on('TaskCreated', async (id, content, completed, owner) => {
      try {
        const ownerAddress = owner.toLowerCase();
        const taskId = Number(id);
        console.log(`🟢 TaskCreated -> id:${taskId} owner:${ownerAddress}`);
        // Upsert task; metadata remains if previously edited off-chain
        await TaskModel.findOneAndUpdate(
          { owner: ownerAddress, taskId },
          { content, completed, owner: ownerAddress, $setOnInsert: { status: 'Pending', priority: 'Medium' } },
          { upsert: true, new: true }
        );
        emitUpdate(ownerAddress);
      } catch (err) { console.error('TaskCreated handler error:', err); }
    });

    contract.on('TaskCompleted', async (id, completed) => {
      try {
        const taskId = Number(id);
        const task = await TaskModel.findOne({ taskId });
        if (task) {
          task.completed = completed;
          if (completed) task.status = 'Completed';
          await task.save();
          emitUpdate(task.owner);
        }
      } catch (err) { console.error('TaskCompleted handler error:', err); }
    });

    contract.on('TaskEdited', async (id, content, owner) => {
      try {
        const ownerAddress = owner.toLowerCase();
        const taskId = Number(id);
        console.log(`✏️ TaskEdited -> id:${taskId} owner:${ownerAddress}`);
        await TaskModel.findOneAndUpdate(
          { owner: ownerAddress, taskId },
          { content },
          { new: true }
        );
        emitUpdate(ownerAddress);
      } catch (err) { console.error('TaskEdited handler error:', err); }
    });

    contract.on('TaskDeleted', async (id, owner) => {
      try {
        const ownerAddress = owner.toLowerCase();
        const taskId = Number(id);
        console.log(`🗑 TaskDeleted -> id:${taskId} owner:${ownerAddress}`);
        await TaskModel.deleteOne({ owner: ownerAddress, taskId });
        emitUpdate(ownerAddress);
      } catch (err) { console.error('TaskDeleted handler error:', err); }
    });

  } catch (error) {
    console.error("Error setting up event listeners:", error.message);
  }
}

// ====== AUTH ROUTES ======
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  try {
    if (!username || !email || !password || !confirmPassword)
      return res.status(400).json({ msg: 'All fields are required' });
    if (password.length < 6)
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    if (password !== confirmPassword)
      return res.status(400).json({ msg: 'Passwords do not match' });

    const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (exists) return res.status(400).json({ msg: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = new User({ username, email: email.toLowerCase(), password: hashed });
    await user.save();

    res.json({ msg: 'Registration successful' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ msg: 'Invalid credentials' });

    const payload = { user: { id: user._id } };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });

    res.json({ token, username: user.username, walletAddress: user.walletAddress || '' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Link wallet to user (after MetaMask connect)
app.post('/api/user/link-wallet', auth, async (req, res) => {
  const { walletAddress } = req.body;
  try {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ msg: 'Invalid wallet address' });
    }
    const user = await User.findByIdAndUpdate(req.user.id, { walletAddress }, { new: true });
    res.json({ msg: 'Wallet linked', walletAddress: user.walletAddress });
  } catch (err) {
    console.error('Link wallet error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get tasks for logged-in user
app.get('/api/tasks', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.walletAddress) return res.json([]);
    const owner = user.walletAddress.toLowerCase();
    const tasks = await TaskModel.find({ owner }).sort({ taskId: 1 });
    res.json(tasks);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Update off-chain metadata (dueDate, status, priority, tags)
app.patch('/api/tasks/:taskId/metadata', auth, async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    const { dueDate, status, priority, tags } = req.body;

    const user = await User.findById(req.user.id);
    if (!user || !user.walletAddress) return res.status(400).json({ msg: 'Link a wallet first' });

    const owner = user.walletAddress.toLowerCase();

    const allowedStatus = ['Pending', 'Completed', 'On Hold', 'Postponed'];
    const allowedPriority = ['Low', 'Medium', 'High'];

    const update = {};
    if (dueDate !== undefined) update.dueDate = dueDate ? new Date(dueDate) : null;
    if (status !== undefined) {
      if (!allowedStatus.includes(status)) return res.status(400).json({ msg: 'Invalid status' });
      update.status = status;
    }
    if (priority !== undefined) {
      if (!allowedPriority.includes(priority)) return res.status(400).json({ msg: 'Invalid priority' });
      update.priority = priority;
    }
    if (tags !== undefined) {
      if (!Array.isArray(tags)) return res.status(400).json({ msg: 'Tags must be an array' });
      update.tags = tags.map(String);
    }

    const doc = await TaskModel.findOneAndUpdate(
      { owner, taskId },
      update,
      { new: true }
    );

    if (!doc) return res.status(404).json({ msg: 'Task not found' });

    emitUpdate(owner);
    res.json(doc);
  } catch (err) {
    console.error('Patch metadata error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ====== START ======
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  setupEventListeners();
});
