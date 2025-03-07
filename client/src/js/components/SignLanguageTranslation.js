import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import * as tf from '@tensorflow/tfjs';
import { processVideoStream } from '../utils/videoUtils';
import '../../css/sign-language.scss';

const SignLanguageTranslation = ({ videoStream }) => {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState('');
  const [model, setModel] = useState(null);
  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const translationRef = useRef(null);
  const isStreamActiveRef = useRef(false);
  const stopProcessingRef = useRef(null);

  // Load the model when component mounts
  useEffect(() => {
    const loadModel = async () => {
      try {
        console.log('Starting model load...');
        
        // First, get the model JSON
        const modelJsonResponse = await fetch('/api/model/model.json');
        if (!modelJsonResponse.ok) {
          throw new Error(`Failed to load model.json: ${modelJsonResponse.status}`);
        }
        const modelJson = await modelJsonResponse.json();
        console.log('Model JSON loaded:', modelJson);
        
        // Create model from architecture
        console.log('Creating model from architecture...');
        const model = await tf.models.modelFromJSON(modelJson);
        console.log('Model created from architecture:', model);
        
        if (!model) {
          throw new Error('Failed to create model from architecture');
        }
        
        // Load weights using the weights manifest
        const weightsManifest = modelJson.weightsManifest[0];
        console.log('Loading weights from manifest:', weightsManifest);
        
        // Load weights using TensorFlow.js's built-in functionality
        console.log('Loading weights into model...');
        await model.loadWeights('/api/model/weights.bin.data-00000-of-00001');
        console.log('Weights loaded successfully');
        
        // Verify model is ready
        console.log('Verifying model with test prediction...');
        const testInput = tf.zeros([1, 42]);
        const testOutput = await model.predict(testInput);
        console.log('Model test prediction shape:', testOutput.shape);
        console.log('Model test prediction:', testOutput.dataSync());
        tf.dispose([testInput, testOutput]);
        
        console.log('Model loaded successfully:', model);
        setModel(model);
      } catch (err) {
        console.error('Error loading model:', err);
        console.error('Error stack:', err.stack);
        setError('Error loading model: ' + (err.message || 'Unknown error'));
      }
    };

    loadModel();
  }, []);

  useEffect(() => {
    if (videoStream && isTranslating && model) {
      console.log('Starting translation with model:', model);
      startLiveTranslation();
    }

    return () => {
      stopLiveTranslation();
    };
  }, [videoStream, isTranslating, model]);

  useEffect(() => {
    if (translationRef.current) {
      translationRef.current.scrollTop = translationRef.current.scrollHeight;
    }
  }, [translation]);

  const preprocessFrame = async (frame) => {
    try {
      console.log('Preprocessing frame...');
      
      // Convert frame to tensor
      const tensor = tf.browser.fromPixels(frame);
      console.log('Frame converted to tensor:', tensor.shape);
      
      // Resize to a smaller size for hand landmark detection
      const resized = tf.image.resizeBilinear(tensor, [224, 224]);
      console.log('Frame resized:', resized.shape);
      
      // Convert to float32 and normalize pixel values
      const float32 = resized.toFloat();
      const normalized = float32.div(255.0);
      
      // Extract hand landmarks (simplified version)
      // In a real implementation, you would use MediaPipe or similar
      // For now, we'll create a dummy feature vector
      const features = tf.zeros([42]); // 21 landmarks * 2 coordinates
      
      // Add batch dimension
      const batched = features.expandDims(0);
      console.log('Features batched:', batched.shape);
      
      // Clean up intermediate tensors
      tf.dispose([tensor, resized, float32, normalized, features]);
      
      return batched;
    } catch (error) {
      console.error('Error preprocessing frame:', error);
      throw error;
    }
  };

  const predictSign = async (frame) => {
    try {
      if (!model) {
        throw new Error('Model not loaded');
      }
      
      console.log('Starting prediction...');
      const preprocessedFrame = await preprocessFrame(frame);
      
      if (!preprocessedFrame) {
        throw new Error('Failed to preprocess frame');
      }
      
      // Get prediction
      console.log('Running model prediction...');
      const prediction = await model.predict(preprocessedFrame);
      
      if (!prediction) {
        throw new Error('Failed to get prediction');
      }
      
      console.log('Prediction shape:', prediction.shape);
      console.log('Raw prediction:', prediction.dataSync());
      
      // Get the predicted class index
      const predictedClass = prediction.argMax(1).dataSync()[0];
      console.log('Predicted class:', predictedClass);
      
      // Map class index to sign language text
      const signMap = {
        0: 'HELLO',
        1: 'YES',
        2: 'NO',
        3: 'I LOVE YOU',
        4: 'GOOD'
      };
      
      const signText = signMap[predictedClass] || 'Unknown sign';
      console.log('Translated sign:', signText);
      
      // Clean up tensors
      tf.dispose([preprocessedFrame, prediction]);
      
      return signText;
    } catch (error) {
      console.error('Error predicting sign:', error);
      throw error;
    }
  };

  const startLiveTranslation = async () => {
    try {
      console.log('Starting live translation...');
      // Initialize socket connection
      socketRef.current = io({ path: '/bridge' });
      
      // Set up video processing
      if (videoRef.current) {
        videoRef.current.srcObject = videoStream;
        console.log('Video stream set up:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
      }

      // Handle translation results
      socketRef.current.on('translation', ({ text, isFinal }) => {
        console.log('Received translation:', text, 'isFinal:', isFinal);
        setTranslation(prev => {
          if (isFinal) {
            return prev + '\n' + text;
          }
          // Update interim results
          const lines = prev.split('\n');
          lines[lines.length - 1] = text;
          return lines.join('\n');
        });
      });

      // Handle translation started
      socketRef.current.on('translationStarted', () => {
        console.log('Translation started');
        isStreamActiveRef.current = true;
        setError('');
      });

      // Handle translation stopped
      socketRef.current.on('translationStopped', () => {
        console.log('Translation stopped');
        isStreamActiveRef.current = false;
      });

      // Handle errors
      socketRef.current.on('translationError', (error) => {
        console.error('Translation error:', error);
        setError('Translation error: ' + error);
        isStreamActiveRef.current = false;
      });

      // Handle frame requests
      socketRef.current.on('requestFrame', async () => {
        if (videoRef.current && isStreamActiveRef.current) {
          try {
            console.log('Processing frame request...');
            const canvas = canvasRef.current;
            const video = videoRef.current;
            
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Draw current video frame on canvas
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Get prediction
            const prediction = await predictSign(canvas);
            console.log('Sending prediction:', prediction);
            socketRef.current.emit('frameData', prediction);
          } catch (error) {
            console.error('Error processing frame:', error);
            socketRef.current.emit('translationError', error.message);
          }
        }
      });

      // Start translation
      socketRef.current.emit('startTranslation');
    } catch (err) {
      console.error('Error in startLiveTranslation:', err);
      setError('Error starting live translation: ' + err.message);
      isStreamActiveRef.current = false;
    }
  };

  const stopLiveTranslation = () => {
    console.log('Stopping live translation...');
    if (socketRef.current) {
      socketRef.current.emit('stopTranslation');
      socketRef.current.disconnect();
    }
    if (stopProcessingRef.current) {
      stopProcessingRef.current();
      stopProcessingRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    isStreamActiveRef.current = false;
  };

  const toggleTranslation = () => {
    console.log('Toggling translation, current state:', isTranslating);
    if (!isTranslating) {
      setIsTranslating(true);
    } else {
      setIsTranslating(false);
      stopLiveTranslation();
    }
  };

  return (
    <div className="sign-language-translation">
      <button
        onClick={toggleTranslation}
        className={`btn ${isTranslating ? 'btn-danger' : 'btn-primary'}`}
        disabled={!videoStream || !model}
      >
        {isTranslating ? 'Stop Sign Translation' : 'Start Sign Translation'}
      </button>
      
      {error && <div className="error-message">{error}</div>}
      
      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="video-preview"
        />
        <canvas
          ref={canvasRef}
          className="canvas-overlay"
          style={{ display: 'none' }}
        />
      </div>

      {translation && (
        <div className="translation" ref={translationRef}>
          <h3>Sign Language Translation:</h3>
          <p>{translation}</p>
        </div>
      )}
    </div>
  );
};

export default SignLanguageTranslation; 