const path = require('path');
const fs = require('fs');

class SignLanguageHandler {
  constructor() {
    this.modelPath = path.join(__dirname, '../../ai/hand_gesture_model.keras');
  }

  async getModel() {
    try {
      // Check if model file exists
      if (!fs.existsSync(this.modelPath)) {
        throw new Error('Model file not found. Please ensure the model file exists in the ai directory.');
      }

      // Read the model file
      const modelBuffer = await fs.promises.readFile(this.modelPath);
      return modelBuffer;
    } catch (error) {
      console.error('Error reading model file:', error);
      throw error;
    }
  }

  mapClassToText(classIndex) {
    // This mapping should match the classes used during model training
    const signMap = {
      0: 'Hello',
      1: 'Thank you',
      2: 'Please',
      3: 'Goodbye',
      4: 'Yes',
      5: 'No',
      // Add more mappings based on your model's classes
    };

    return signMap[classIndex] || 'Unknown sign';
  }
}

module.exports = new SignLanguageHandler(); 