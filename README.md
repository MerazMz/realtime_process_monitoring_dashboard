# Real-Time Process Monitor

A real-time process monitoring system built with Node.js, Express, and Socket.IO that allows you to monitor and manage system processes through a web interface.

## Features

- Real-time process monitoring with live updates
- View detailed process information including:
  - Process ID (PID)
  - Process Name
  - CPU Usage
  - Memory Usage
  - Parent Process ID (PPID)
- Kill processes directly from the web interface
- Automatic refresh of process data every 5 seconds
- Modern and responsive web interface

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd os_realtime_proces
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

1. Start the server:
```bash
node server.js
```

2. Open your web browser and navigate to:
```
http://localhost:3000
```

## API Endpoints

- `GET /api/processes` - Get list of all running processes
- `POST /api/kill-process` - Kill a specific process by PID

## Socket.IO Events

- `processData` - Emitted when process data is updated
- `killProcess` - Triggered when a process needs to be killed
- `processKilled` - Emitted when a process has been killed

## Technologies Used

- Node.js
- Express.js
- Socket.IO
- ps-list (for process listing)
- pidusage (for process usage statistics)

## Security Considerations

- The application uses CORS with wildcard origin (`*`) for development purposes. In production, you should restrict this to specific domains.
- Process termination requires appropriate system permissions.

## License

[Add your license information here]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 