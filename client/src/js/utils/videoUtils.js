/**
 * Captures a frame from a video stream and converts it to a format suitable for the model
 * @param {HTMLVideoElement} videoElement - The video element to capture from
 * @returns {Promise<Buffer>} - The captured frame as a buffer
 */
export const captureFrame = async (videoElement) => {
  return new Promise((resolve, reject) => {
    try {
      // Create a canvas element
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      
      // Draw the current video frame on the canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Convert the canvas to a blob
      canvas.toBlob((blob) => {
        if (blob) {
          // Convert blob to buffer
          const reader = new FileReader();
          reader.onload = () => {
            const buffer = Buffer.from(reader.result);
            resolve(buffer);
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      }, 'image/jpeg', 0.8); // Use JPEG format with 0.8 quality
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Processes a video stream and sends frames to the server
 * @param {MediaStream} videoStream - The video stream to process
 * @param {Function} onFrame - Callback function to handle each frame
 * @param {number} interval - Interval between frame captures in milliseconds
 * @returns {Function} - Function to stop the frame processing
 */
export const processVideoStream = (videoStream, onFrame, interval = 1000) => {
  const videoElement = document.createElement('video');
  videoElement.srcObject = videoStream;
  videoElement.play();

  const captureInterval = setInterval(async () => {
    try {
      const frame = await captureFrame(videoElement);
      onFrame(frame);
    } catch (error) {
      console.error('Error capturing frame:', error);
    }
  }, interval);

  // Return function to stop processing
  return () => {
    clearInterval(captureInterval);
    videoElement.srcObject = null;
  };
}; 