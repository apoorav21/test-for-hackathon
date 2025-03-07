const http = require('http');
const express = require('express');
const config = require('../config');
const socket = require('./lib/socket');
const socketIO = require('socket.io');
const cors = require('cors');
const speech = require('@google-cloud/speech');
const path = require('path');
const fs = require('fs');
const users = require('./lib/users');
const signLanguageHandler = require('./lib/signLanguageHandler');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  path: '/bridge'
});

// Initialize Speech-to-Text client with credentials from environment variable
const speechClient = new speech.SpeechClient({
  credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 
    JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS) : 
    undefined
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from the client dist directory
app.use(express.static(path.join(__dirname, '../client/dist')));

// API endpoint to get model info
app.get('/api/model/info', (req, res) => {
  const modelDir = path.join(__dirname, '../ai/models/tfjs_model');
  console.log('Checking model directory:', modelDir);
  
  try {
    if (!fs.existsSync(modelDir)) {
      console.error('Model directory not found:', modelDir);
      return res.status(404).json({ error: 'Model directory not found' });
    }

    const files = fs.readdirSync(modelDir);
    console.log('Found model files:', files);
    
    // Read model.json to get the weights manifest
    const modelJsonPath = path.join(modelDir, 'model.json');
    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
    
    // Create a manifest for the model files
    const manifest = {
      files: files,
      modelPath: '/api/model',
      modelTopology: '/api/model/model.json',
      weightsManifest: [{
        paths: ['weights.bin.data-00000-of-00001'],
        weights: modelJson.weightsManifest[0].weights
      }]
    };
    
    console.log('Sending manifest:', JSON.stringify(manifest, null, 2));
    res.json(manifest);
  } catch (error) {
    console.error('Error getting model info:', error);
    res.status(500).json({ error: 'Error getting model info' });
  }
});

// API endpoint to serve model files
app.get('/api/model/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../ai/models/tfjs_model', filename);
  console.log('Attempting to serve file:', filePath);
  
  try {
    // Handle the case where the client requests weights.bin
    if (filename === 'weights.bin') {
      const actualWeightsPath = path.join(__dirname, '../ai/models/tfjs_model', 'weights.bin.data-00000-of-00001');
      if (!fs.existsSync(actualWeightsPath)) {
        console.error('Weights file not found:', actualWeightsPath);
        return res.status(404).json({ error: 'Weights file not found' });
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const fileContent = fs.readFileSync(actualWeightsPath);
      res.send(fileContent);
      console.log('Weights file sent successfully');
      return;
    }

    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return res.status(404).json({ error: 'File not found' });
    }

    // Set content type based on file extension
    const ext = path.extname(filename);
    if (ext === '.json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Read and modify the model.json file
      const modelJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Update the weights manifest paths
      if (modelJson.weightsManifest && modelJson.weightsManifest[0]) {
        modelJson.weightsManifest[0].paths = ['weights.bin.data-00000-of-00001'];
      }
      
      // Send the modified model.json
      res.send(JSON.stringify(modelJson));
      console.log('Modified model.json sent successfully');
      return;
    } else if (filename === 'weights.bin.data-00000-of-00001') {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    // Read and send file
    const fileContent = fs.readFileSync(filePath);
    res.send(fileContent);
    console.log('File sent successfully:', filename);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
});

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
  let translationInterval = null;
  
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

  // Handle sign language translation streaming
  socket.on('startTranslation', () => {
    try {
      socket.emit('translationStarted');
      
      // Set up interval to process video frames
      translationInterval = setInterval(async () => {
        try {
          // Request frame from client
          socket.emit('requestFrame');
        } catch (error) {
          console.error('Error in translation interval:', error);
          socket.emit('translationError', error.message);
        }
      }, 1000); // Process one frame per second
    } catch (error) {
      console.error('Error starting translation:', error);
      socket.emit('translationError', error.message);
    }
  });

  socket.on('frameData', async (frameData) => {
    try {
      // The client will handle the prediction
      socket.emit('translation', { text: frameData, isFinal: true });
    } catch (error) {
      console.error('Error processing frame:', error);
      socket.emit('translationError', error.message);
    }
  });

  socket.on('stopTranslation', () => {
    try {
      if (translationInterval) {
        clearInterval(translationInterval);
        translationInterval = null;
      }
      socket.emit('translationStopped');
    } catch (error) {
      console.error('Error stopping translation:', error);
      socket.emit('translationError', error.message);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    try {
      if (recognizeStream && !recognizeStream.destroyed) {
        recognizeStream.end();
        recognizeStream = null;
      }
      if (translationInterval) {
        clearInterval(translationInterval);
        translationInterval = null;
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
