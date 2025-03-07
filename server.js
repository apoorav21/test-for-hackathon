const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const app = express();

// Enable CORS for all routes
app.use(cors());

// Serve static files from the client build directory
app.use(express.static(path.join(__dirname, 'client/build')));

// API endpoint to get model info
app.get('/api/model/info', (req, res) => {
  const modelDir = path.join(__dirname, 'ai/models/tfjs_model');
  console.log('Checking model directory:', modelDir);
  
  try {
    if (!fs.existsSync(modelDir)) {
      console.error('Model directory not found:', modelDir);
      return res.status(404).json({ error: 'Model directory not found' });
    }

    const files = fs.readdirSync(modelDir);
    console.log('Found model files:', files);
    
    res.json({
      files: files,
      modelPath: '/api/model'
    });
  } catch (error) {
    console.error('Error getting model info:', error);
    res.status(500).json({ error: 'Error getting model info' });
  }
});

// API endpoint to serve model files
app.get('/api/model/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'ai/models/tfjs_model', filename);
  console.log('Attempting to serve file:', filePath);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return res.status(404).json({ error: 'File not found' });
    }

    // Set content type based on file extension
    const ext = path.extname(filename);
    if (ext === '.json') {
      res.setHeader('Content-Type', 'application/json');
    } else if (ext === '.bin' || filename.includes('weights.bin')) {
      res.setHeader('Content-Type', 'application/octet-stream');
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

// Handle all other routes by serving the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 