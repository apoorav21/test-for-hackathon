const http = require('http');
const express = require('express');
const config = require('../config');
const socket = require('./lib/socket');
const socketIO = require('socket.io');
const cors = require('cors');
const speech = require('@google-cloud/speech');
const path = require('path');
const users = require('./lib/users');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  path: '/bridge'
});

// Initialize Speech-to-Text client
const speechClient = new speech.SpeechClient({
  keyFilename: path.join(__dirname, 'google-credentials.json')
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/', express.static(`${__dirname}/../client/dist`));

// Speech-to-Text endpoint for one-time transcription
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioData } = req.body;
    const audio = {
      content: audioData
    };

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      model: 'default',
      useEnhanced: true,
    };

    const request = {
      audio: audio,
      config: config,
    };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    res.json({ transcription });
  } catch (error) {
    console.error('Error transcribing audio:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// Handle socket connections
io.on('connection', (socket) => {
  let id;
  let recognizeStream = null;
  
  // Initialize user ID
  socket.on('init', async () => {
    id = await users.create(socket);
    if (id) {
      socket.emit('init', { id });
    } else {
      socket.emit('error', { message: 'Failed to generating user id' });
    }
  });

  // Handle call requests
  socket.on('request', (data) => {
    const receiver = users.get(data.to);
    if (receiver) {
      receiver.emit('request', { from: id });
    }
  });

  // Handle call data
  socket.on('call', (data) => {
    const receiver = users.get(data.to);
    if (receiver) {
      receiver.emit('call', { ...data, from: id });
    } else {
      socket.emit('failed');
    }
  });

  // Handle call end
  socket.on('end', (data) => {
    const receiver = users.get(data.to);
    if (receiver) {
      receiver.emit('end');
    }
  });

  // Handle speech-to-text streaming
  socket.on('startTranscription', () => {
    try {
      const request = {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 48000,
          languageCode: 'en-US',
          model: 'default',
          useEnhanced: true,
        },
        interimResults: true,
      };

      recognizeStream = speechClient
        .streamingRecognize(request)
        .on('error', (error) => {
          console.error('Streaming recognition error:', error);
          socket.emit('transcriptionError', error.message);
        })
        .on('data', (data) => {
          if (data.results[0] && data.results[0].alternatives[0]) {
            const transcript = data.results[0].alternatives[0].transcript;
            const isFinal = data.results[0].isFinal;
            socket.emit('transcription', { transcript, isFinal });
          }
        });

      socket.emit('transcriptionStarted');
    } catch (error) {
      console.error('Error starting transcription:', error);
      socket.emit('transcriptionError', error.message);
    }
  });

  socket.on('audioData', (audioData) => {
    try {
      if (recognizeStream && !recognizeStream.destroyed) {
        recognizeStream.write(audioData);
      }
    } catch (error) {
      console.error('Error writing audio data:', error);
      socket.emit('transcriptionError', error.message);
    }
  });

  socket.on('stopTranscription', () => {
    try {
      if (recognizeStream && !recognizeStream.destroyed) {
        recognizeStream.end();
        recognizeStream = null;
        socket.emit('transcriptionStopped');
      }
    } catch (error) {
      console.error('Error stopping transcription:', error);
      socket.emit('transcriptionError', error.message);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    try {
      if (recognizeStream && !recognizeStream.destroyed) {
        recognizeStream.end();
        recognizeStream = null;
      }
    } catch (error) {
      console.error('Error cleaning up stream:', error);
    }
    users.remove(id);
    console.log(id, 'disconnected');
  });
});

server.listen(config.PORT, () => {
  console.log('Server is listening at :', config.PORT);
});
