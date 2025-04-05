const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
// ps-list v8+ is ESM only, so we need to import it dynamically
let psList;
(async () => {
  const module = await import('ps-list');
  psList = module.default;
})();
const pidusage = require('pidusage');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get all processes
app.get('/api/processes', async (req, res) => {
  try {
    const processes = await getProcessesWithUsage();
    res.json(processes);
  } catch (error) {
    console.error('Error fetching processes:', error);
    res.status(500).json({ error: 'Failed to fetch processes' });
  }
});

// API endpoint to kill a process
app.post('/api/kill-process', async (req, res) => {
  const { pid } = req.body;
  
  if (!pid) {
    return res.status(400).json({ error: 'Process ID is required' });
  }
  
  try {
    process.kill(pid);
    res.json({ success: true, message: `Process ${pid} has been terminated` });
  } catch (error) {
    console.error(`Error killing process ${pid}:`, error);
    res.status(500).json({ error: `Failed to kill process ${pid}` });
  }
});

// Function to get processes with usage data
async function getProcessesWithUsage() {
  try {
    const processes = await psList();
    
    // Get usage data for all processes
    const pids = processes.map(proc => proc.pid);
    const usageData = await pidusage(pids);
    
    // Combine process info with usage data
    const processesWithUsage = processes.map(proc => {
      const usage = usageData[proc.pid] || { cpu: 0, memory: 0 };
      return {
        pid: proc.pid,
        name: proc.name,
        cpu: usage.cpu ? parseFloat(usage.cpu.toFixed(2)) : 0,
        memory: usage.memory ? Math.round(usage.memory / (1024 * 1024)) : 0, // Convert to MB
        ppid: proc.ppid
      };
    });
    
    return processesWithUsage;
  } catch (error) {
    console.error('Error in getProcessesWithUsage:', error);
    throw error;
  }
}

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Send initial process data
  getProcessesWithUsage().then(processes => {
    socket.emit('processData', processes);
  }).catch(error => {
    console.error('Error sending initial process data:', error);
  });
  
  // Set up interval to send process data every 5 seconds (increased from 3 seconds to reduce frequent refreshing)
  const interval = setInterval(async () => {
    try {
      const processes = await getProcessesWithUsage();
      socket.emit('processData', processes);
    } catch (error) {
      console.error('Error sending process data:', error);
    }
  }, 5000);
  
  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
  
  // Handle kill process request
  socket.on('killProcess', async (pid) => {
    try {
      process.kill(pid);
      socket.emit('processKilled', { success: true, pid });
      
      // Send updated process list
      const processes = await getProcessesWithUsage();
      socket.emit('processData', processes);
    } catch (error) {
      console.error(`Error killing process ${pid}:`, error);
      socket.emit('processKilled', { success: false, pid, error: error.message });
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});