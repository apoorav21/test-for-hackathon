# Sign Language Translation App

A real-time sign language translation application that uses TensorFlow.js for sign language recognition and translation.

## Features

- Real-time sign language translation
- Video stream processing
- TensorFlow.js model integration
- WebSocket communication for live translation
- Speech-to-text capabilities

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google Cloud credentials (for speech-to-text features)

## Installation

1. Clone the repository:
```bash
git clone <your-repository-url>
cd <repository-name>
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
Create a `.env` file in the root directory with your Google Cloud credentials:
```
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/credentials.json
```

## Running the Application

1. Start the server:
```bash
npm start
# or
yarn start
```

2. Open your browser and navigate to `http://localhost:5000`

## Project Structure

- `client/` - Frontend React application
- `server/` - Backend Node.js server
- `ai/` - TensorFlow.js model and related files

## Technologies Used

- React
- Node.js
- Express
- Socket.IO
- TensorFlow.js
- Google Cloud Speech-to-Text API

## License

MIT
