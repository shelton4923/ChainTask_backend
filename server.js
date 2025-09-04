require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');

// ===================================================================================
// ========================= DEPLOYMENT DIAGNOSTIC CHECK =============================
// This message MUST appear in your Render logs after you deploy.
// If it does not, Render is NOT running your new code.
console.log("--- ChainTask Backend DEPLOYMENT CHECK V4 :: The 'sparse: true' fix is in this file. ---");
// ===================================================================================
// ===================================================================================


const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!MONGO_URI) throw new Error("MONGO_URI not set in .env");
if (!JWT_SECRET) throw new Error("JWT_SECRET not set in .env");
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");

// -------------------- Mongoose --------------------
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error', err); process.exit(1); });

// This schema is 100% correct for fixing the duplicate key error.
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email:    { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  walletAddress: { type: String, unique: true, sparse: true, default: null }, // sparse: true is the crucial fix
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

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
taskSchema.index({ content: 'text', category: 'text', tags: 'text' });

const Task = mongoose.model('Task', taskSchema);

// -------------------- Blockchain --------------------
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

// -------------------- Middleware --------------------
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

// -------------------- Auth Routes --------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    if (!username || !email || !password || !confirmPassword)
      return res.status(400).json({ msg: 'Fill all fields' });
    if (password.length < 6) return res.status(400).json({ msg: 'Password too short' });
    if (password !== confirmPassword) return res.status(400).json({ msg: 'Passwords don\'t match' });

    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.status(400).json({ msg: 'User exists' });

    const hashed = await bcrypt.hash(password, 10);
    await new User({ username, email, password: hashed }).save();

    res.json({ msg: 'Registration successful' });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ msg: 'User not found' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ msg: 'Wrong password' });

    const payload = { user: { id: user._id } };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });
    res.json({ token, username: user.username, walletAddress: user.walletAddress });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// -------------------- Wallet Routes --------------------
app.post('/api/wallet/connect', auth, async (req, res) => {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress) {
            return res.status(400).json({ msg: "Wallet address is required" });
        }

        const user = await User.findById(req.user.id);
        if (user.walletAddress) {
            return res.status(400).json({ msg: "A wallet is already connected to this account." });
        }

        const walletInUse = await User.findOne({ walletAddress: walletAddress });
        if (walletInUse) {
            return res.status(400).json({ msg: "This wallet is already linked to another account." });
        }

        user.walletAddress = walletAddress;
        await user.save();
        res.json({ msg: "Wallet connected successfully", walletAddress: user.walletAddress });

    } catch (err)
 {
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


// -------------------- Task Routes --------------------
app.get('/api/tasks', auth, async (req, res) => {
  try {
    const { status, priority, tag, due, category, search } = req.query;
    const filter = { owner: req.user.id };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (tag) filter.tags = tag;
    if (category) filter.category = category;
    if (due) filter.dueDate = { $lte: new Date(due) };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { content: regex },
        { category: regex },
        { tags: { $elemMatch: { $regex: regex } } }
      ];
    }

    const tasks = await Task.find(filter).sort({ taskId: 1 });
    res.json(tasks);
  } catch (err) {
    console.error("Get tasks error:", err.message);
    res.status(500).json({ msg: "Server error fetching tasks" });
  }
});

app.post('/api/tasks', auth, async (req, res) => {
  try {
    const { taskId, content, dueDate, status, priority, tags, category } = req.body;

    if (!content) return res.status(400).json({ msg: "Task content is required" });

    const task = new Task({
      taskId: taskId || Date.now(),
      content,
      owner: req.user.id,
      dueDate: dueDate || null,
      status: status || "Pending",
      priority: priority || "Medium",
      tags: Array.isArray(tags) ? tags : [],
      category: category || ""
    });

    await task.save();
    res.json({ msg: "Task created successfully", task });
  } catch (err) {
    console.error("Create task error:", err.message);
    res.status(500).json({ msg: "Server error while creating task" });
  }
});

app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      req.body,
      { new: true }
    );
    res.json(task);
  } catch (err) {
    console.error("Update task error:", err.message);
    res.status(500).json({ msg: "Server error updating task" });
  }
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    await Task.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    console.error("Delete task error:", err.message);
    res.status(500).json({ msg: "Server error deleting task" });
  }
});

// -------------------- Start --------------------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));