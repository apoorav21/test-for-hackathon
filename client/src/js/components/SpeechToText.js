import React, { useState, useEffect } from 'react';
import speech from '@google-cloud/speech';

const SpeechToText = ({ audioStream }) => {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    if (audioStream && isListening) {
      startSpeechToText();
    }
  }, [audioStream, isListening]);

  const startSpeechToText = async () => {
    try {
      // Initialize the Speech-to-Text client with credentials
      const client = new speech.SpeechClient({
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 
          JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS) : 
          undefined
      });

      const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        languageCode: 'en-US',
        model: 'default',
        useEnhanced: true,
      };

      const request = {
        config,
        interimResults: true,
      };

      // Create a recognize stream
      const recognizeStream = client
        .streamingRecognize(request)
        .on('error', console.error)
        .on('data', (data) => {
          if (data.results[0] && data.results[0].alternatives[0]) {
            setTranscript(data.results[0].alternatives[0].transcript);
          }
        });

      // Pipe the audio stream to the recognize stream
      audioStream.pipe(recognizeStream);

      return () => {
        recognizeStream.end();
      };
    } catch (error) {
      console.error('Error starting speech-to-text:', error);
    }
  };

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  return (
    <div className="speech-to-text-container">
      <button
        className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
        onClick={toggleListening}
      >
        {isListening ? 'Stop Transcription' : 'Start Transcription'}
      </button>
      <div className="transcript-box mt-3">
        <h4>Transcript:</h4>
        <p>{transcript}</p>
      </div>
    </div>
  );
};

export default SpeechToText; 