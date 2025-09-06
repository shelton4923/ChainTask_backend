// =======================================================================
// ||                   CHAIN-TASK FINAL BACKEND SERVER                   ||
// =======================================================================

// --- 1. IMPORTS & INITIALIZATION ---
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const webpush = require('web-push');
const { ethers } = require('ethers');
require('dotenv').config();

// --- 2. SMART CONTRACT ABI ---
// CRITICAL: Replace the contents of this array with the ABI from your
// Hardhat project's artifacts/contracts/ChainTask.sol/ChainTask.json file.
const contractABI = [
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "user",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "taskId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "title",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "dueDate",
          "type": "uint256"
        }
      ],
      "name": "TaskCreated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "user",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "taskId",
          "type": "uint256"
        }
      ],
      "name": "TaskDeleted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "user",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "taskId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "isDone",
          "type": "bool"
        }
      ],
      "name": "TaskToggled",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "_title",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "_description",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "_priority",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_dueDate",
          "type": "uint256"
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
          "name": "_taskId",
          "type": "uint256"
        }
      ],
      "name": "deleteTask",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getTasks",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "id",
              "type": "uint256"
            },
            {
              "internalType": "string",
              "name": "title",
              "type": "string"
            },
            {
              "internalType": "string",
              "name": "description",
              "type": "string"
            },
            {
              "internalType": "uint256",
              "name": "priority",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "dueDate",
              "type": "uint256"
            },
            {
              "internalType": "bool",
              "name": "isDone",
              "type": "bool"
            }
          ],
          "internalType": "struct ChainTask.Task[]",
          "name": "",
          "type": "tuple[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        },
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
          "name": "title",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "description",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "priority",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "dueDate",
          "type": "uint256"
        },
        {
          "internalType": "bool",
          "name": "isDone",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_taskId",
          "type": "uint256"
        }
      ],
      "name": "toggleTaskStatus",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];

// --- 3. SERVER & APP SETUP ---
const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] }
});

// --- 4. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected...'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// --- 5. MONGOOSE MODEL DEFINITIONS ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  walletAddress: { type: String, unique: true, sparse: true },
  preferences: { theme: { type: String, default: 'light' } },
  pushSubscription: { type: Object }
});
const User = mongoose.model('User', UserSchema);

const TaskScheduleSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    taskId: { type: Number, required: true },
    taskTitle: { type: String, required: true },
    dueDate: { type: Date, required: true },
    notified: { type: Boolean, default: false }
});
const TaskSchedule = mongoose.model('TaskSchedule', TaskScheduleSchema);

// --- 6. AUTHENTICATION MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// --- 7. API ENDPOINTS ---
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'User with this email already exists' });
        
        user = new User({ username, email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        res.status(201).json({ msg: 'User registered successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
        
        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, username: user.username });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.get('/api/preferences', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json(user.preferences);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

app.put('/api/preferences', authMiddleware, async (req, res) => {
    const { theme } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });
        if (theme) user.preferences.theme = theme;
        await user.save();
        res.json(user.preferences);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

app.post('/api/subscribe', authMiddleware, async (req, res) => {
    const subscription = req.body;
    try {
        await User.findByIdAndUpdate(req.user.id, { pushSubscription: subscription });
        res.status(201).json({ msg: 'Subscription saved.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

app.post('/api/link-wallet', authMiddleware, async (req, res) => {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.status(400).json({ msg: 'Wallet address is required.' });
    try {
        await User.findByIdAndUpdate(req.user.id, { walletAddress: walletAddress });
        console.log(`User ${req.user.id} linked wallet ${walletAddress}`);
        res.status(200).json({ msg: 'Wallet linked successfully.' });
    } catch (err) {
        console.error("Error linking wallet:", err.message);
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'This wallet address is already linked to another account.' });
        }
        res.status(500).send('Server Error');
    }
});

// --- 8. REAL-TIME WEBSOCKET LOGIC ---
io.on('connection', (socket) => {
  console.log('A user connected via WebSocket');
  socket.on('task updated', () => io.emit('tasks changed'));
  socket.on('disconnect', () => console.log('User disconnected from WebSocket'));
});

// --- 9. PUSH NOTIFICATION & CRON JOB ---
webpush.setVapidDetails(
  'mailto:contact@chaintask.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

cron.schedule('* * * * *', async () => {
    console.log(`[${new Date().toLocaleTimeString()}] Cron job: Checking for task deadlines...`);
    try {
        const now = new Date();
        const upcomingTasks = await TaskSchedule.find({
            dueDate: { $lte: new Date(now.getTime() + 5 * 60 * 1000) },
            notified: false
        }).populate('user');

        for (const task of upcomingTasks) {
            if (task.user && task.user.pushSubscription) {
                const payload = JSON.stringify({
                    title: 'ChainTask Deadline Reminder!',
                    body: `Your task "${task.taskTitle}" is due soon.`,
                });
                console.log(`Sending notification for task "${task.taskTitle}" to user ${task.user.username}`);
                await webpush.sendNotification(task.user.pushSubscription, payload);
                task.notified = true;
                await task.save();
            }
        }
    } catch (error) {
        console.error('Error in cron job:', error);
    }
});

// --- 10. SMART CONTRACT EVENT LISTENER ---
const setupEventListener = () => {
    try {
        console.log(`Attempting to connect to WebSocket at: ${process.env.BSC_TESTNET_WSS_URL}`);
        const provider = new ethers.WebSocketProvider(process.env.BSC_TESTNET_WSS_URL);
        const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, provider);

        console.log("Setting up blockchain event listener...");

        contract.on("TaskCreated", async (userAddress, taskId, title, dueDateFromEvent) => {
            console.log(`Caught TaskCreated Event: User ${userAddress}, TaskID ${Number(taskId)}, Title "${title}"`);
            try {
                const user = await User.findOne({ walletAddress: userAddress });
                if (!user) {
                    console.log(`Event caught but wallet ${userAddress} is not linked to any user.`);
                    return;
                }
                const dueDate = new Date(Number(dueDateFromEvent) * 1000);
                await TaskSchedule.create({
                    user: user._id,
                    taskId: Number(taskId),
                    taskTitle: title,
                    dueDate: dueDate
                });
                console.log(`Successfully created notification schedule for task "${title}".`);
            } catch (error) {
                console.error("Error processing TaskCreated event:", error);
            }
        });

        contract.on("TaskDeleted", async (userAddress, taskId) => {
            const taskIdNumber = Number(taskId);
            console.log(`Caught TaskDeleted Event: User ${userAddress}, TaskID ${taskIdNumber}`);
            try {
                const user = await User.findOne({ walletAddress: userAddress });
                if (!user) return;
                const result = await TaskSchedule.deleteOne({ user: user._id, taskId: taskIdNumber });
                if (result.deletedCount > 0) {
                    console.log(`Successfully deleted notification schedule for task ID ${taskIdNumber}.`);
                }
            } catch (error) {
                console.error("Error processing TaskDeleted event:", error);
            }
        });

        provider.on("error", (error) => {
            console.error("WSS Provider Error:", error);
        });

        console.log("Event listener is running.");
    } catch (error) {
        console.error("Failed to setup event listener:", error);
    }
};

// --- 11. START THE SERVER ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is live and running on port ${PORT}`);
    setupEventListener(); 
});