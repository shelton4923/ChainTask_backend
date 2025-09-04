const { ethers } = require('ethers');
const TaskModel = require('./models/Task');

// =================================================================
// IMPORTANT: UPDATE THESE VALUES
// =================================================================
const contractAddress = "PASTE_YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE";
const bscTestnetRpcUrl = "https://data-seed-prebsc-1-s1.binance.org:8545/";

// IMPORTANT: Paste your full ABI here from the artifacts file
// It is found in: ./blockchain/artifacts/contracts/TodoList.sol/TodoList.json
const contractABI = [
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
        "internalType": "bool",
        "name": "completed",
        "type": "bool"
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
        "internalType": "bool",
        "name": "completed",
        "type": "bool"
      }
    ],
    "name": "TaskCompleted",
    "type": "event"
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
        "internalType": "bool",
        "name": "completed",
        "type": "bool"
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
      }
    ],
    "name": "toggleCompleted",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];
// =================================================================


function setupEventListeners() {
    try {
        const provider = new ethers.JsonRpcProvider(bscTestnetRpcUrl);
        const contract = new ethers.Contract(contractAddress, contractABI, provider);

        console.log("Setting up event listeners for contract at:", contractAddress);

        contract.on('TaskCreated', async (id, content, completed, owner) => {
            const ownerAddress = owner.toLowerCase();
            const taskId = Number(id);
            console.log(`Event Received: Task Created - ID: ${taskId} by ${ownerAddress}`);
            
            await TaskModel.findOneAndUpdate(
                { owner: ownerAddress, taskId: taskId },
                { content, completed },
                { upsert: true, new: true }
            );
            console.log(`DB updated for new task: ${taskId}.`);
        });

        contract.on('TaskCompleted', async (id, completed) => {
            const taskId = Number(id);
            console.log(`Event Received: Task Completed - ID: ${taskId}, Status: ${completed}`);
            
            await TaskModel.findOneAndUpdate({ taskId: taskId }, { completed });
            console.log(`DB updated for completed task: ${taskId}.`);
        });

    } catch (error) {
        console.error("Error setting up event listeners:", error.message);
    }
}

// Export the function so server.js can use it
module.exports = { setupEventListeners };