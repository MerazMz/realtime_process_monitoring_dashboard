const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const os = require('os');
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

// API endpoint to get system information
app.get('/api/system-info', (req, res) => {
  try {
    const totalMemoryBytes = os.totalmem();
    const freeMemoryBytes = os.freemem();
    const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
    
    const totalMemoryMB = Math.round(totalMemoryBytes / (1024 * 1024));
    const freeMemoryMB = Math.round(freeMemoryBytes / (1024 * 1024));
    const usedMemoryMB = Math.round(usedMemoryBytes / (1024 * 1024));
    
    const cpuCount = os.cpus().length;
    
    res.json({
      totalMemoryMB,
      freeMemoryMB,
      usedMemoryMB,
      memoryUsagePercent: Math.round((usedMemoryBytes / totalMemoryBytes) * 100),
      cpuCount,
      platform: os.platform(),
      osType: os.type(),
      osRelease: os.release()
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ error: 'Failed to fetch system information' });
  }
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
    
    // Get CPU core count for more accurate percentage calculation
    const cpuCount = os.cpus().length;
    
    // Get system memory info for reference
    const totalMemoryBytes = os.totalmem();
    const freeMemoryBytes = os.freemem();
    const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
    
    // Calculate a scaling factor to adjust process memory values
    // This helps address the over-counting problem by scaling process memory to match actual system usage
    let totalReportedMemory = 0;
    for (const pid in usageData) {
      if (usageData[pid] && usageData[pid].memory) {
        totalReportedMemory += usageData[pid].memory;
      }
    }
    
    // If reported memory exceeds used memory, apply scaling
    const scalingFactor = totalReportedMemory > usedMemoryBytes && totalReportedMemory > 0 
      ? usedMemoryBytes / totalReportedMemory 
      : 1;
    
    // Combine process info with usage data
    const processesWithUsage = processes.map(proc => {
      const usage = usageData[proc.pid] || { cpu: 0, memory: 0 };
      
      // Adjust CPU usage to better match Task Manager
      // pidusage returns CPU percentage per core, so we need to normalize it
      let cpuValue = usage.cpu ? parseFloat(usage.cpu.toFixed(2)) : 0;
      
      // CPU usage should never exceed 100 * number of cores
      cpuValue = Math.min(cpuValue, 100 * cpuCount);
      
      // Adjust memory value with scaling factor to avoid over-reporting
      const adjustedMemory = usage.memory * scalingFactor;
      
      // Determine if process is a background process or application process
      // Background processes typically have no UI and run in the background
      // This is a simple heuristic - in a real system, you might have a more sophisticated way to determine this
      const isBackgroundProcess = 
        proc.name.toLowerCase().includes('svc') || 
        proc.name.toLowerCase().includes('service') ||
        proc.name.toLowerCase().includes('daemon') ||
        proc.name.toLowerCase().includes('agent') ||
        proc.name.toLowerCase().includes('helper') ||
        proc.name.toLowerCase().includes('system') ||
        proc.name.toLowerCase().startsWith('com.') ||
        !proc.name.endsWith('.exe'); // On Windows, many user applications end with .exe
      
      return {
        pid: proc.pid,
        name: proc.name,
        cpu: cpuValue,
        memory: adjustedMemory ? Math.round(adjustedMemory / (1024 * 1024)) : 0, // Convert to MB
        ppid: proc.ppid,
        isBackgroundProcess: isBackgroundProcess
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