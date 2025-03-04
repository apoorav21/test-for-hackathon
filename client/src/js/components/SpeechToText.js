import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import '../../css/speech-to-text.scss';

const SpeechToText = ({ audioStream, peerStream }) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const transcriptionRef = useRef(null);
  const isStreamActiveRef = useRef(false);

  useEffect(() => {
    if ((audioStream || peerStream) && isTranscribing) {
      startLiveTranscription();
    }

    return () => {
      stopLiveTranscription();
    };
  }, [audioStream, peerStream, isTranscribing]);

  useEffect(() => {
    if (transcriptionRef.current) {
      transcriptionRef.current.scrollTop = transcriptionRef.current.scrollHeight;
    }
  }, [transcription]);

  const startLiveTranscription = async () => {
    try {
      // Initialize socket connection
      socketRef.current = io({ path: '/bridge' });
      
      // Set up audio processing
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create script processor for audio processing
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // Connect local stream if available
      if (audioStream) {
        const localSource = audioContextRef.current.createMediaStreamSource(audioStream);
        localSource.connect(processorRef.current);
      }
      
      // Connect remote stream if available
      if (peerStream) {
        const remoteSource = audioContextRef.current.createMediaStreamSource(peerStream);
        remoteSource.connect(processorRef.current);
      }

      // Connect processor to destination
      processorRef.current.connect(audioContextRef.current.destination);

      // Handle audio processing
      processorRef.current.onaudioprocess = (e) => {
        if (socketRef.current && isTranscribing && isStreamActiveRef.current) {
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

      // Handle transcription started
      socketRef.current.on('transcriptionStarted', () => {
        isStreamActiveRef.current = true;
        setError('');
      });

      // Handle transcription stopped
      socketRef.current.on('transcriptionStopped', () => {
        isStreamActiveRef.current = false;
      });

      // Handle errors
      socketRef.current.on('transcriptionError', (error) => {
        setError('Transcription error: ' + error);
        isStreamActiveRef.current = false;
      });

      // Start transcription
      socketRef.current.emit('startTranscription');
    } catch (err) {
      setError('Error starting live transcription: ' + err.message);
      isStreamActiveRef.current = false;
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
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    isStreamActiveRef.current = false;
  };

  const toggleTranscription = () => {
    if (!isTranscribing) {
      setIsTranscribing(true);
    } else {
      setIsTranscribing(false);
      stopLiveTranscription();
    }
  };

  return (
    <div className="speech-to-text">
      <button
        onClick={toggleTranscription}
        className={`btn ${isTranscribing ? 'btn-danger' : 'btn-primary'}`}
        disabled={!audioStream && !peerStream}
      >
        {isTranscribing ? 'Stop Live Transcription' : 'Start Live Transcription'}
      </button>
      
      {error && <div className="error-message">{error}</div>}
      
      {transcription && (
        <div className="transcription" ref={transcriptionRef}>
          <h3>Live Transcription:</h3>
          <p>{transcription}</p>
        </div>
      )}
    </div>
  );
};

export default SpeechToText; 