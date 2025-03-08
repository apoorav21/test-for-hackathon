import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, BatchNormalization
from sklearn.model_selection import train_test_split
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SIGNS = ['HELLO', 'YES', 'NO', 'I LOVE YOU', 'GOOD', 'THANK YOU', 'Cute',"What","Who"]

class HandDataCollector:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7
        )
        self.mp_draw = mp.solutions.drawing_utils
        
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

def collect_data():
    collector = HandDataCollector()
    all_data = []
    all_labels = []
    
    cap = cv2.VideoCapture(0)
    
    for sign_idx, sign in enumerate(SIGNS):
        logger.info(f"\nCollecting data for: {sign}")
        logger.info("Press 'c' to start collecting")
        logger.info("Press 'r' to redo current sign")
        logger.info("Make the sign from different angles and positions")
        
        frames_collected = 0
        collecting = False
        sign_data = []
        sign_labels = []
        
        while frames_collected < 150:  # Increased sample size
            ret, frame = cap.read()
            if not ret:
                continue
                
            frame = cv2.flip(frame, 1)
            features, hand_landmarks = collector.extract_hand_features(frame)
            
            if hand_landmarks:
                for landmarks in hand_landmarks:
                    collector.mp_draw.draw_landmarks(
                        frame, landmarks, collector.mp_hands.HAND_CONNECTIONS)
            
            # Display instructions
            status = f"Collecting {sign}: {frames_collected}/150" if collecting else f"Press 'c' to collect {sign}"
            cv2.putText(frame, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame, "Move hand slightly between frames", (10, 60), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
            
            cv2.imshow('Collect Data', frame)
            
            key = cv2.waitKey(1)
            if key == ord('q'):
                break
            elif key == ord('c'):
                collecting = True
            elif key == ord('r'):
                frames_collected = 0
                collecting = False
                sign_data = []
                sign_labels = []
                logger.info(f"Resetting collection for {sign}")
            
            if collecting and features is not None:
                sign_data.append(features)
                sign_labels.append(sign_idx)
                frames_collected += 1
                
        all_data.extend(sign_data)
        all_labels.extend(sign_labels)
        logger.info(f"Collected {frames_collected} frames for {sign}")
    
    cap.release()
    cv2.destroyAllWindows()
    
    return np.array(all_data), np.array(all_labels)

def train_model(data, labels):
    # Split data with stratification
    X_train, X_val, y_train, y_val = train_test_split(
        data, labels, test_size=0.2, random_state=42, stratify=labels
    )
    
    # Convert labels to categorical
    y_train_cat = tf.keras.utils.to_categorical(y_train)
    y_val_cat = tf.keras.utils.to_categorical(y_val)
    
    # Create model with BatchNormalization
    model = Sequential([
        Dense(128, input_shape=(42,)),
        BatchNormalization(),
        tf.keras.layers.LeakyReLU(),
        Dropout(0.3),
        
        Dense(64),
        BatchNormalization(),
        tf.keras.layers.LeakyReLU(),
        Dropout(0.3),
        
        Dense(32),
        BatchNormalization(),
        tf.keras.layers.LeakyReLU(),
        Dropout(0.3),
        
        Dense(len(SIGNS), activation='softmax')
    ])
    
    # Compile with reduced learning rate
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # Train with callbacks
    history = model.fit(
        X_train, y_train_cat,
        validation_data=(X_val, y_val_cat),
        epochs=100,
        batch_size=32,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(
                monitor='val_accuracy',
                patience=15,
                restore_best_weights=True
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=5,
                min_lr=0.00001
            )
        ]
    )
    
    # Save model
    model.save('hand_gesture_model.keras')
    return model, history

def main():
    Path('ai/models').mkdir(parents=True, exist_ok=True)
    
    logger.info("Starting data collection...")
    data, labels = collect_data()
    
    if len(data) == 0:
        logger.error("No data collected!")
        return
    
    logger.info(f"Collected {len(data)} samples")
    logger.info("Distribution of signs:")
    for sign, count in zip(*np.unique(labels, return_counts=True)):
        logger.info(f"{SIGNS[sign]}: {count} samples")
    
    logger.info("Training model...")
    model, history = train_model(data, labels)
    
    # Print final results
    val_acc = max(history.history['val_accuracy'])
    train_acc = max(history.history['accuracy'])
    logger.info(f"Training accuracy: {train_acc:.2%}")
    logger.info(f"Validation accuracy: {val_acc:.2%}")

if __name__ == "__main__":
    main() 
