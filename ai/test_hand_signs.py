import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SIGNS = ['HELLO', 'YES', 'NO', 'I LOVE YOU', 'GOOD', 'THANK YOU', 'Cute', 'What', 'Who']

class HandSignDetector:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7
        )
        self.mp_draw = mp.solutions.drawing_utils
        
        try:
            # Load the trained model
            model_path = os.path.abspath("hand_gesture_model.keras")  # Ensure correct path
            self.model = tf.keras.models.load_model(model_path)
            logger.info("Model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            raise

    def extract_hand_features(self, frame):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb_frame)
        
        if results.multi_hand_landmarks:
            landmarks = results.multi_hand_landmarks[0]
            center_x = sum(lm.x for lm in landmarks.landmark) / len(landmarks.landmark)
            center_y = sum(lm.y for lm in landmarks.landmark) / len(landmarks.landmark)
            
            max_dist = max(max(abs(lm.x - center_x), abs(lm.y - center_y)) 
                         for lm in landmarks.landmark)
            
            features = []
            for lm in landmarks.landmark:
                features.extend([
                    (lm.x - center_x) / max_dist,
                    (lm.y - center_y) / max_dist
                ])
            return np.array(features), results.multi_hand_landmarks
        return None, None

    def predict(self, frame):
        features, hand_landmarks = self.extract_hand_features(frame)
        
        if features is not None:
            prediction = self.model.predict(features.reshape(1, -1), verbose=0)[0]
            top_idx = np.argmax(prediction)
            return SIGNS[top_idx], hand_landmarks
        
        return None, None

def main():
    try:
        detector = HandSignDetector()
        cap = cv2.VideoCapture(0)
        
        logger.info("Starting webcam feed...")
        logger.info("Press 'q' to quit")
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                logger.error("Failed to grab frame")
                break
                
            frame = cv2.flip(frame, 1)
            
            # Get prediction
            sign, hand_landmarks = detector.predict(frame)
            
            # Draw hand landmarks
            if hand_landmarks:
                for landmarks in hand_landmarks:
                    detector.mp_draw.draw_landmarks(
                        frame, landmarks, detector.mp_hands.HAND_CONNECTIONS)
            
            # Display prediction
            if sign:
                cv2.putText(frame, sign, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # Display instructions
            cv2.putText(frame, "Show hand sign in frame", (10, frame.shape[0] - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            cv2.imshow('Hand Sign Detection', frame)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        
        cap.release()
        cv2.destroyAllWindows()
        
    except Exception as e:
        logger.error(f"Error during testing: {e}")
        raise

if __name__ == "__main__":
    main()
