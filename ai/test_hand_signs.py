import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SIGNS = ['HELLO', 'YES', 'NO', 'I LOVE YOU', 'GOOD']

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
            self.model = tf.keras.models.load_model('ai/models/hand_gesture_model.keras')
            logger.info("Model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            raise

    def extract_hand_features(self, frame):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb_frame)
        
        if results.multi_hand_landmarks:
            landmarks = results.multi_hand_landmarks[0]
            # Get hand center for better normalization
            center_x = sum(lm.x for lm in landmarks.landmark) / len(landmarks.landmark)
            center_y = sum(lm.y for lm in landmarks.landmark) / len(landmarks.landmark)
            
            # Calculate scale for normalization
            max_dist = max(max(abs(lm.x - center_x), abs(lm.y - center_y)) 
                         for lm in landmarks.landmark)
            
            features = []
            for lm in landmarks.landmark:
                # Normalize relative to hand center and scale
                features.extend([
                    (lm.x - center_x) / max_dist,
                    (lm.y - center_y) / max_dist
                ])
            return np.array(features), results.multi_hand_landmarks
        return None, None

    def predict(self, frame):
        features, hand_landmarks = self.extract_hand_features(frame)
        
        if features is not None:
            # Make prediction
            prediction = self.model.predict(features.reshape(1, -1), verbose=0)[0]
            
            # Get top 2 predictions
            top2_idx = np.argsort(prediction)[-2:][::-1]
            top2_pred = [(SIGNS[idx], float(prediction[idx])) for idx in top2_idx]
            
            return top2_pred, hand_landmarks
        
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
            predictions, hand_landmarks = detector.predict(frame)
            
            # Draw hand landmarks
            if hand_landmarks:
                for landmarks in hand_landmarks:
                    detector.mp_draw.draw_landmarks(
                        frame, landmarks, detector.mp_hands.HAND_CONNECTIONS)
            
            # Display predictions
            if predictions:
                # Display top prediction
                sign, conf = predictions[0]
                color = (0, 255, 0) if conf > 0.7 else (0, 165, 255)
                text = f"{sign}: {conf:.1%}"
                cv2.putText(frame, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
                
                # Display second prediction if confidence of top prediction is low
                if conf < 0.8:
                    sign2, conf2 = predictions[1]
                    text2 = f"{sign2}: {conf2:.1%}"
                    cv2.putText(frame, text2, (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2)
            
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