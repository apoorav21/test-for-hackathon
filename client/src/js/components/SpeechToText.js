import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const SpeechToText = ({ audioStream }) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (audioStream && isTranscribing) {
      startLiveTranscription();
    }

    return () => {
      stopLiveTranscription();
    };
  }, [audioStream, isTranscribing]);

  const startLiveTranscription = async () => {
    try {
      // Initialize socket connection
      socketRef.current = io({ path: '/bridge' });
      
      // Set up audio processing
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      streamRef.current = audioContextRef.current.createMediaStreamSource(audioStream);
      
      // Create script processor for audio processing
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // Connect audio nodes
      streamRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      // Handle audio processing
      processorRef.current.onaudioprocess = (e) => {
        if (socketRef.current && isTranscribing) {
          const audioData = e.inputBuffer.getChannelData(0);
          // Convert Float32Array to Int16Array for Google Speech-to-Text
          const int16Data = new Int16Array(audioData.length);
          for (let i = 0; i < audioData.length; i++) {
            int16Data[i] = Math.max(-1, Math.min(1, audioData[i])) * 0x7FFF;
          }
          socketRef.current.emit('audioData', int16Data.buffer);
        }
      };

      // Handle transcription results
      socketRef.current.on('transcription', ({ transcript, isFinal }) => {
        setTranscription(prev => {
          if (isFinal) {
            return prev + '\n' + transcript;
          }
          // Update interim results
          const lines = prev.split('\n');
          lines[lines.length - 1] = transcript;
          return lines.join('\n');
        });
      });

      // Handle errors
      socketRef.current.on('transcriptionError', (error) => {
        setError('Transcription error: ' + error);
      });

      // Start transcription
      socketRef.current.emit('startTranscription');
      setError('');
    } catch (err) {
      setError('Error starting live transcription: ' + err.message);
    }
  };

  const stopLiveTranscription = () => {
    if (socketRef.current) {
      socketRef.current.emit('stopTranscription');
      socketRef.current.disconnect();
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (streamRef.current) {
      streamRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
  };

  const toggleTranscription = () => {
    setIsTranscribing(!isTranscribing);
  };

  return (
    <div className="speech-to-text">
      <button
        onClick={toggleTranscription}
        className={`btn ${isTranscribing ? 'btn-danger' : 'btn-primary'}`}
        disabled={!audioStream}
      >
        {isTranscribing ? 'Stop Live Transcription' : 'Start Live Transcription'}
      </button>
      
      {error && <div className="error-message">{error}</div>}
      
      {transcription && (
        <div className="transcription">
          <h3>Live Transcription:</h3>
          <p>{transcription}</p>
        </div>
      )}
    </div>
  );
};

export default SpeechToText; 